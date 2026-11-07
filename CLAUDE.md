# FuelTrack — project notes for Claude

@AGENTS.md

Android app (Expo SDK 58, RN 0.88, TypeScript strict) to track per-interval fuel economy, running
cost and maintenance for bikes/cars. Market: Pakistan (PKR, km, litres; English + Urdu).
Approved plan: milestones M1–M5; build one at a time, run tests, summarize, stop.

## Commands
| What | Command |
|---|---|
| Install deps | `npm install` (`.npmrc` sets `legacy-peer-deps`, see decisions) |
| Add an Expo/RN package | `npx expo install <pkg>` (dev dep: `npx expo install -- --save-dev <pkg>`) |
| Unit tests (Jest) | `npm test` |
| Server tests: SQL/RLS on PGlite + edge-function helpers | `npm run test:server` |
| Typecheck / lint | `npm run typecheck` / `npm run lint` |
| Everything | `npm run check` |
| Bundle smoke test | `npx expo export --platform android --output-dir <tmp>` |
| Regenerate local DB migration after editing `src/db/schema.ts` | `npm run db:generate` |
| Dev build on device | `npx eas-cli@latest build --profile development --platform android` (or `npx expo run:android` with Android SDK) |
| Run dev server | `npm start` (needs the dev build installed; Expo Go will NOT work) |
| Apply server schema | `supabase db push` (linked project) or paste `supabase/migrations/*.sql` into the SQL editor |

Env: copy `.env.example` → `.env.local` with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Layout
- `src/app/` expo-router routes. `(auth)` = phone/OTP; `(app)` = signed-in stack. Guarded with `Stack.Protected`.
- `src/domain/` **pure TS, no RN imports** — validation, phone/plate/number parsing. Mileage (M2) and
  reminders (M3) engines go here. All calculation logic must be unit-tested here.
- `src/db/` Drizzle schema (`schema.ts`), repositories (`repo.ts`), kv, test DB helper. Migrations in `drizzle/`.
- `src/sync/` outbox push, keyset pull, photo uploads, engine, scheduler.
- `src/services/` Supabase client, auth, photo capture/compression, Supabase `RemoteApi` adapter.
- `src/state/` zustand stores (session, app) and `RepoContext` (`useRepo`, `useLive`).
- `src/ui/` shared components and forms. `src/i18n/` en/ur strings + formatters.
- `supabase/migrations/` server schema + RLS; `supabase/functions/` edge functions
  (`places-nearby`, `ocr-pump`); `supabase/tests/` PGlite + function-helper tests.
- `docs/checklists/Mx.md` manual device test checklists.

## Decisions (with reasons)
1. **Expo dev client + EAS**, not Expo Go — ML Kit (M4) and other native modules need a dev build.
2. **expo-sqlite + Drizzle**; repos typed against a common sync driver type (`src/db/types.ts`) so
   the same code runs on device (expo-sqlite) and in Jest (better-sqlite3, real migrations).
3. **Custom outbox sync** (no PowerSync/WatermelonDB):
   - Every write = row + `outbox` entry in one transaction. Client UUIDs; soft deletes (`deleted_at`).
   - Push sends each row's *current* state (edits collapse), parents first, stops at first failure;
     only outbox entries up to the read `seq` are removed (edits during a push stay queued).
   - Pull: keyset cursor `(updated_at, id)` per table; server stamps `updated_at` via trigger.
   - Conflicts: last write wins per row; rows with pending local changes are not overwritten by pull.
   - Known limitation: a row committed with an older `updated_at` after a client already pulled past
     it could be missed (needs two of the user's devices writing within the same instant). Fix if ever
     seen: re-pull with a small overlap window.
   - Order per run: photos → push → pull. Single-flight. Triggers: start, reconnect, foreground, 5 min, 2 s after writes.
4. **Photos**: compressed at capture (≤1280 px long edge, JPEG 0.6), copied to app documents, shown from
   local URI, uploaded later to private bucket `photos` at `<uid>/<table>/<row>/<column>-<seq>.jpg`.
   `*_local_uri` columns are device-only and never synced.
5. **Auth**: Supabase phone OTP. Session stored in expo-secure-store via a chunking adapter
   (sessions exceed SecureStore's ~2 KB value guidance). The last signed-in user is kept in local kv so
   the app opens **offline**. Signing in as a different user wipes the previous account's local data
   (its outbox would otherwise be rejected by RLS forever). Explicit sign-out wipes local data (warned).
6. **Timestamps**: epoch ms locally, `timestamptz` on server; `sync/mapping.ts` converts. Numbers are
   `double precision` on server (PostgREST returns JSON numbers).
7. **RLS**: every table `user_id = auth.uid()`; no DELETE policy (soft delete only); trigger pins
   `user_id`/`created_at` on update; child rows must reference a vehicle owned by the same user.
8. **Refuel entry**: any two of litres/rate/total compute the third; if all three are entered they are
   kept as typed (pump display is truth) and a >1% mismatch shows a non-blocking warning.
9. **Odometer**: "current" = most recent by time across readings, refuels and services (refuels/services
   are not duplicated into `odometer_readings`). Going backwards is a soft warning, never blocks.
10. **Plates**: no single regex (formats vary by province/era). Stored as typed (uppercased, spacing
    normalized) plus `plate_normalized` (A–Z0–9) for duplicate detection / later OCR matching.
11. **i18n**: i18next; every UI string in `en.json`/`ur.json` (test enforces identical keys + placeholders).
    Urdu switches to RTL via `I18nManager` (takes effect after app restart).
12. **`.npmrc legacy-peer-deps`**: expo-router's web-only deps pull `react-dom@19.3.1` which wants
    `react@^19.3.1` while SDK 58 pins `react@19.3.0`. Android-only app, so harmless.
13. **TypeScript 6** no longer auto-includes `@types/*`; `tsconfig.json` lists `types: ["jest","node"]`.
14. **ESLint 9** (eslint-config-expo 58 is not compatible with ESLint 10).
15. `drizzle/migrations.d.ts` is hand-written (types for the generated `migrations.js`); keep it.
16. **Mileage intervals are derived, not persisted**: `computeMileage(repo.refuels.list(v))` runs on every
    DB change (`useMileage`). Storing them would go stale whenever a refuel is edited/deleted/synced in.
    Only the user's annotation is stored (`anomaly_cause`/`anomaly_note` on refuel k).
17. **Baseline counts valid intervals only**: an interval with distance ≤ 0 or litres ≤ 0 has no km/l, is
    still emitted (flag `invalid_entry`, shown in the list and as × on the chart) but cannot enter a median.
    Thresholds are strict (exactly −15% / +25% not flagged) with a 1e-9 float guard.
18. **Chart: react-native-svg + pure `domain/chart.ts` geometry** instead of victory-native (Skia): raw
    points + per-interval dashed baseline only; ~100 LOC, no extra native engine, geometry unit-tested.
19. **Location**: expo-location foreground permission, one fix when the *new* refuel screen opens
    (8 s timeout, last-known fallback). Editing a refuel never touches its coordinates. No background location.
20. **Station name**: Supabase Edge Function `places-nearby` → Google Places API (New) searchNearby
    (`gas_station`, 500 m, by distance). Key is the function secret `GOOGLE_PLACES_API_KEY`. Client times out
    after 5 s and falls back to the nearest station the user has used before (≤300 m). Always editable.
21. After saving a new refuel the app opens the Fuel economy screen; if the interval just closed is
    flagged (drop/high) and has no annotation, the cause dialog opens once. "Not now" dismisses it for good.
22. **Service intervals (owner-approved 2026-11-07)**, in `src/domain/defaults.ts`, whichever comes first:
    bike oil 1500 km/60 d, chain oil 500 km/14 d, filter 3000 km/180 d, general service 30 d, wash 14 d;
    car oil 3500 km/90 d, filter 5000 km/180 d, general service 60 d, wash 14 d. Chain oil bike-only.
    **wash** added as a service type (owner request) → `supabase/migrations/20261108000000_wash_service.sql`.
    General service and wash are time-only (km = null), also when switched to observed intervals.
23. **Reminder engine** (`src/domain/reminders.ts`): rule `custom` → user values; else ≥2 logged events →
    median of the user's own km gaps and day gaps; else defaults. Anchor = last event, or the vehicle's
    baseline reading if none logged. due km = anchor + km; due date = anchor + days; km converted to a date
    with km/day (last 60 days if they span ≥7 days, else all history; from readings, refuels, services).
    Status: overdue / due soon (≤100 km or ≤1 day) / ok.
24. **Notifications are local scheduled notifications** (expo-notifications, DATE triggers): notify at the
    earlier of 1 day before the days-due date or the projected date of (due km − 100). Refuel prediction
    notifies 1 day before. `domain/notifyPlan.ts` keeps a delivered-state map in kv so a reminder is never
    repeated; a past-due reminder never delivered fires once immediately. Rescheduled on start,
    foreground and (debounced 3 s) after DB changes (`src/reminders/scheduler.ts`). No push server.
25. **"Any record?" prompts**: after adding a vehicle the app opens Maintenance; each type without a logged
    event shows "Any record of the last …? Yes / No". No → stored in local kv
    (`svc_prompt_dismissed:<vehicle>:<type>`), never asked again on this device (not synced; a second
    device may ask once). Reminders still run (anchored on the baseline) unless turned off in the rule.
26. **On-device OCR: `@infinitered/react-native-mlkit-text-recognition`** (Expo module, bundled ML Kit
    Latin model → offline, returns lines with boxes). Its `@infinitered/react-native-mlkit-core` is pinned
    **exactly 3.1.0** (the version it depends on) to avoid a duplicate native module; `expo-image` is its
    required peer. Never upgrade one without the other (`npx expo-doctor` catches it).
27. **OCR parsing is pure TS in `src/domain/ocr/`** (tested on fixture lines):
    plate = LETTERS+DIGITS coercion with O/0, I/1, S/5, B/8… fixes, two-row plates joined, province
    words ignored, biggest text wins; reg card = label "Registration No" → plate, MOTOR CYCLE/CAR… → type,
    maker; odometer = biggest 4–7-digit whole number, trip meter (decimal) and km/h scales penalised,
    plausibility vs last reading; pump = labels (Sale/Volume/Price) else any triple with L × R ≈ T (2%).
28. **Pump fallback to Claude**: only when the on-device read is not consistent. Edge Function `ocr-pump`
    (secret `ANTHROPIC_API_KEY`) uses `npm:@anthropic-ai/sdk@1.3.0`, model `claude-opus-5-5`, effort
    `medium`, structured output (JSON schema with nullable `rate_per_litre`/`litres`/`total`),
    `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), refusal → null reading. Values are
    range-checked server-side. Client timeout 20 s; offline/failure keeps the device read.
29. **Every OCR value is confirmed**: `ui/ScanButton` = camera/gallery → OCR → dialog with the photo,
    editable fields and alternative readings; nothing is used until "Use these values", and the form
    still has to be saved. Cancel deletes the photo. Plate scan photo becomes the vehicle photo,
    reg-card scan the reg-card photo, pump scan the receipt photo, odometer scans attach to the reading
    (baseline or `source: 'ocr'`).
30. **Fuel price = what the pump shows** (owner decision, M5): no external price source, no fetch, no
    server table. The rate comes from the pump-display scan (M4) or typing at each refuel. New refuels
    pre-fill the rate with the *last rate the user paid* (`domain/fuelPrice.ts` `lastPaidRate`: this vehicle's
    latest refuel, else latest of a vehicle of the same type, else empty) as a *soft* value: if litres and
    total are both entered (typed or scanned) the rate is derived from them instead (`applySoftRate`).

## Mileage rules (implemented in M2 — keep exactly)
km/l_k = (odo_k − odo_{k−1}) / litres_{k−1}; every interval stored/shown raw, never skipped or smoothed;
baseline = median of all prior intervals (≥3 needed); flag < 0.85×baseline "Unusual drop" and
> 1.25×baseline "unusually high"; cost/km = litres_{k−1}×rate_{k−1}/distance; latest refuel = "mileage pending";
lifetime avg is reference only. Refuels are already ordered `(timestamp, odometer)` by `repo.refuels.list`.
Anomaly annotations live on refuel k (`anomaly_cause`, `anomaly_note`). Implemented in `src/domain/mileage.ts`.

## Milestone log
- **M1 (done)**: scaffold, auth (phone OTP), local DB + outbox sync + photo queue, vehicle CRUD with
  photos, vehicle switcher, baseline + manual odometer, manual refuel/service entry, history, settings
  (language, sync status, sign out). Tests: 95 Jest + 8 SQL.
- **M2 (done)**: `domain/mileage.ts` engine (per-interval km/l + cost/km, median baseline, drop/high/invalid
  flags, pending, lifetime avg, refuel prediction); Fuel economy screen (stats, raw chart, interval list,
  cause dialog); refuel flow with GPS + station suggestion (edge function + offline history fallback);
  home economy card. Tests: 137 Jest + 12 server.
  Deploy: `supabase functions deploy places-nearby` and `supabase secrets set GOOGLE_PLACES_API_KEY=...`
  (enable "Places API (New)" in Google Cloud).
- **M3 (done)**: service types incl. wash; defaults per owner; reminder rules (auto/custom/off) synced via
  `reminder_rules`; due engine + km/day; Maintenance screen, rule editor, home maintenance card, one-time
  "Any record?" prompts; local notifications for services and predicted refuels. Tests: 179 Jest + 13 server.
- **M4 (done)**: scan number plate / registration card / odometer / pump display with editable confirm;
  ML Kit on device; Claude vision fallback for pump displays (`ocr-pump` edge function). Tests: 202 Jest + 17 server.
  Deploy: `supabase secrets set ANTHROPIC_API_KEY=...` and `supabase functions deploy ocr-pump`.
- **M5 (done)**: fuel price from the pump display only (owner decision) with "last rate you paid" soft
  pre-fill; Home pull-to-refresh (sync); app version in Settings; a11y label on the settings button; README.
  Tests: 208 Jest + 17 server. No new native modules or server changes.
