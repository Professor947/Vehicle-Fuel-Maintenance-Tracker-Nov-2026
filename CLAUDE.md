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
- `supabase/migrations/` server schema + RLS; `supabase/tests/` PGlite tests.
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
