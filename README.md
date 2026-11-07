# FuelTrack

Android app to track fuel economy, running cost and maintenance for bikes and cars in Pakistan
(PKR, km, litres; English + Urdu). Works offline and syncs to Supabase.

- **Per-refuel mileage**: km/l and cost/km for every interval between refuels, never smoothed; unusual drops
  (>15% below your normal) and unusually high values (>25% above, usually an entry error) are flagged.
- **Maintenance reminders**: oil, filter, chain oil (bikes), general service, wash. Due by km or days,
  whichever comes first. Uses your own pattern after two records. Phone notifications work offline.
- **Scanning**: number plate, registration card, odometer and pump display. Read on the phone, with Claude as a
  fallback for pump displays. Every value is shown for you to confirm and edit.
- **Refuel helpers**: time and GPS captured automatically, nearest fuel station suggested. The fuel price is
  read from the pump display at each refuel; without a scan, the last rate you paid is suggested.

## Stack
Expo SDK 58 (React Native 0.88, TypeScript) · expo-router · SQLite (Drizzle) with an outbox sync to
Supabase (Postgres + RLS, phone OTP auth, Storage, Edge Functions) · ML Kit text recognition ·
i18next (en/ur).

## Getting started
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run check                # typecheck, lint, unit tests, server tests
npx eas-cli@latest build --profile development --platform android
npm start                    # with the development build installed (Expo Go won't work)
```

### Supabase setup
1. Apply `supabase/migrations/*.sql` (`supabase db push`, or paste them into the SQL editor in order).
2. Auth → Phone: enable and connect an SMS provider (or add test phone numbers for development).
3. Edge functions and their secrets:
   ```bash
   supabase secrets set GOOGLE_PLACES_API_KEY=... ANTHROPIC_API_KEY=...
   supabase functions deploy places-nearby
   supabase functions deploy ocr-pump
   ```

## Docs
- `CLAUDE.md`: commands, layout and every design decision with its reason.
- `docs/checklists/M1.md` … `M5.md`: manual device test checklists.
