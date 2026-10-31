-- BATCH 3 (DRAFT, not wired): employees. Ship only if owners confirm they would use it.
-- Staff are keyed to the owner's phone, the same way customers use shop_id = owner phone.
create table if not exists staff (
  id bigserial primary key,
  owner_phone text not null,
  phone text not null,
  name text,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (owner_phone, phone)
);
create index if not exists staff_phone_idx on staff (phone) where active;
