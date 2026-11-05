-- 0016: Duo/Group placeholder pricing, packages and credits, party requests, referrals.

-- Duo, Loved one and Group are priced as a share of the Personal price. These numbers are PLACEHOLDERS until
-- Pratik answers open questions 5, 8 and 9. per_head means the percent applies to each person in the group.
create table participant_pricing (
  participant text primary key check (participant in ('duo', 'loved_one', 'group')),
  percent_of_personal integer not null check (percent_of_personal between 1 and 1000),
  per_head boolean not null default false,
  is_placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table participant_pricing enable row level security;
insert into participant_pricing (participant, percent_of_personal, per_head) values
  ('duo', 160, false), ('loved_one', 100, false), ('group', 70, true);

-- Packages: bundles of sessions. A purchase waits for payment until ops mark it paid (Razorpay plugs in later).
create table packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  sessions_count integer not null check (sessions_count between 1 and 200),
  price_paise integer not null check (price_paise >= 0),
  original_price_paise integer check (original_price_paise is null or original_price_paise >= price_paise),
  validity_days integer check (validity_days is null or validity_days between 1 and 1825),
  badge text check (length(badge) <= 30),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger packages_set_updated_at before update on packages for each row execute function set_updated_at();
alter table packages enable row level security;
-- PLACEHOLDER packages so the screen has something to show. Edit them in the admin panel.
insert into packages (name, sessions_count, price_paise, original_price_paise, validity_days, badge, sort_order) values
  ('4 sessions', 4, 540000, 600000, 60, null, 1),
  ('8 sessions', 8, 1000000, 1200000, 120, 'Popular', 2),
  ('12 sessions', 12, 1380000, 1800000, 180, 'Best value', 3);

create table package_purchases (
  id uuid primary key,
  user_id uuid not null references users(id),
  package_id uuid references packages(id),
  name text not null,
  sessions_count integer not null,
  list_price_paise integer not null,
  discount_code text,
  discount_paise integer not null default 0 check (discount_paise >= 0),
  total_paise integer not null check (total_paise >= 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled')),
  payment_method text,
  payment_reference text,
  paid_at timestamptz,
  marked_paid_by uuid references users(id),
  validity_days integer,
  expires_at timestamptz,
  credits_total integer not null,
  credits_used integer not null default 0,
  idempotency_key text not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credits_used between 0 and credits_total),
  unique (user_id, idempotency_key)
);
create index package_purchases_user_idx on package_purchases (user_id, created_at desc);
create index package_purchases_status_idx on package_purchases (status, created_at desc);
create trigger package_purchases_set_updated_at before update on package_purchases for each row execute function set_updated_at();
alter table package_purchases enable row level security;

-- A session paid with a package credit points at the purchase it used, so cancelling can give the credit back.
alter table bookings add column package_purchase_id uuid references package_purchases(id);

-- A discount code can be redeemed on a package purchase too.
alter table discount_redemptions add column package_purchase_id uuid references package_purchases(id);
create unique index discount_redemptions_purchase_key on discount_redemptions (package_purchase_id) where package_purchase_id is not null;

-- Party requests: the customer asks, the Zoove team calls and confirms. No price, no payment.
create table party_requests (
  id uuid primary key,
  user_id uuid not null references users(id),
  occasion text not null check (occasion in ('birthday', 'friends', 'family', 'team')),
  service_slug text not null,
  guests smallint not null check (guests between 2 and 30),
  starts_at timestamptz not null,
  address_id uuid references addresses(id),
  address_label text,
  address_line text,
  address_area text,
  address_pincode text,
  contact_name text,
  contact_phone text,
  note text check (length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'cancelled')),
  admin_note text check (length(admin_note) <= 1000),
  handled_by uuid references users(id),
  handled_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index party_requests_status_idx on party_requests (status, created_at desc);
create trigger party_requests_set_updated_at before update on party_requests for each row execute function set_updated_at();
alter table party_requests enable row level security;

-- Referrals: each customer has one code; the reward is undecided (open question 10), so only the link is tracked.
create table referral_codes (
  user_id uuid primary key references users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);
alter table referral_codes enable row level security;
create table referrals (
  id uuid primary key,
  referrer_id uuid not null references users(id),
  referred_id uuid not null unique references users(id),
  code text not null,
  status text not null default 'signed_up' check (status in ('signed_up', 'booked')),
  created_at timestamptz not null default now(),
  booked_at timestamptz,
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on referrals (referrer_id);
alter table referrals enable row level security;
