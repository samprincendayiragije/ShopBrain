# Batch 1: protection and monitoring

## Deploy order
1. Run `migrations/001_batch1_protection.sql` in the Supabase SQL editor (safe to run twice).
2. Merge and deploy. If step 1 was missed, reminders keep working with the old behaviour and an error is logged.
3. Set `SAM_PHONE_NUMBER` (already used for flagged-issue notices) for the digest and alerts.

## What it does
- **Max 2 reminders per customer per day, across all shops.** The third is blocked, the owner is told, and the number is flagged (`phone_flags`, `GET /api/admin/flags`). Counted from `reminder_logs`, Kigali day, failed sends excluded. Single, "send to everyone" and auto reminders all go through `reserveReminder()` in `src/lib/guard.ts`.
- **Trial caps**, only for owners whose `trial_ends_at` is in the future: 30 customers, 20 reminders per day. Raise or lower per owner with `owners.max_customers` / `owners.max_reminders_per_day`, or globally with `TRIAL_MAX_CUSTOMERS` / `TRIAL_MAX_REMINDERS_PER_DAY`. Owners out of trial are not capped unless given a per-owner limit.
- **Activity log** (`activity_log`, `GET /api/admin/activity?owner=&action=&limit=`): add debt, payment, mark paid, reminder sent/blocked, STOP, owner activate/deactivate, alerts.
- **Morning digest** (once a day from 07:00 Kigali) and **alerts** (every 15 min: failure spike, STOP spike, an owner sending far above usual, newly flagged number) to `SAM_PHONE_NUMBER`. `GET /api/admin/digest` shows the digest on demand. Both honour `SCHEDULERS_OFF=1`.
- **Kill switch** already existed: the admin Deactivate / Activate buttons (`owners.is_active`). Now logged.

## Not done / decisions for you
- **"Limited signups per number" is not implemented**: owners are created by the admin, there is no self-signup by texting "hi".
- **Trial expiry is not enforced** anywhere in the existing code (only the caps above). Add a check in `isOwner()` when you want it.
- **Dashboard UI** for flags and activity is not built; the endpoints are ready.
- Kinyarwanda strings in `guard.ts` are a first draft: please have a Kinyarwanda speaker check them.
- The new tables are accessed with `SUPABASE_ANON_KEY`; make sure RLS on them matches `owners` / `reminder_logs`.
- Photo import counts every distinct person in the photo as new, so a trial owner right at the limit can be blocked even if some customers already exist.
- When an owner hits their daily cap during auto-reminders, the rest wait for the next day's run silently.
- Digest and alerts are plain WhatsApp text: outside Meta's 24h window they only arrive if you message the bot that day.

## Verified
`pnpm typecheck` and `node build.mjs` pass. The SQL function was run against a real Postgres 16 (cross-shop counting across phone formats, third reminder blocked and flagged, failed sends don't count, migration runs twice). Not tested against your live Supabase or WhatsApp.
