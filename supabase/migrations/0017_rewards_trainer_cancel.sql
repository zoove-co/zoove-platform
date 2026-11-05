-- Rewards (set in the admin panel, switched off until someone fills them in) and trainer cancellations.
-- Additive only: new tables and two new booking columns, nothing existing is changed.

-- What a referral earns. One row per side. Nothing is decided yet (open question 10), so both start switched off and empty.
create table reward_rules (
  side text primary key check (side in ('referrer', 'friend')),
  enabled boolean not null default false,
  kind text check (kind in ('flat', 'percent')),
  flat_off_paise integer check (flat_off_paise > 0),
  percent_off smallint check (percent_off between 1 and 100),
  max_discount_paise integer check (max_discount_paise > 0),
  valid_days smallint not null default 30 check (valid_days between 1 and 365),
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not enabled
         or (kind = 'flat' and flat_off_paise is not null and percent_off is null)
         or (kind = 'percent' and percent_off is not null and flat_off_paise is null)),
  check (kind is distinct from 'flat' or flat_off_paise is not null),
  check (kind is distinct from 'percent' or percent_off is not null),
  check (kind = 'percent' or max_discount_paise is null)
);
insert into reward_rules (side) values ('referrer'), ('friend');
alter table reward_rules enable row level security;

-- A reward is a single-use discount code made for one customer. This records who got which code for which referral,
-- and the unique key means a referral can never pay out twice.
create table referral_rewards (
  id uuid primary key,
  referral_id uuid not null references referrals(id) on delete cascade,
  side text not null check (side in ('referrer', 'friend')),
  user_id uuid not null references users(id),
  discount_code_id uuid not null references discount_codes(id),
  created_at timestamptz not null default now(),
  unique (referral_id, side)
);
create index referral_rewards_user_idx on referral_rewards (user_id);
create index referral_rewards_code_idx on referral_rewards (discount_code_id);
alter table referral_rewards enable row level security;

-- Trainer cancellations: the session goes back to "finding a trainer" and keeps a count and a time for ops.
alter table bookings add column trainer_cancelled_at timestamptz;
alter table bookings add column trainer_cancel_count smallint not null default 0 check (trainer_cancel_count >= 0);
create index bookings_needs_trainer_idx on bookings (status, starts_at) where status in ('matching', 'rematching');
