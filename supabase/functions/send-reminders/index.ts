// Sends the daily reminder as a Web Push notification.
//
// Invoked by pg_cron every five minutes. For each subscribed device it works
// out the local time in that user's own timezone, and if their reminder time
// has just passed and nothing has been sent today, it delivers the day's
// portion to the service worker - which shows it with the app fully closed.
//
// The scheduling engine is deliberately NOT reimplemented or copied here. A
// second copy would drift from the app and eventually put a wrong portion on
// a lock screen, which is worse than a vague one. So: if the day is already
// planned, the notification names the real portions; otherwise it states the
// size from the settings, which is arithmetic and cannot be wrong.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE = 'https://hifdh-seedsacademy.vercel.app';
// How long after the set time we will still deliver, so cron jitter or a brief
// outage does not silently swallow a day.
const GRACE_MINUTES = 90;

type Local = { date: string; minutes: number; isoWeekday: number };

function localNow(tz: string, now: Date): Local {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    }).formatToParts(now).map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    isoWeekday: order.indexOf(parts.weekday) + 1
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

type Task = { kind: string; label: string; pages: number[] | null;
              page_from: number; page_to: number; done: boolean };

const pageCount = (t: Task) =>
  t.kind === 'arabic' ? 0
  : (t.pages?.length ?? (t.page_to - t.page_from + 1));

// Best case: the day is already planned, so say exactly what is outstanding.
function bodyFromTasks(tasks: Task[]): string | null {
  const open = tasks.filter((t) => !t.done);
  if (!open.length) return null;                 // nothing to nag about
  const quran = open.filter((t) => t.kind !== 'arabic');
  if (!quran.length) return String(open[0].label);

  const pages = quran.reduce((n, t) => n + pageCount(t), 0);
  const named = quran.map((t) => (t.kind === 'sabaq' ? `New: ${t.label}` : t.label));
  return `${pages} page${pages === 1 ? '' : 's'} · ${named.join(' · ')}`;
}

// Fallback: the day has not been planned yet because the app has not been
// opened. The size comes straight from the settings, so it is always true even
// though it cannot name the surahs.
function bodyFromSettings(plan: Record<string, number[] | number | boolean>,
                          isoWeekday: number): string {
  const rest = (plan.rest_days as number[] ?? []).includes(isoWeekday);
  const lesson = (plan.lesson_days as number[] ?? []).includes(isoWeekday);
  if (rest && !lesson) return 'Rest day. Nothing to revise.';

  let pages = rest ? 0
    : (plan.sabqi_pages_per_day as number) + (plan.manzil_pages_per_day as number);
  if (lesson) pages += plan.new_pages_per_lesson as number;

  if (pages <= 0) return 'Your revision is waiting.';
  return `${pages} page${pages === 1 ? '' : 's'} to revise` + (lesson ? ', including a new page' : '');
}

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: cfg, error: cfgErr } = await admin
    .from('push_config').select('*').eq('id', 1).single();
  if (cfgErr || !cfg) {
    return new Response(JSON.stringify({ error: 'no push config' }), { status: 500 });
  }

  // Only our own cron may fire this.
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const force  = url.searchParams.get('force') === '1';   // ignore the time window

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, last_sent_on, failures');

  const now = new Date();
  const report: Array<Record<string, unknown>> = [];

  for (const sub of subs ?? []) {
    const { data: settings } = await admin
      .from('settings').select('reminder_time, timezone')
      .eq('user_id', sub.user_id).maybeSingle();
    if (!settings?.reminder_time) { report.push({ sub: sub.id, skip: 'no reminder set' }); continue; }

    const tz = settings.timezone || 'UTC';
    let local: Local;
    try { local = localNow(tz, now); }
    catch { report.push({ sub: sub.id, skip: `bad timezone ${tz}` }); continue; }

    const due = toMinutes(String(settings.reminder_time).slice(0, 5));
    const past = local.minutes - due;
    const inWindow = past >= 0 && past <= GRACE_MINUTES;

    if (!force) {
      if (sub.last_sent_on === local.date) { report.push({ sub: sub.id, skip: 'already sent today' }); continue; }
      if (!inWindow) { report.push({ sub: sub.id, skip: `not due (local ${local.minutes}m vs ${due}m)` }); continue; }
    }

    // Prefer the real, already-planned day; fall back to the stated size.
    const { data: tasks } = await admin
      .from('daily_tasks')
      .select('kind, label, pages, page_from, page_to, done')
      .eq('user_id', sub.user_id).eq('task_date', local.date).eq('carried_away', false);

    const { data: plan } = await admin
      .from('plan_config').select('*').eq('user_id', sub.user_id).maybeSingle();

    let body: string | null = null;
    if (tasks && tasks.length) body = bodyFromTasks(tasks as Task[]);
    else if (plan) body = bodyFromSettings(plan, local.isoWeekday);

    // Everything for today is already done - do not interrupt them to say so.
    if (!body) { report.push({ sub: sub.id, skip: 'nothing outstanding' }); continue; }

    const payload = JSON.stringify({
      title: 'Time to revise', body, url: SITE, tag: 'hifdh-daily'
    });

    if (dryRun) { report.push({ sub: sub.id, would_send: body, local }); continue; }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      await admin.from('push_subscriptions')
        .update({ last_sent_on: local.date, failures: 0 }).eq('id', sub.id);
      report.push({ sub: sub.id, sent: body });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410 mean the device uninstalled or the subscription expired.
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        report.push({ sub: sub.id, removed: 'gone' });
      } else {
        await admin.from('push_subscriptions')
          .update({ failures: (sub.failures ?? 0) + 1 }).eq('id', sub.id);
        report.push({ sub: sub.id, error: String(e), status });
      }
    }
  }

  return new Response(JSON.stringify({ checked: (subs ?? []).length, report }, null, 2),
    { headers: { 'Content-Type': 'application/json' } });
});
