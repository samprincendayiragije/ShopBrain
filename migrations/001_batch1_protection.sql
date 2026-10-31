-- BATCH 1: protection and monitoring.
-- Run this in the Supabase SQL editor BEFORE deploying the code.
-- It is safe to run twice. The code also keeps working if it has NOT been run yet
-- (reminders fall back to the old behaviour and an error is logged).
--
-- The owners table already has is_active (the kill switch, used by the admin
-- Deactivate / Activate buttons) and trial_ends_at, so nothing is added for those.
--
-- NOTE ON ACCESS: the api-server connects with SUPABASE_ANON_KEY (src/lib/supabase.ts).
-- The new tables must be reachable the same way owners / customers / reminder_logs are.
-- If those tables have row level security OFF, leave these as they are. If they use
-- policies, add the same policies here, otherwise logging will silently do nothing.

alter table owners
  add column if not exists max_customers int,           -- NULL = use the trial default (30)
  add column if not exists max_reminders_per_day int;   -- NULL = use the trial default (20)

create table if not exists activity_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  owner_phone text,
  actor_phone text,
  action text not null,
  target text,
  meta jsonb not null default '{}'
);
create index if not exists activity_log_at_idx on activity_log (at desc);
create index if not exists activity_log_owner_idx on activity_log (owner_phone, at desc);
create index if not exists activity_log_action_idx on activity_log (action, at desc);

create table if not exists phone_flags (
  phone text primary key,
  reason text not null,
  flagged_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- Speeds up the per-customer daily count (digits-only phone, any shop).
create index if not exists reminder_logs_phone_digits_idx
  on reminder_logs ((regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')), created_at desc);

-- Atomic cap: a customer phone can receive at most p_max_per_day reminders per
-- Kigali day, counted across ALL shops. Inserts the usual 'pending' reminder_logs
-- row and returns it as JSON. Returns NULL (and flags the number) when blocked.
-- 'failed' reminders do not count. Replaces the plain reminder_logs insert in the code.
create or replace function reserve_reminder_log(
  p_owner_phone text,
  p_customer_name text,
  p_customer_phone text,
  p_amount numeric,
  p_is_auto boolean default false,
  p_quiet boolean default false,
  p_max_per_day int default 2
) returns jsonb
language plpgsql
as $$
declare
  norm text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  day_start timestamptz :=
    date_trunc('day', now() at time zone 'Africa/Kigali') at time zone 'Africa/Kigali';
  n int;
  r jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(norm));

  select count(*) into n
    from reminder_logs
   where regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g') = norm
     and created_at >= day_start
     and coalesce(status, '') <> 'failed';

  if n >= p_max_per_day then
    insert into phone_flags (phone, reason)
      values (norm, 'Reminder blocked: ' || p_max_per_day || ' per day limit reached')
      on conflict (phone) do update
        set reason = excluded.reason, flagged_at = now(), resolved = false;
    insert into activity_log (owner_phone, action, target, meta)
      values (p_owner_phone, 'reminder_blocked_customer_cap', norm,
              jsonb_build_object('count_today', n));
    return null;
  end if;

  insert into reminder_logs
    (message_id, owner_phone, customer_name, customer_phone, amount, status, is_auto, quiet)
  values
    ('pending_' || norm || '_' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
     p_owner_phone, p_customer_name, p_customer_phone, p_amount, 'pending', p_is_auto, p_quiet)
  returning to_jsonb(reminder_logs.*) into r;

  return r;
end $$;
