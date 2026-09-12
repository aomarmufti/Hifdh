# Hifdh

A personal daily tracker for Quran memorization revision (Sabqi + Manzil) and
Arabic study. Mobile-first, installable on an iPhone home screen as a PWA.

Each weekday has a fixed revision assignment. The app shows **today's**
assignment automatically from the date - there is nothing to select. Checking an
item off writes a permanent dated record, so the history and trend views answer
"am I actually being consistent" rather than just "what is today".

## Storage

Data lives in **Postgres (Supabase)**, not in the browser. Clearing site data,
reinstalling the PWA, or signing in on a second device all keep the same
history. `localStorage` is used only as an offline outbox: a check-off made with
no signal is replayed when the connection returns.

Every table is protected by row-level security keyed to `auth.uid()`, so a row is
readable and writable only by the account that owns it. This is verified in the
test run below.

### Tables

| Table | Rows | Holds |
|---|---|---|
| `weekly_plan` | 7 per user | the Sabqi / Manzil / Arabic assignment for each weekday |
| `daily_log` | 1 per date | which of the three were done, plus the time each was ticked |
| `weekly_review` | 1 per week | zero-hesitation pages, weak pages, Arabic pages, vocab roots, note |
| `settings` | 1 per user | reminder time |

A trigger on signup seeds `weekly_plan` with the starting rotation, so a new
account opens onto a populated Today screen.

## Auth

Email magic link - enter an email, tap the link, stay signed in. No password, no
signup flow. Signing in with the same email on another device shows the same
data.

## Screens

- **Today** - the three tasks for today with large checkboxes. Ticking is
  optimistic: the UI updates immediately and the write happens behind it.
- **Week** - tap any weekday to edit its three fields. Used when the
  memorization pool grows and the rotation is redrawn.
- **History** - an 8-week heatmap, one column per week, shaded by how many of
  the three were completed. Tap a day to see its date and count.
- **Review** - the weekly form, plus a line chart of zero-hesitation pages over
  time. Tap the chart to inspect a point.
- **More** - reminder time and sign out.

## Reminders - what actually works

The reminder fires a local notification while the app is open or warm in the
background. A true scheduled push to a closed app needs a push server with VAPID
keys, which this does not have. The setting is saved before the permission
prompt is shown, so dismissing that prompt never loses the time.

## Layout

```
public/           the whole app - static files, no build step
  index.html      markup for every screen
  app.js          all behavior (ES module)
  styles.css
  config.js       Supabase URL + publishable key
  sw.js           service worker, caches the shell only
  manifest.webmanifest
  icons/
supabase/migrations/   schema and seed trigger as applied
```

No bundler and no dependencies. `public/` can be served by any static host.

## Tests

`npm test` runs 48 end-to-end assertions in headless Chromium at iPhone
viewport size, driving the real UI. The database is held in the Node test
process rather than the browser, so the persistence test clears **all** browser
storage and cookies, reloads, and asserts the check-offs come back - which is
the cross-device guarantee.

Covered: the auth gate, today's tasks matching the weekday, apostrophe-safe
rendering (`Al-Waqi'ah`, `Al-Jumu'ah`, `Al-Ma'arij`), optimistic check-off and
its timestamp, persistence across a wiped cold start, the week editor, heatmap
geometry, the review form and chart, upsert-in-place when a week is re-saved,
reminder persistence, no horizontal overflow at 390px, tap targets >= 52px, and
zero console errors across the run.

Row-level security and the signup seed trigger are verified separately against
the live database.
