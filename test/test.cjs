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

  /* ─────────── 1. first run ─────────── */
  console.log('\n[1] Sign in and first-run setup');
  await api('reset', { seeded: false });
  await page.goto(BASE);
  await page.waitForSelector('#auth:not([hidden])');
  ok('signed out shows sign in', await page.isVisible('#email'));

  await page.fill('#email', 'probe@example.com');
  await page.click('#auth-btn');
  await page.waitForSelector('#setup:not([hidden])', { timeout: 5000 });
  ok('a new account is asked what it has memorized', await page.isVisible('#su-from'));
  ok('defaults to Ad-Dukhan', (await page.inputValue('#su-from')) === '44',
     await page.inputValue('#su-from'));
  ok('defaults to An-Nas', (await page.inputValue('#su-to')) === '114');
  ok('shows the page count for that range',
     (await page.textContent('#setup-summary')).includes('109 pages'),
     await page.textContent('#setup-summary'));
  ok('and names the range', (await page.textContent('#setup-summary')).includes('Ad-Dukhan → An-Nas'));

  await page.click('#setup-go');
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  ok('setup builds the plan and opens the app', await page.isVisible('#view-today'));

  let db = await api('dump');
  ok('progress row written', db.progress.length === 1);
  ok('memorized range stored as pages 496-604',
     db.progress[0].mem_from === 496 && db.progress[0].mem_to === 604,
     JSON.stringify(db.progress[0]));
  ok('config row written with Mon+Fri lessons',
     JSON.stringify(db.plan_config[0].lesson_days) === '[1,5]',
     JSON.stringify(db.plan_config[0] && db.plan_config[0].lesson_days));

  /* ─────────── 2. today is calculated ─────────── */
  console.log('\n[2] Today is calculated, not hand-written');
  const lesson = [1, 5].includes(isoDay());
  db = await api('dump');
  const todays = db.daily_tasks.filter((t) => t.task_date === key());
  ok('tasks were generated for today', todays.length >= 2, String(todays.length));
  ok(`today has ${lesson ? 'a new page (lesson day)' : 'no new page (not a lesson day)'}`,
     todays.some((t) => t.kind === 'sabaq') === lesson);
  ok('sabqi and manzil are both scheduled',
     todays.some((t) => t.kind === 'sabqi') && todays.some((t) => t.kind === 'manzil'));

  const manzil = todays.find((t) => t.kind === 'manzil');
  ok('manzil is 8 pages', manzil.page_to - manzil.page_from + 1 === 8,
     `${manzil.page_from}-${manzil.page_to}`);
  ok('manzil starts after the sabqi window (p506)', manzil.page_from === 506,
     String(manzil.page_from));
  ok('manzil is labelled with surah names', /[A-Za-z]/.test(manzil.label), manzil.label);
  const sabqi = todays.find((t) => t.kind === 'sabqi');
  ok('sabqi covers the newest pages', sabqi.page_from === 496, String(sabqi.page_from));

  const shown = await page.textContent('#tasks');
  ok('the page range is shown on screen', shown.includes('p.506'), shown.slice(0, 200));
  ok('pages held is displayed', (await page.textContent('#m-known')) === '109',
     await page.textContent('#m-known'));
  ok('the cycle length is displayed', (await page.textContent('#m-cycle')) === '13',
     await page.textContent('#m-cycle'));

  /* ─────────── 3. daily inspiration ─────────── */
  console.log('\n[3] Daily message');
  ok('an inspiration is shown', await page.isVisible('#inspire'));
  const body1 = await page.textContent('#insp-body');
  ok('it has a body', body1.length > 10);
  ok('it cites a source', (await page.textContent('#insp-src')).length > 3,
     await page.textContent('#insp-src'));
  ok('it carries an encouragement', (await page.textContent('#insp-note')).length > 5);
  await page.reload();
  await page.waitForSelector('#app:not([hidden])');
  ok('the same message persists through the day',
     (await page.textContent('#insp-body')) === body1);

  /* ─────────── 4. ticking work ─────────── */
  console.log('\n[4] Completing a portion');
  const ringBefore = await page.textContent('#ring-num');
  await page.click('.task[data-id]');
  await page.waitForTimeout(350);
  ok('the first task shows as done', await page.locator('.task.is-done').first().isVisible());
  ok('the ring count drops', (await page.textContent('#ring-num')) !== ringBefore,
     `${ringBefore} -> ${await page.textContent('#ring-num')}`);
  db = await api('dump');
  ok('completion is persisted', db.daily_tasks.some((t) => t.done === true));

  /* ─────────── 5. carry-over ─────────── */
  console.log('\n[5] Unfinished work carries over');
  await api('reset', { seeded: true });
  // Yesterday: three portions, only one done. That day must stay on record as
  // incomplete even after the other two are carried forward.
  await api('poke', { table: 'daily_tasks', rows: [
    { id: 'old-1', user_id: 'user-probe-0001', task_date: back(1), kind: 'manzil',
      page_from: 560, page_to: 567, label: 'At-Tahrim → Al-Haqqah',
      done: false, done_at: null, carried_from: null, carried_away: false },
    { id: 'old-3', user_id: 'user-probe-0001', task_date: back(1), kind: 'sabqi',
      page_from: 496, page_to: 500, label: 'Ad-Dukhan → Al-Jathiyah',
      done: false, done_at: null, carried_from: null, carried_away: false },
    { id: 'old-4', user_id: 'user-probe-0001', task_date: back(1), kind: 'arabic',
      page_from: 0, page_to: 0, label: 'Arabic study',
      done: true, done_at: new Date().toISOString(), carried_from: null, carried_away: false },
    { id: 'old-2', user_id: 'user-probe-0001', task_date: back(2), kind: 'sabqi',
      page_from: 496, page_to: 500, label: 'Ad-Dukhan → Al-Jathiyah',
      done: true, done_at: new Date().toISOString(), carried_from: null, carried_away: false }
  ]});
  await api('authed');
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });

  db = await api('dump');
  const origin = db.daily_tasks.find((t) => t.id === 'old-1');
  const stayed = db.daily_tasks.find((t) => t.id === 'old-2');
  const copy = db.daily_tasks.find((t) => t.task_date === key() &&
                                          t.carried_from === back(1) && t.kind === 'manzil');
  ok('the original row stays on its own date', origin.task_date === back(1), origin.task_date);
  ok('and is flagged as carried away', origin.carried_away === true, String(origin.carried_away));
  ok('a copy appears on today', !!copy, 'no copy found');
  ok('the copy keeps the same pages',
     copy && copy.page_from === 560 && copy.page_to === 567,
     copy && `${copy.page_from}-${copy.page_to}`);
  ok('the copy remembers where it came from', copy && copy.carried_from === back(1),
     copy && String(copy.carried_from));
  ok('a completed task is never carried', stayed.task_date === back(2) && !stayed.carried_away);
  ok('the finished Arabic task was not carried either',
     db.daily_tasks.filter((t) => t.kind === 'arabic' && t.carried_from === back(1)).length === 0);

  const txt = await page.textContent('#tasks');
  ok('the carried task is visible today', txt.includes('At-Tahrim'), txt.slice(0,300));
  ok('its surah names are recomputed from the actual pages, not a stored string',
     txt.includes('Al-Haqqah'), txt.slice(0,300));
  ok('a carried row without a stored page array still shows its range',
     txt.includes('p.560'), txt.slice(0,300));
  ok('and is flagged as carried over', await page.locator('.task.is-carried').first().isVisible());
  ok('the carried-away original is not shown twice today',
     (await page.locator('.task').count()) === db.daily_tasks
       .filter((t) => t.task_date === key() && !t.carried_away).length);

  // The whole point: a missed day must not score as a perfect day.
  await page.click('[data-view="progress"]');
  await page.waitForSelector('#view-progress:not([hidden])');
  const cell = page.locator(`#heatmap .cell[data-k="${back(1)}"]`);
  ok('yesterday still records all three portions',
     (await cell.getAttribute('data-t')) === '3', await cell.getAttribute('data-t'));
  ok('yesterday records only the one that was done',
     (await cell.getAttribute('data-n')) === '1', await cell.getAttribute('data-n'));
  ok('and is NOT shaded as complete',
     !(await cell.getAttribute('class')).includes('l3'), await cell.getAttribute('class'));
  await page.click('[data-view="today"]');
  await page.waitForTimeout(200);

  /* ─────────── 6. the planner recalculates ─────────── */
  console.log('\n[6] Changing the plan recalculates');
  await page.click('[data-view="plan"]');
  await page.waitForSelector('#view-plan:not([hidden])');
  const sum0 = await page.textContent('#plan-summary');
  ok('summary states the full-cycle length', /every 13 days/.test(sum0), sum0.slice(0,120));
  ok('summary states pages held', sum0.includes('109 pages'), sum0.slice(0,120));
  ok('summary states new pages per week', sum0.includes('2 new pages a week'), sum0.slice(0,200));
  ok('summary names the surah being learned', sum0.includes('Now learning Az-Zukhruf'),
     sum0.slice(0,200));

  // A surah that merely *ends* on the first memorized page must not be counted
  // as memorized: pages 496-604 starts at Ad-Dukhan (44), not Az-Zukhruf (43).
  ok('the From picker matches the stored range',
     (await page.inputValue('#p-from')) === '44', await page.inputValue('#p-from'));
  ok('the To picker matches the stored range',
     (await page.inputValue('#p-to')) === '114', await page.inputValue('#p-to'));
  ok('picker and summary agree', sum0.includes('Ad-Dukhan → An-Nas'), sum0.slice(0,160));

  const pv0 = await page.textContent('#preview');
  ok('a 7-day preview is rendered', (await page.locator('.pv').count()) === 7);
  ok('preview names surahs', /[A-Z][a-z]+-?/.test(pv0));

  // The cursors have already advanced past today, so the preview starts at
  // tomorrow - and its first manzil portion must continue from today's.
  ok('the preview starts at tomorrow, not today',
     (await page.locator('.pv-day').first().textContent()).includes('Tomorrow'),
     await page.locator('.pv-day').first().textContent());
  db = await api('dump');
  const todayManzil = db.daily_tasks.find(
    (t) => t.task_date === key() && t.kind === 'manzil' && !t.carried_from);
  const firstPv = await page.locator('.pv').first().textContent();
  ok('tomorrow continues from where today stops',
     firstPv.includes('p.' + (todayManzil.page_to + 1)),
     `today ends p.${todayManzil.page_to}; preview says ${firstPv.replace(/\s+/g,' ').slice(0,110)}`);
  ok('and does not repeat today\u2019s pages',
     !firstPv.includes('p.' + todayManzil.page_from + '–'), firstPv.slice(0,110));

  // Raise manzil pages/day and the cycle must shorten.
  for (let i = 0; i < 4; i++) {
    await page.click('.stepper[data-key="manzil_pages_per_day"] [data-d="1"]');
  }
  await page.waitForTimeout(120);
  ok('stepper value updated', (await page.textContent('#v-manzil_pages_per_day')) === '12',
     await page.textContent('#v-manzil_pages_per_day'));
  const sum1 = await page.textContent('#plan-summary');
  ok('cycle recalculates immediately', /every 9 days/.test(sum1), sum1.slice(0,120));
  await page.waitForTimeout(700);
  db = await api('dump');
  ok('the config change is saved', db.plan_config[0].manzil_pages_per_day === 12,
     String(db.plan_config[0].manzil_pages_per_day));
  const t2 = db.daily_tasks.filter((t) => t.task_date === key() && t.kind === 'manzil' && !t.carried_from);
  ok('today’s manzil portion was rebuilt to 12 pages',
     t2.length === 1 && t2[0].page_to - t2[0].page_from + 1 === 12,
     JSON.stringify(t2.map((t) => [t.page_from, t.page_to])));

  // Lesson days drive the new-page schedule.
  await page.click('#p-days [data-d="3"]');     // add Wednesday
  await page.waitForTimeout(200);
  const sum2 = await page.textContent('#plan-summary');
  ok('adding a lesson day changes pages per week', sum2.includes('3 new pages a week'),
     sum2.slice(0,160));
  await page.click('#p-days [data-d="3"]');     // back off
  await page.waitForTimeout(200);

  // Changing what you know changes everything downstream.
  await page.selectOption('#p-from', '67');     // Al-Mulk .. An-Nas
  await page.waitForTimeout(700);
  const sum3 = await page.textContent('#plan-summary');
  ok('shrinking the memorized range shrinks pages held', sum3.includes('43 pages'), sum3.slice(0,140));
  ok('and renames the range', sum3.includes('Al-Mulk → An-Nas'), sum3.slice(0,160));
  db = await api('dump');
  ok('the new range is stored', db.progress[0].mem_from === 562, String(db.progress[0].mem_from));
  await page.selectOption('#p-from', '44');
  await page.waitForTimeout(700);

  /* ─────────── 6b. arabic ─────────── */
  console.log('\n[6b] Arabic');
  await page.fill('#p-arabic-text', 'Madinah Book 2, lesson 7 (idafah)');
  await page.waitForTimeout(1700);
  db = await api('dump');
  ok('arabic text saved', db.plan_config[0].arabic_text.includes('idafah'),
     db.plan_config[0].arabic_text);
  const arToday = db.daily_tasks.filter((t) => t.task_date === key() && t.kind === 'arabic');
  ok('an arabic task exists for today', arToday.length === 1, String(arToday.length));
  ok('it carries the text', arToday[0] && arToday[0].label.includes('idafah'),
     arToday[0] && arToday[0].label);

  await page.click('[data-view="today"]');
  await page.waitForTimeout(250);
  const tTxt = await page.textContent('#tasks');
  ok('arabic shows on Today', tTxt.includes('idafah'), tTxt.slice(0, 240));
  ok('arabic shows no page range',
     !/idafah[\s\S]{0,40}p\./.test(tTxt), tTxt.slice(0, 240));

  await page.click('[data-view="plan"]');
  await page.waitForTimeout(200);
  await page.uncheck('#p-arabic-on');
  await page.waitForTimeout(1200);
  db = await api('dump');
  ok('arabic can be switched off', db.plan_config[0].arabic_enabled === false,
     String(db.plan_config[0].arabic_enabled));
  ok('and today\u2019s arabic task is removed',
     db.daily_tasks.filter((t) => t.task_date === key() && t.kind === 'arabic').length === 0);
  await page.check('#p-arabic-on');
  await page.waitForTimeout(1200);

  /* ─────────── 6c. memorisation order ─────────── */
  console.log('\n[6c] New pages enter each surah at its first page');
  // Make today a lesson day so a sabaq is scheduled whatever day it is.
  const wd = isoDay();
  const dayBtn = page.locator(`#p-days [data-d="${wd}"]`);
  if (!(await dayBtn.getAttribute('class')).includes('on')) {
    await dayBtn.click();
    await page.waitForTimeout(1200);
  }
  db = await api('dump');
  const sabaq = db.daily_tasks.find((t) => t.task_date === key() && t.kind === 'sabaq');
  ok('a new page is scheduled today', !!sabaq, 'none found');
  // Holding Ad-Dukhan..An-Nas, the next surah down is Az-Zukhruf (p489-495).
  // The first new page must be p489, its FIRST page - not p495.
  ok('the new page is the FIRST page of Az-Zukhruf', sabaq && sabaq.page_from === 489,
     sabaq && String(sabaq.page_from));
  ok('it is not the last page of that surah', sabaq && sabaq.page_from !== 495);
  ok('and it is labelled Az-Zukhruf', sabaq && sabaq.label === 'Az-Zukhruf', sabaq && sabaq.label);

  await page.click('[data-view="today"]');
  await page.waitForTimeout(250);
  const tToday = await page.textContent('#tasks');
  ok('Today shows it as the new page', tToday.includes('Az-Zukhruf') && tToday.includes('p.489'),
     tToday.slice(0, 260));

  // Completing it must extend what is held without closing the surah yet.
  const sabaqCard = page.locator(`.task[data-id="${sabaq.id}"]`);
  await sabaqCard.scrollIntoViewIfNeeded();
  await sabaqCard.click();
  await page.waitForTimeout(600);
  db = await api('dump');
  ok('the part-learned surah is tracked, block unmoved',
     db.progress[0].partial_from === 489 && db.progress[0].partial_to === 489 &&
     db.progress[0].mem_from === 496,
     JSON.stringify([db.progress[0].partial_from, db.progress[0].partial_to, db.progress[0].mem_from]));
  ok('pages held goes up by one', (await page.textContent('#m-known')) === '110',
     await page.textContent('#m-known'));

  // And un-ticking must put it back.
  await sabaqCard.click();
  await page.waitForTimeout(600);
  db = await api('dump');
  ok('un-ticking removes it again',
     db.progress[0].partial_from === null && db.progress[0].mem_from === 496,
     JSON.stringify([db.progress[0].partial_from, db.progress[0].mem_from]));
  ok('pages held goes back down', (await page.textContent('#m-known')) === '109',
     await page.textContent('#m-known'));

  await page.click('[data-view="plan"]');
  await page.waitForTimeout(250);
  if ((await page.locator(`#p-days [data-d="${wd}"]`).getAttribute('class')).includes('on')
      && ![1, 5].includes(wd)) {
    await page.locator(`#p-days [data-d="${wd}"]`).click();   // restore
    await page.waitForTimeout(1000);
  }

  /* ─────────── 7. direction ─────────── */
  console.log('\n[7] Memorizing direction');
  await page.click('#p-direction [data-v="forward"]');
  await page.waitForTimeout(300);
  ok('forward is selected', await page.locator('#p-direction [data-v="forward"].on').isVisible());
  await page.click('#p-direction [data-v="backward"]');
  await page.waitForTimeout(700);
  ok('backward is selected again',
     await page.locator('#p-direction [data-v="backward"].on').isVisible());
  db = await api('dump');
  ok('direction persisted', db.plan_config[0].direction === 'backward', db.plan_config[0].direction);

  /* ─────────── 8. progress views ─────────── */
  console.log('\n[8] Progress');
  await page.click('[data-view="progress"]');
  await page.waitForSelector('#view-progress:not([hidden])');
  ok('heatmap is 8 weeks', (await page.locator('.hm-col').count()) === 8);
  ok('heatmap has 56 cells', (await page.locator('#heatmap .cell').count()) === 56);
  ok('chart empty-state until two reviews', await page.isVisible('#chart-empty'));

  for (const [d, v] of [[21,'30/48'],[14,'35/48'],[7,'39/48'],[0,'44/48']]) {
    await page.fill('#rv-date', back(d));
    await page.fill('#rv-zero', v);
    await page.fill('#rv-note', "Al-Waqi'ah is solid now");
    await page.click('#review-form button[type=submit]');
    await page.waitForTimeout(220);
  }
  db = await api('dump');
  ok('four reviews stored', db.weekly_review.length === 4, String(db.weekly_review.length));
  ok('apostrophe survived the round trip',
     db.weekly_review.every((r) => r.note.includes("Al-Waqi'ah")));
  ok('chart renders', await page.isVisible('#chart svg'));
  ok('chart has four points', (await page.locator('#chart circle').count()) === 4);

  await page.locator('#chart svg').scrollIntoViewIfNeeded();
  const box = await page.locator('#chart svg').boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.95, box.y + box.height / 2);
  await page.waitForTimeout(250);
  ok('tapping the chart shows the value',
     (await page.textContent('#tip')).includes('44/48'), await page.textContent('#tip'));

  await page.fill('#rv-date', back(0));
  await page.fill('#rv-zero', '46/48');
  await page.click('#review-form button[type=submit]');
  await page.waitForTimeout(300);
  db = await api('dump');
  ok('re-saving a week updates in place', db.weekly_review.length === 4,
     String(db.weekly_review.length));

  /* ─────────── 9. persistence across a wiped cold start ─────────── */
  console.log('\n[9] Persistence with all browser storage cleared');
  await ctx.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await api('authed');
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  ok('plan survived', (await page.textContent('#m-known')) === '109',
     await page.textContent('#m-known'));
  await page.click('[data-view="progress"]');
  await page.waitForTimeout(300);
  ok('reviews survived', (await page.locator('.review-item').count()) === 4);
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(200);
  ok('settings survived', (await page.textContent('#v-manzil_pages_per_day')) === '12',
     await page.textContent('#v-manzil_pages_per_day'));

  /* ─────────── 10. reminder ─────────── */
  console.log('\n[10] Reminder');
  await page.click('[data-view="more"]');
  await page.waitForSelector('#view-more:not([hidden])');
  await page.fill('#set-remind', '05:30');
  await page.click('#remind-save');
  await page.waitForTimeout(400);
  db = await api('dump');
  ok('reminder saved even though the permission prompt is denied',
     db.settings[0] && db.settings[0].reminder_time === '05:30', JSON.stringify(db.settings));

  /* ─────────── 10b. push notification states ─────────── */
  console.log('\n[10b] Push reminders');
  const status = await page.textContent('#remind-status');
  ok('the reminder screen explains what it will do',
     /remind/i.test(status), status);
  ok('the save button is usable on a supporting browser',
     !(await page.locator('#remind-save').isDisabled()));
  db = await api('dump');
  ok('the timezone is captured alongside the time',
     db.settings[0] && typeof db.settings[0].timezone === 'string' &&
     db.settings[0].timezone.length > 1, JSON.stringify(db.settings[0]));
  ok('a denied permission prompt still leaves the time saved',
     db.settings[0].reminder_time === '05:30', String(db.settings[0].reminder_time));

  // iOS refuses push to a browser tab; only an installed Home Screen app gets
  // it. The screen has to say so rather than appearing to work.
  const iphone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  });
  const ip = await iphone.newPage();
  await api('authed');
  await ip.goto(BASE);
  await ip.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  await ip.click('[data-view="more"]');
  await ip.waitForTimeout(400);
  const iosMsg = await ip.textContent('#remind-status');
  ok('on an uninstalled iPhone it asks you to Add to Home Screen',
     /home screen/i.test(iosMsg), iosMsg);
  ok('and it does not pretend the button will work',
     await ip.locator('#remind-save').isDisabled());
  await iphone.close();

  /* ─────────── 11. presentation ─────────── */
  console.log('\n[11] Layout');
  await page.click('[data-view="today"]');
  await page.waitForTimeout(200);
  const of = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow at 390px', of <= 0, 'overflow=' + of);
  const tb = await page.locator('.task').first().boundingBox();
  ok('task tap target >= 60px', tb.height >= 60, String(tb.height));
  const tab = await page.locator('.tab').first().boundingBox();
  ok('tab tap target >= 44px', tab.height >= 44, String(tab.height));
  ok('four tabs', (await page.locator('.tab').count()) === 4);

  for (const [v, f] of [['today','today'],['plan','plan'],['progress','progress'],['more','more']]) {
    await page.click(`[data-view="${v}"]`);
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${__dirname}/shot-${f}.png` });
  }
  await ctx.close();

  // Dark mode render
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const dp = await dark.newPage();
  await api('authed');
  await dp.goto(BASE);
  await dp.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${__dirname}/shot-dark.png` });
  const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok('dark mode is deep navy, not pure black', bg === 'rgb(10, 16, 32)', bg);
  const darkInk = await dp.evaluate(() => getComputedStyle(document.body).color);
  ok('dark mode text is warm cream, not pure white', darkInk === 'rgb(237, 230, 216)', darkInk);
  await dark.close();

  console.log('\n[12] Console');
  ok('no JS errors anywhere in the run', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
