-- 0015: discount codes. One engine for goodwill, emergencies, misconduct make-goods, referral rewards and promos.
-- An admin creates a code (percent or flat amount off); the customer types it at checkout; the API checks it here
-- and takes that much off. Prices still come only from the server.

create table discount_codes (
  id uuid primary key,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9]{4,20}$'),
  kind text not null check (kind in ('percent', 'flat')),
  percent_off smallint check (percent_off between 1 and 100),
  flat_off_paise integer check (flat_off_paise > 0),
  -- Cap for a percent code, so "50% off" cannot become a huge amount on a big order.
  max_discount_paise integer check (max_discount_paise > 0),
  reason text not null check (reason in ('goodwill', 'emergency', 'misconduct', 'referral', 'promo', 'other')),
  note text check (length(note) <= 500),
  -- When set, only this customer can use the code.
  assigned_user_id uuid references users(id),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 100000),
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  min_order_paise integer not null default 0 check (min_order_paise >= 0),
  applies_to text not null default 'any' check (applies_to in ('any', 'session', 'package')),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'percent' and percent_off is not null and flat_off_paise is null)
      or (kind = 'flat' and flat_off_paise is not null and percent_off is null)),
  check (kind = 'percent' or max_discount_paise is null),
  check (per_user_limit <= max_redemptions),
  check (expires_at is null or expires_at > valid_from)
);
create unique index discount_codes_code_key on discount_codes (code);
create index discount_codes_assigned_idx on discount_codes (assigned_user_id) where assigned_user_id is not null;
create trigger discount_codes_set_updated_at before update on discount_codes
  for each row execute function set_updated_at();
alter table discount_codes enable row level security;

-- One row each time a code is used. Cancelling the booking releases it (released_at), so the customer does not lose the code.
create table discount_redemptions (
  id uuid primary key,
  code_id uuid not null references discount_codes(id),
  user_id uuid not null references users(id),
  booking_id uuid references bookings(id),
  discount_paise integer not null check (discount_paise >= 0),
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index discount_redemptions_booking_key on discount_redemptions (booking_id) where booking_id is not null;
create index discount_redemptions_user_idx on discount_redemptions (code_id, user_id) where released_at is null;
alter table discount_redemptions enable row level security;

-- Wrong guesses, so a customer cannot try codes one after another.
create table discount_attempts (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index discount_attempts_user_idx on discount_attempts (user_id, created_at desc);
alter table discount_attempts enable row level security;

-- What was taken off, kept on the booking itself. total_paise stays "what the customer pays".
alter table bookings add column discount_code text;
alter table bookings add column discount_paise integer not null default 0 check (discount_paise >= 0);
