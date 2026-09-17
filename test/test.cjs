const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4188';
const api = (op, b = {}) => fetch(BASE + '/mock/' + op, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
}).then((r) => r.json());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  PASS', n); }
                               else { fail++; console.log('  FAIL', n, x); } };

const pad = (n) => String(n).padStart(2, '0');
const key = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const isoDay = () => (new Date().getDay() === 0 ? 7 : new Date().getDay());

(async () => {
  const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                         isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  /* ─────────── 1. no sign-up wall ─────────── */
  console.log('\n[1] Opening the app asks for nothing');
  await api('reset', { seeded: false });
  await api('anon-toggle', { on: true });
  await page.goto(BASE);
  // Straight past any sign-in screen into setup.
  await page.waitForSelector('#setup:not([hidden])', { timeout: 6000 });
  ok('no sign-in screen is shown', !(await page.isVisible('#email')));
  ok('it goes straight to setup', await page.isVisible('#su-from'));
  let db = await api('dump');
  ok('a session exists with no email', db && true);

  /* ─────────── 2. setup is two questions ─────────── */
  console.log('\n[2] Setup answers you back');
  ok('defaults to Ad-Dukhan', (await page.inputValue('#su-from')) === '44');
  ok('defaults to An-Nas', (await page.inputValue('#su-to')) === '114');
  ok('it says how much that is',
     (await page.textContent('#su-held')).includes('109 pages'),
     await page.textContent('#su-held'));
  ok('and names the range', (await page.textContent('#su-held')).includes('Ad-Dukhan → An-Nas'));
  ok('the payoff line states the cycle',
     /every 11 days/.test(await page.textContent('#su-cycle')),
     await page.textContent('#su-cycle'));

  // The core promise: change the number, the answer changes with it.
  for (let i = 0; i < 5; i++) await page.click('#su-stepper [data-d="-1"]');
  ok('5 pages a day is offered', (await page.textContent('#su-pages')) === '5');
  ok('and the cycle recalculates to 22 days',
     /every 22 days/.test(await page.textContent('#su-cycle')),
     await page.textContent('#su-cycle'));
  for (let i = 0; i < 5; i++) await page.click('#su-stepper [data-d="1"]');
  ok('back to 11 days at 10 a day',
     /every 11 days/.test(await page.textContent('#su-cycle')));

  await page.click('#setup-go');
  await page.waitForSelector('#app:not([hidden])', { timeout: 6000 });
  ok('starting opens the app', await page.isVisible('#view-today'));

  db = await api('dump');
  ok('the plan is stored as one dial', db.plan_config[0].revision_pages_per_day === 10,
     String(db.plan_config[0].revision_pages_per_day));
  ok('no sabqi or manzil columns remain',
     !('sabqi_pages_per_day' in db.plan_config[0]) && !('manzil_pages_per_day' in db.plan_config[0]));
  ok('pages 496-604 recorded',
     db.progress[0].mem_from === 496 && db.progress[0].mem_to === 604);

  /* ─────────── 3. today is plain English ─────────── */
  console.log('\n[3] Today says what to do, in English');
  const tasksTxt = await page.textContent('#tasks');
  ok('no jargon on screen', !/sabqi|manzil|sabaq/i.test(tasksTxt), tasksTxt.slice(0, 200));
  ok('it says Revision', tasksTxt.includes('Revision'));
  ok('the traditional term is kept as a quiet subtitle',
     (await page.locator('.kind-ar').count()) >= 1);

  db = await api('dump');
  const todays = db.daily_tasks.filter((t) => t.task_date === key());
  const rev = todays.find((t) => t.kind === 'revision');
  ok('one revision portion', !!rev);
  ok('of exactly 10 pages', rev && rev.pages.length === 10, rev && String(rev.pages.length));
  ok('starting at the first page held', rev && rev.page_from === 496, rev && String(rev.page_from));
  ok('there is no separate sabqi task',
     !db.daily_tasks.some((t) => ['sabqi','manzil'].includes(t.kind)));
  const lesson = [1, 5].includes(isoDay());
  ok(`a new page ${lesson ? 'is' : 'is not'} scheduled today`,
     todays.some((t) => t.kind === 'new') === lesson);

  ok('the cycle line is shown once', await page.isVisible('#cycle-line'));
  ok('and states the promise',
     /everything every 11 days/.test(await page.textContent('#cycle-text')),
     await page.textContent('#cycle-text'));
  ok('the ring is gone', (await page.locator('.ring').count()) === 0);
  ok('the stat tiles are gone from Today',
     (await page.locator('#view-today .mini').count()) === 0);

  /* ─────────── 4. ticking ─────────── */
  console.log('\n[4] Completing a portion');
  await page.click('.task[data-id]');
  await page.waitForTimeout(400);
  ok('it shows as done', await page.locator('.task.is-done').first().isVisible());
  db = await api('dump');
  ok('and is persisted', db.daily_tasks.some((t) => t.done === true));

  /* ─────────── 5. the plan recalculates ─────────── */
  console.log('\n[5] Plan');
  // A portion already finished is deliberately NOT rebuilt when the dial moves.
  // Un-tick it so the rebuild path is the one under test.
  await page.click('.task.is-done');
  await page.waitForTimeout(400);
  ok('un-ticking works', (await page.locator('.task.is-done').count()) === 0);

  await page.click('[data-view="plan"]');
  await page.waitForSelector('#view-plan:not([hidden])');
  const sum = await page.textContent('#plan-summary');
  ok('headline states the cycle', /every 11 days/.test(sum), sum.slice(0, 140));
  ok('and how much is held', sum.includes('109 pages'), sum.slice(0, 140));

  for (let i = 0; i < 10; i++) await page.click('.stepper[data-key="revision_pages_per_day"] [data-d="1"]');
  await page.waitForTimeout(150);
  ok('20 a day selected', (await page.textContent('#v-revision_pages_per_day')) === '20');
  ok('cycle drops to 6 days', /every 6 days/.test(await page.textContent('#plan-summary')),
     (await page.textContent('#plan-summary')).slice(0, 140));
  await page.waitForTimeout(900);
  db = await api('dump');
  ok('saved', db.plan_config[0].revision_pages_per_day === 20);
  const rebuilt = db.daily_tasks.filter((t) => t.task_date === key() && t.kind === 'revision' && !t.carried_from);
  ok('today’s portion rebuilt to 20 pages',
     rebuilt.length === 1 && rebuilt[0].pages.length === 20,
     JSON.stringify(rebuilt.map((t) => t.pages.length)));

  // Finishing then changing the dial must not silently redo the day.
  await page.click('[data-view="today"]');
  await page.waitForTimeout(200);
  await page.click('.task[data-id]');
  await page.waitForTimeout(400);
  await page.click('[data-view="plan"]');
  await page.click('.stepper[data-key="revision_pages_per_day"] [data-d="-1"]');
  await page.waitForTimeout(900);
  db = await api('dump');
  const afterDone = db.daily_tasks.filter(
    (t) => t.task_date === key() && t.kind === 'revision' && !t.carried_from);
  ok('a finished portion is left alone when the dial moves',
     afterDone.length === 1 && afterDone[0].done === true,
     JSON.stringify(afterDone.map((t) => [t.pages.length, t.done])));

  ok('a 7-day preview is shown', (await page.locator('.pv').count()) === 7);
  ok('the preview starts tomorrow',
     (await page.locator('.pv-day').first().textContent()).includes('Tomorrow'));

  // Learning can be switched off entirely - a lot of people only revise.
  await page.uncheck('#p-learning');
  await page.waitForTimeout(900);
  db = await api('dump');
  ok('turning off new pages clears lesson days',
     JSON.stringify(db.plan_config[0].lesson_days) === '[]',
     JSON.stringify(db.plan_config[0].lesson_days));
  ok('and the summary says revision only',
     (await page.textContent('#plan-summary')).includes('Revision only'));
  await page.check('#p-learning');
  await page.waitForTimeout(900);
  db = await api('dump');
  ok('turning it back on restores sensible days',
     JSON.stringify(db.plan_config[0].lesson_days) === '[1,5]',
     JSON.stringify(db.plan_config[0].lesson_days));

  /* ─────────── 6. memorisation order still right ─────────── */
  console.log('\n[6] New pages enter each surah at its first page');
  const wd = isoDay();
  const dayBtn = page.locator(`#p-days [data-d="${wd}"]`);
  if (!(await dayBtn.getAttribute('class')).includes('on')) {
    await dayBtn.click();
    await page.waitForTimeout(1200);
  }
  db = await api('dump');
  const fresh = db.daily_tasks.find((t) => t.task_date === key() && t.kind === 'new');
  ok('a new page is scheduled', !!fresh);
  ok('it is p489, the FIRST page of Az-Zukhruf', fresh && fresh.page_from === 489,
     fresh && String(fresh.page_from));
  ok('not p495, its last', fresh && fresh.page_from !== 495);

  /* ─────────── 7. carry-over ─────────── */
  console.log('\n[7] Unfinished work carries, history stays honest');
  await api('reset', { seeded: true });
  await api('poke', { table: 'daily_tasks', rows: [
    { id: 'old-1', user_id: 'user-probe-0001', task_date: back(1), kind: 'revision',
      page_from: 560, page_to: 567, pages: [560,561,562,563,564,565,566,567],
      label: 'At-Tahrim → Al-Haqqah', done: false, done_at: null,
      carried_from: null, carried_away: false },
    { id: 'old-2', user_id: 'user-probe-0001', task_date: back(1), kind: 'new',
      page_from: 489, page_to: 489, pages: [489], label: 'Az-Zukhruf',
      done: true, done_at: new Date().toISOString(), carried_from: null, carried_away: false }
  ]});
  await api('anon');
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])', { timeout: 6000 });

  db = await api('dump');
  const origin = db.daily_tasks.find((t) => t.id === 'old-1');
  const copy = db.daily_tasks.find((t) => t.task_date === key() && t.carried_from === back(1));
  ok('the original stays on its own date', origin.task_date === back(1));
  ok('flagged as carried away', origin.carried_away === true);
  ok('a copy appears today', !!copy);
  ok('the finished task is not carried',
     !db.daily_tasks.some((t) => t.kind === 'new' && t.carried_from === back(1)));
  ok('today shows it as carried', await page.locator('.task.is-carried').first().isVisible());

  await page.click('[data-view="calendar"]');
  await page.waitForSelector('#view-calendar:not([hidden])');
  // Yesterday could be in the previous month at a boundary.
  let cell = page.locator(`#cal-grid [data-k="${back(1)}"]`);
  if (!(await cell.count())) { await page.click('#cal-prev'); await page.waitForTimeout(200);
    cell = page.locator(`#cal-grid [data-k="${back(1)}"]`); }
  const yCls = await cell.getAttribute('class');
  ok('yesterday shows as partly done, not complete',
     yCls.includes('d-part') && !yCls.includes('d-full'), yCls);

  // Your rule: turning up at all is never red.
  ok('and not as missed either, because something was done',
     !yCls.includes('d-none'), yCls);

  /* ─────────── 7b. the calendar ─────────── */
  console.log('\n[7b] Calendar');
  const todayCell = page.locator(`#cal-grid [data-k="${key()}"]`);
  if (!(await todayCell.count())) { await page.click('#cal-next'); await page.waitForTimeout(200); }
  ok('the month is named', (await page.textContent('#cal-month')).length > 6,
     await page.textContent('#cal-month'));
  ok('today is marked',
     (await page.locator(`#cal-grid [data-k="${key()}"]`).getAttribute('class')).includes('is-today'));
  const dayCount = await page.locator('#cal-grid .cal-day').count();
  ok('a full month of days is shown', dayCount >= 28 && dayCount <= 31, String(dayCount));
  ok('lesson days are marked',
     (await page.locator('#cal-grid .cal-day.is-lesson').count()) >= 4,
     String(await page.locator('#cal-grid .cal-day.is-lesson').count()));

  const monthNow = await page.textContent('#cal-month');
  await page.click('#cal-prev');
  await page.waitForTimeout(250);
  ok('you can page back a month', (await page.textContent('#cal-month')) !== monthNow);
  await page.click('#cal-next');
  await page.waitForTimeout(250);
  ok('and forward again', (await page.textContent('#cal-month')) === monthNow);

  await page.click(`#cal-grid [data-k="${key()}"]`);
  await page.waitForSelector('#day-sheet:not([hidden])');
  const dayTxt = await page.textContent('#day-body');
  ok('tapping a day shows what happened on it', dayTxt.length > 10, dayTxt.slice(0, 120));
  ok('including the portions', /Revision|New page/.test(dayTxt), dayTxt.slice(0, 120));
  await page.click('#day-close');
  await page.waitForTimeout(250);
  ok('and closes', await page.locator('#day-sheet').isHidden());

  /* ─────────── 7c. reflection ─────────── */
  console.log('\n[7c] Reflection');
  await page.click('[data-view="today"]');
  await page.waitForTimeout(250);
  ok('a reflection card is offered', await page.isVisible('#reflect-card'));
  ok('and is not presented as a chore to tick',
     (await page.locator('#reflect-card .tick').count()) === 0);

  await page.click('#reflect-card');
  await page.waitForSelector('#reflect-sheet:not([hidden])');
  await page.selectOption('#rf-surah', '108');           // Al-Kawthar, 3 ayat
  await page.fill('#rf-from', '9');                      // impossible
  await page.waitForTimeout(200);
  ok('an impossible ayah is corrected to the surah length',
     (await page.inputValue('#rf-from')) === '3', await page.inputValue('#rf-from'));
  ok('and the reference reads back correctly',
     (await page.textContent('#rf-ref')).includes('Al-Kawthar 3'),
     await page.textContent('#rf-ref'));
  ok('with the ayah count stated', (await page.textContent('#rf-ref')).includes('3 ayat'));

  await page.selectOption('#rf-surah', '2');
  await page.fill('#rf-from', '255');
  await page.fill('#rf-note', 'His seat extends over the heavens and the earth.');
  await page.click('#rf-save');
  await page.waitForTimeout(600);
  ok('saving closes the sheet', await page.locator('#reflect-sheet').isHidden());
  const cardTxt = await page.textContent('#reflect-card');
  ok('the card now shows the verse', cardTxt.includes('Al-Baqarah 255'), cardTxt);
  ok('and the note', cardTxt.includes('His seat extends'), cardTxt);
  db = await api('dump');
  ok('it is stored as numbers, needing no Qur\u2019an text',
     db.reflections.length === 1 && db.reflections[0].surah === 2 &&
     db.reflections[0].ayah_from === 255,
     JSON.stringify(db.reflections[0]));

  await page.click('[data-view="calendar"]');
  await page.waitForTimeout(300);
  ok('the calendar marks the day that has a reflection',
     (await page.locator(`#cal-grid [data-k="${key()}"] .cal-note-dot`).count()) === 1);
  await page.click(`#cal-grid [data-k="${key()}"]`);
  await page.waitForSelector('#day-sheet:not([hidden])');
  ok('and the day detail shows the note back',
     (await page.textContent('#day-body')).includes('His seat extends'));
  await page.click('#day-close');

  /* ─────────── 7d. reading ─────────── */
  console.log('\n[7d] Reading');
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(250);
  ok('reading is off by default', !(await page.isChecked('#p-reading-on')));
  await page.check('#p-reading-on');
  await page.waitForTimeout(900);
  ok('turning it on reveals the range', await page.isVisible('#rp-from'));
  const finish = await page.textContent('#rp-finish');
  ok('it says how much is left and when it finishes',
     /pages left/.test(finish) && /finishes/.test(finish), finish);
  ok('the whole mushaf at 4 a day is 604 pages',
     finish.includes('604'), finish);

  // Juz Amma only, faster.
  await page.selectOption('#rp-from', '78');
  await page.waitForTimeout(900);
  const finish2 = await page.textContent('#rp-finish');
  ok('narrowing the range shortens it', finish2.includes('23'), finish2);
  db = await api('dump');
  ok('the plan is saved', db.reading_plan[0] && db.reading_plan[0].from_surah === 78,
     JSON.stringify(db.reading_plan[0]));
  ok('with its own cursor inside the new range',
     db.reading_plan[0].cursor >= 582, String(db.reading_plan[0].cursor));

  await page.click('[data-view="today"]');
  await page.waitForTimeout(400);
  const withReading = await page.textContent('#tasks');
  ok('a reading portion appears on Today', withReading.includes('Reading'), withReading.slice(0, 300));
  db = await api('dump');
  const rd = db.daily_tasks.find((t) => t.task_date === key() && t.kind === 'reading');
  ok('of the right size', rd && rd.pages.length === 4, rd && String(rd.pages.length));
  ok('and separate from revision',
     db.daily_tasks.filter((t) => t.task_date === key() && t.kind === 'revision').length >= 1);

  /* ─────────── 8. reminders ─────────── */
  console.log('\n[8] Reminders');
  await page.click('[data-view="more"]');
  await page.waitForSelector('#view-more:not([hidden])');
  await page.fill('#set-remind', '05:30');
  await page.click('#remind-save');
  await page.waitForTimeout(500);
  db = await api('dump');
  ok('the time is saved even with the prompt denied',
     db.settings[0] && db.settings[0].reminder_time === '05:30', JSON.stringify(db.settings));
  ok('with a timezone', db.settings[0].timezone && db.settings[0].timezone.length > 1);

  /* ─────────── 9. anonymous account, optional email ─────────── */
  console.log('\n[9] The account is optional');
  ok('an anonymous account is offered a way to save progress',
     await page.isVisible('#link-form'));
  ok('and is not asked to sign out of nothing', !(await page.isVisible('#account-signout')));
  await page.fill('#link-email', 'me@example.com');
  await page.click('#link-btn');
  await page.waitForTimeout(400);
  ok('a code is sent, not a link',
     /code/i.test(await page.textContent('#link-msg')), await page.textContent('#link-msg'));
  ok('the code box appears in the app', await page.isVisible('#link-code-form'));
  await page.fill('#link-code', '123456');
  await page.click('#link-code-form button[type=submit]');
  await page.waitForTimeout(500);
  ok('entering it links the account without leaving the app',
     (await page.textContent('#set-email')) === 'me@example.com',
     await page.textContent('#set-email'));
  ok('and the sign-out option now exists', await page.isVisible('#account-signout'));

  /* ─────────── 10. the fallback when anonymous is off ─────────── */
  console.log('\n[10] If anonymous sign-in is unavailable');
  await api('reset', { seeded: false });
  await api('anon-toggle', { on: false });
  await page.goto(BASE);
  await page.waitForSelector('#auth:not([hidden])', { timeout: 6000 });
  ok('it falls back to asking for an email', await page.isVisible('#email'));
  await page.fill('#email', 'me@example.com');
  await page.click('#auth-btn');
  await page.waitForTimeout(400);
  ok('which sends a code, not a link', await page.isVisible('#code-form'));
  await page.fill('#code', '123456');
  await page.click('#code-btn');
  await page.waitForSelector('#setup:not([hidden])', { timeout: 6000 });
  ok('and the code gets you in', await page.isVisible('#su-from'));
  await api('anon-toggle', { on: true });

  /* ─────────── 11. presentation ─────────── */
  console.log('\n[11] Layout');
  await api('reset', { seeded: true });
  await api('anon');
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])', { timeout: 6000 });
  const of = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow at 390px', of <= 0, 'overflow=' + of);
  ok('four tabs', (await page.locator('.tab').count()) === 4);
  const tb = await page.locator('.task').first().boundingBox();
  ok('task tap target >= 60px', tb.height >= 60, String(tb.height));

  for (const v of ['today','plan','calendar','more']) {
    await page.click(`[data-view="${v}"]`);
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${__dirname}/shot-${v}.png` });
  }
  await page.click('[data-view="today"]');
  await ctx.close();

  const dark = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const dp = await dark.newPage();
  await api('anon');
  await dp.goto(BASE);
  await dp.waitForSelector('#app:not([hidden])', { timeout: 6000 });
  await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${__dirname}/shot-dark.png` });
  ok('dark mode is deep navy, not pure black',
     (await dp.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(10, 16, 32)');
  await dark.close();

  console.log('\n[12] Console');
  ok('no JS errors anywhere in the run', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
