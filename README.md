# Hifdh

A personal Qur'an revision tracker that **works out what to revise**, rather than
asking you to. Mobile-first, installable on an iPhone home screen as a PWA.

## Repository

`main` is the branch to work from. Two settings still point at the old
`claude/quran-arabic-tracker-app-jenqva` branch and can only be changed from
their settings pages:

1. **GitHub** → Settings → Branches → default branch → `main`
2. **Vercel** → the `hifdh` project → Settings → Git → Production Branch → `main`

Both branches currently point at the same commit, so nothing breaks either way.
Once Vercel is repointed, the old branch can be deleted; until then it is what
serves the live site, so leave it in place.

After that: branch off `main`, open a pull request, let CI run, merge.

## Live app

https://hifdh-seedsacademy.vercel.app — Share → Add to Home Screen.

## One-time setup

In the Supabase dashboard for `hifdh-tracker`:

1. **Authentication → Providers → Anonymous** — turn it on. This is what lets
   the app open without asking anyone to sign up. Without it the app still
   works, but falls back to asking for an email first.
2. **Authentication → Emails → Magic Link** — make sure the template includes
   `{{ .Token }}`, so the 6-digit code is visible. The code is what the app
   asks for; the link in the default template is the thing that breaks.

## The idea

Two questions, and it works out the rest:

1. **What have you memorised?** (from surah → to surah)
2. **How many pages can you revise a day?**

It answers immediately: *109 pages · you'll go through all of it every 11 days.*
Move the number, the answer moves. That is the whole model.

| | what it is | when |
|---|---|---|
| **Revision** <sub>Murājaʿah</sub> | everything you hold, N pages a day, in order, round and round | every day |
| **New page** <sub>Sabaq</sub> | the page you prepare for your teacher | lesson days only |
| **Arabic** | optional standing task with text you set | days you choose |

There used to be two overlapping revision rotations here — the classical
sabqi/manzil split. It was correct and nobody could understand it. One dial, one
promise, and the Today screen shows how far through the round you are.

Plain English leads throughout; the traditional term is kept as a quiet subtitle
for those who recognise it. Nobody should have to learn a word to use this.

## Getting in

There is no sign-up. Opening the app creates an anonymous session silently and
goes straight to setup.

Email is optional, and only ever entered as a **6-digit code typed in the app**.
This is not a style choice: on iOS, Safari and an installed Home-Screen PWA have
separate storage. A magic link tapped in Mail opens in Safari, so the session
lands somewhere the installed app cannot see, and you are asked to sign in again
forever. A code never leaves the app, so it lands where you are.

Adding an email later keeps the anonymous account and its history; it just adds
a way back in, and a second device.

### Nothing is keyed to the calendar

The schedule's memory is a **cursor**, not a date. It only
advances when work is planned. Miss a day and the rotation resumes exactly where
it stopped — it never skips to "where it should have been". Miss a week and you
do not return to a week of backlog, because days you never opened generated
nothing.

### Unfinished work carries over

A portion you did not get to reappears on the next day, tagged with the day it
came from, instead of disappearing.

The original row stays on its own date rather than moving, so history stays
honest: a day with three portions where you finished one is recorded as one of
three, not as a complete day. Carrying it forward must not launder a missed day
into a perfect one.

### Memorizing direction

**Backwards** takes surahs in descending order but learns each one *forwards*,
from its first page. Having finished Ad-Dukhan you do not start at the last page
of Az-Zukhruf — you start at p.489, its first page, and work down to where
Ad-Dukhan begins; then Ash-Shura from *its* first page, and so on.

This means that mid-surah your memorized pages have a hole in them (p.489–491
held, p.492–495 not, p.496 onward held). A single range cannot express that, so
the surah in progress is tracked separately and merges into the block when its
last page lands. A revision portion that straddles the hole is shown as two
honest stretches rather than one span that would silently include pages you do
not hold.

**Forwards** simply continues past the end, which already enters each new surah
at its first page. One tap to switch.

## The dials

All on the Plan screen, all recalculating live, including today's portion if you
have not already done it:

- what you have memorized (from surah → to surah)
- which days are lesson days, and pages per lesson
- manzil pages a day — the main lever on cycle length
- sabqi pages a day, and how many recent pages stay in the sabqi window
- rest days
- Arabic: on/off, what you are studying, and which days

A seven-day preview under the dials shows exactly what the change produces
before it becomes history. It runs from tomorrow: today's portion is already
fixed and sits on the Today tab.

## Screens

1. **Today** — the daily message, a ring showing pages remaining, and the day's
   portions. Ticking is optimistic: the UI moves first, the write follows.
2. **Plan** — the dials above, the live cycle length, and the preview.
3. **Progress** — an 8-week heatmap shaded by how much of each day you finished,
   a retention chart, and the weekly review form.
4. **More** — reminder time and account.

## The daily message

A verse or a hadith with its source and a line of encouragement, drawn from a
table of 32 (20 ayat, 12 ahadith). It is picked by date, so it is stable all day
and rotates for over a month before anything repeats.

## Design

Light is warm parchment with deep navy ink; dark is deep navy with warm cream.
Neither is pure black or pure white — paper and ink rather than screen defaults.

Four accents, each with exactly one job and never swapped:

| | |
|---|---|
| navy | structure and primary action |
| gold | the new page — the light being added |
| sage | completion |
| clay | carried over from an earlier day |

Every foreground/background pair is verified against WCAG AA in both modes
rather than eyeballed. A serif (New York, falling back to Georgia) carries the
daily verse, the large headings and the numerals; the interface itself stays on
the system sans. One spring curve is shared by every transition so the whole app
moves alike.

## Storage

Postgres via Supabase. Every table is row-level-security'd to `auth.uid()`, so a
row is readable and writable only by the account that owns it. `localStorage`
holds one thing: an offline outbox that replays a tick made with no signal.

| Table | Holds |
|---|---|
| `plan_config` | the dials, including the Arabic task |
| `progress` | memorized range, the surah in progress, and the two rotation cursors |
| `daily_tasks` | every generated portion and its exact pages, done state, carry-over origin and flag |
| `weekly_review` | the weekly retention log |
| `inspirations` | the shared daily messages (read-only) |
| `settings` | reminder time |

## Reminders

The reminder fires with the app fully closed. Two delivery paths, each the right
one for its platform, from one setting:

**Web (PWA).** A Web Push subscription. `sw.js` receives the push and shows the
notification; a `send-reminders` Edge Function is swept by `pg_cron` every five
minutes and works out local time in each user's own timezone. The VAPID private
key and cron secret live in a table with no RLS policy, readable only by the
service role, and are never committed. iOS delivers Web Push only to a PWA
installed to the Home Screen, so the screen says so rather than failing quietly.

**Native (iOS app).** A `WKWebView` gets no Web Push, so the native build
schedules seven weekly-repeating local notifications instead — one per weekday,
each with that day's correct body, rest days not scheduled at all. No server, no
network, fires offline. See `ios/README.md`.

The notification names the real portions when the day is already planned, and
otherwise states the size arithmetically from the settings. The scheduling
engine is deliberately not duplicated server-side: a second copy would drift and
eventually put a *wrong* portion on a lock screen, which is worse than a vague
one. It stays silent when the day is already finished.

The time is saved **before** the permission prompt appears, so dismissing that
prompt never loses the setting.

## Page numbers

The standard 604-page Madani mushaf. `public/lib/quran.js` holds all 114 surahs
with their starting pages; a surah's last page is where the next one begins,
because surahs share pages. If your copy is paginated differently, that one
table is the only thing to change.

## Tests

`npm test` runs both suites.

**Engine (56 assertions, `test/engine.test.js`)** — pure functions, no browser.
Pools and rotation, chunking and wrap-around, that a skipped day resumes rather
than jumps, that the same state yields the same portion on any weekday, that a
full rotation covers all 99 manzil pages exactly once and takes the 13 days the
projection claims, that two lessons a week really produces two new pages a week
that each surah is entered at its first page and finished before the next is
opened, that the hole left mid-surah is neither counted as held nor papered
over, that un-ticking the page which closed a gap re-opens it, that Arabic
follows its own days without touching the rotation cursors, and that planning
never mutates its input.

**End-to-end (69 assertions, `test/test.cjs`)** — headless Chromium at iPhone
viewport driving the real UI. The database lives in the Node test process, not
the browser, so the persistence test clears **all** cookies and browser storage,
reloads, and asserts everything returns — the actual cross-device guarantee.

Covered: first-run setup, that today's portions are computed with the right page
ranges and surah names, the daily message being stable across a reload,
optimistic ticking, carry-over of unfinished work (that finished work is never carried, and that a
day left half-done still reads as half-done in the heatmap), every planner dial changing the cycle and rebuilding today's
portion, the preview starting at tomorrow and continuing from where today
stops, the surah pickers agreeing with the stored range, new pages entering
Az-Zukhruf at p.489 rather than p.495 and the held count moving with them, the heatmap and
retention chart, reminder persistence with the permission prompt denied, the timezone being
captured, an uninstalled iPhone being told to Add to Home Screen rather than
shown a button that cannot work, dark mode, no horizontal overflow at 390px, tap targets, and zero console errors.

Row-level security and the seed trigger were verified separately against the
live database.

## Layout

```
public/
  index.html          markup for every screen
  app.js              views, sync, optimistic ticking
  lib/quran.js        the 114-surah page table + labelling
  lib/engine.js       the scheduler — pure, no I/O, no dates
  styles.css          design tokens, light + dark
  sw.js  manifest.webmanifest  icons/
supabase/migrations/  schema as applied
test/                 engine suite + end-to-end harness
```

No bundler, no build step, no runtime dependencies in the web app.
`.github/workflows/ci.yml` runs both suites on every push to `main` and every
pull request.

`ios/` holds a Capacitor shell around the same `public/` directory — copied
verbatim, so the two builds cannot diverge. `ios/README.md` covers building,
TestFlight and submission, including an honest read on the Guideline 4.2
rejection risk.
