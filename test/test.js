const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4188';
const api = (op, body = {}) =>
  fetch(BASE + '/mock/' + op, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((r) => r.json());

let pass = 0, fail = 0;
const ok  = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

(async () => {
  const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await api('reset');

  // ---------- 1. auth gate ----------
  console.log('\n[1] Auth gate');
  await page.goto(BASE);
  await page.waitForSelector('#auth:not([hidden])');
  ok('auth screen shown when signed out', await page.isVisible('#email'));
  ok('app hidden when signed out', !(await page.isVisible('#view-today')));

  await page.fill('#email', 'probe@example.com');
  await page.click('#auth-btn');
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  ok('signing in reveals the app', await page.isVisible('#view-today'));

  // ---------- 2. today reflects the weekday ----------
  console.log('\n[2] Today view');
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const jsDay = new Date().getDay();
  const wd = jsDay === 0 ? 7 : jsDay;
  const seed = require('./seed.json')[String(wd)];

  ok('weekday heading correct', (await page.textContent('#today-weekday')) === DAYS[wd - 1],
     await page.textContent('#today-weekday'));
  const tasksTxt = await page.textContent('#today-tasks');
  ok("today's sabqi shown", tasksTxt.includes(seed.sabqi), seed.sabqi);
  ok("today's manzil shown", tasksTxt.includes(seed.manzil.slice(0, 40)));
  ok('3 task rows', (await page.locator('.task').count()) === 3);

  // Apostrophes must render as characters, not entities or broken markup.
  const apostrophePage = await page.evaluate(() => document.body.innerText);
  await page.click('[data-view="week"]');
  await page.waitForSelector('#view-week:not([hidden])');
  const weekTxt = await page.textContent('#week-list');
  ok("apostrophe renders literally (Al-Waqi'ah)", weekTxt.includes("Al-Waqi'ah"));
  ok("apostrophe renders literally (Al-Jumu'ah)", weekTxt.includes("Al-Jumu'ah"));
  ok("apostrophe renders literally (Al-Ma'arij)", weekTxt.includes("Al-Ma'arij"));
  ok('no HTML entity leakage', !weekTxt.includes('&#39;') && !weekTxt.includes('&amp;'));
  ok('Sunday split warning present', weekTxt.includes('may need splitting'));

  // ---------- 3. optimistic check-off ----------
  console.log('\n[3] Check-off');
  await page.click('[data-view="today"]');
  await page.waitForSelector('#view-today:not([hidden])');

  await page.click('.task[data-task="sabqi"]');
  ok('checkbox flips immediately', await page.locator('.task[data-task="sabqi"].is-done').isVisible());

  await page.click('.task[data-task="manzil"]');
  await page.waitForTimeout(400);
  let db = await api('dump');
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const row = db.daily_log.find((r) => r.log_date === key);
  ok('daily_log row written to server', !!row);
  ok('sabqi_done persisted', row && row.sabqi_done === true);
  ok('manzil_done persisted', row && row.manzil_done === true);
  ok('arabic_done still false', row && row.arabic_done === false);
  ok('check-off timestamp recorded', row && !!row.sabqi_done_at, row && row.sabqi_done_at);

  // ---------- 4. persistence with ALL browser storage cleared ----------
  console.log('\n[4] Persistence across a cold start (browser storage wiped)');
  await ctx.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await api('authed');                       // session lives server-side, as a real one would
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  ok('sabqi still checked after wipe + reload',
     await page.locator('.task[data-task="sabqi"].is-done').isVisible());
  ok('manzil still checked after wipe + reload',
     await page.locator('.task[data-task="manzil"].is-done').isVisible());
  ok('arabic still unchecked',
     !(await page.locator('.task[data-task="arabic"].is-done').isVisible()));

  // ---------- 5. week editor ----------
  console.log('\n[5] Week editor');
  await page.click('[data-view="week"]');
  await page.click('.day-row[data-wd="3"]');
  await page.waitForSelector('#sheet:not([hidden])');
  ok('editor opens with existing text',
     (await page.inputValue('#ed-sabqi')) === require('./seed.json')['3'].sabqi);
  await page.fill('#ed-arabic', "Madinah Book 2 - lesson 7 (idafah), Hans Wehr root d-r-s");
  await page.click('#ed-save');
  await page.waitForTimeout(400);
  db = await api('dump');
  const wed = db.weekly_plan.find((r) => r.weekday === 3);
  ok('plan edit persisted to server', wed && wed.arabic.includes('idafah'), wed && wed.arabic);
  ok('week list shows the edit', (await page.textContent('#week-list')).includes('idafah'));

  // ---------- 6. history ----------
  console.log('\n[6] History');
  await page.click('[data-view="history"]');
  await page.waitForSelector('#view-history:not([hidden])');
  ok('heatmap has 8 week columns', (await page.locator('.hm-col').count()) === 8);
  ok('heatmap has 56 day cells', (await page.locator('#heatmap .cell').count()) === 56);
  ok('today shows partial completion (2 of 3)',
     (await page.locator('#heatmap .cell.lv2').count()) >= 1);
  ok('summary rendered', (await page.textContent('#history-summary')).includes('complete days'));

  // ---------- 7. weekly review + chart ----------
  console.log('\n[7] Weekly review');
  await page.click('[data-view="review"]');
  await page.waitForSelector('#view-review:not([hidden])');
  ok('chart empty-state shown with no data', await page.isVisible('#chart-empty'));

  const mkDate = (back) => {
    const d = new Date(); d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const entries = [[21, '30/48', 8, 40], [14, '35/48', 10, 55], [7, '39/48', 11, 60], [0, '44/48', 12, 72]];
  for (const [back, pages, ar, roots] of entries) {
    await page.fill('#rv-date', mkDate(back));
    await page.fill('#rv-zero', pages);
    await page.fill('#rv-weak', '6 pages, mostly An-Najm');
    await page.fill('#rv-arabic', String(ar));
    await page.fill('#rv-vocab', String(roots));
    await page.fill('#rv-note', "Felt easier than last month - Al-Waqi'ah is solid now");
    await page.click('#review-form button[type=submit]');
    await page.waitForTimeout(250);
  }
  db = await api('dump');
  ok('4 reviews persisted', db.weekly_review.length === 4, String(db.weekly_review.length));
  ok('apostrophe in note survived round-trip',
     db.weekly_review.every((r) => r.note.includes("Al-Waqi'ah")));
  ok('numeric fields stored as numbers',
     db.weekly_review.every((r) => typeof r.arabic_pages_completed === 'number'));

  ok('chart rendered', await page.isVisible('#chart svg'));
  ok('chart has 4 points', (await page.locator('#chart circle').count()) === 4);
  ok('chart empty-state hidden', !(await page.isVisible('#chart-empty')));
  ok('review history listed', (await page.locator('.review-item').count()) === 4);

  // tooltip: on a phone this is a tap, not a hover
  await page.locator('#chart svg').scrollIntoViewIfNeeded();
  const svg = await page.locator('#chart svg').boundingBox();
  await page.touchscreen.tap(svg.x + svg.width * 0.95, svg.y + svg.height / 2);
  await page.waitForTimeout(250);
  const tip = await page.locator('#tip').textContent();
  ok('tap tooltip shows latest value and percent',
     tip.includes('44/48') && tip.includes('92%'), tip);
  await page.touchscreen.tap(svg.x + 4, svg.y + svg.height / 2);
  await page.waitForTimeout(250);
  const tipFirst = await page.locator('#tip').textContent();
  ok('tapping the left end shows the earliest value',
     tipFirst.includes('30/48'), tipFirst);

  // editing an existing week replaces rather than duplicates
  await page.fill('#rv-date', mkDate(0));
  await page.fill('#rv-zero', '46/48');
  await page.click('#review-form button[type=submit]');
  await page.waitForTimeout(300);
  db = await api('dump');
  ok('re-saving a week updates in place (still 4 rows)', db.weekly_review.length === 4,
     String(db.weekly_review.length));
  ok('updated value stored',
     db.weekly_review.some((r) => r.zero_hesitation_pages === '46/48'));

  // ---------- 8. settings ----------
  console.log('\n[8] Settings');
  await page.click('[data-view="settings"]');
  await page.waitForSelector('#view-settings:not([hidden])');
  ok('email shown', (await page.textContent('#set-email')).includes('@'));
  await page.fill('#set-remind', '05:30');
  await page.click('#remind-save');
  await page.waitForTimeout(300);
  db = await api('dump');
  ok('reminder persisted', db.settings[0] && db.settings[0].reminder_time === '05:30',
     JSON.stringify(db.settings));

  // ---------- 9. full reload keeps everything ----------
  console.log('\n[9] Reload keeps all state');
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])');
  await page.click('[data-view="review"]');
  await page.waitForTimeout(400);
  ok('reviews survive reload', (await page.locator('.review-item').count()) === 4);
  await page.click('[data-view="settings"]');
  ok('reminder survives reload', (await page.inputValue('#set-remind')) === '05:30');
  await page.click('[data-view="week"]');
  ok('plan edit survives reload', (await page.textContent('#week-list')).includes('idafah'));

  // ---------- 10. layout ----------
  console.log('\n[10] Mobile layout');
  await page.click('[data-view="today"]');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow at 390px', overflow <= 0, 'overflow=' + overflow);
  const box = await page.locator('.task').first().boundingBox();
  ok('tap target >= 52px tall', box.height >= 52, String(box.height));

  await page.screenshot({ path: __dirname + '/shot-today.png' });
  await page.click('[data-view="history"]');
  await page.screenshot({ path: __dirname + '/shot-history.png' });
  await page.click('[data-view="review"]');
  await page.screenshot({ path: __dirname + '/shot-review.png' });
  await page.click('[data-view="week"]');
  await page.screenshot({ path: __dirname + '/shot-week.png' });

  // ---------- console hygiene ----------
  console.log('\n[11] Console');
  ok('no JS errors during the whole run', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
