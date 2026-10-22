-- 0004_bookings.sql
-- Addresses get plain coordinates, serviceability by pincode, prices as data (D13), and bookings.
-- Deliberately NOT here yet: trainers/coaches (coach columns are plain uuids until that table exists),
-- packs/credits, payments. Business rules still open are marked "ASSUMPTION" in the API code.

-- Addresses: keep the pin as plain numbers. The PostGIS `location` column is filled later, when
-- cluster polygons exist, and is no longer required (a typed address can have no pin).
alter table addresses add column latitude double precision;
alter table addresses add column longitude double precision;
alter table addresses alter column location drop not null;
alter table addresses add constraint addresses_pin_pair check ((latitude is null) = (longitude is null));
alter table addresses add constraint addresses_pin_range
  check (latitude between -90 and 90 and longitude between -180 and 180);

-- Serviceability today = the address pincode belongs to an ACTIVE cluster. Polygon checks come later.
create table cluster_pincodes (
  cluster_id uuid not null references clusters(id) on delete cascade,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  primary key (cluster_id, pincode)
);
create index cluster_pincodes_pincode_idx on cluster_pincodes (pincode);
alter table cluster_pincodes enable row level security;

create type booking_mode as enum ('instant', 'scheduled', 'demo');
create type booking_status as enum ('matching', 'confirmed', 'rematching', 'completed', 'cancelled');

-- Prices are records the admin edits (D13). A row with service_id null is the default for every service;
-- a row for one service overrides it.
create table service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  mode booking_mode not null,
  price_paise integer not null check (price_paise >= 0),
  original_price_paise integer check (original_price_paise is null or original_price_paise >= price_paise),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index service_prices_one_active
  on service_prices (coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid), mode)
  where is_active;
create trigger service_prices_set_updated_at before update on service_prices
  for each row execute function set_updated_at();
alter table service_prices enable row level security;

create table bookings (
  id uuid primary key,
  user_id uuid not null references users(id),
  service_id uuid not null references services(id),
  format_id uuid not null references service_formats(id),
  mode booking_mode not null,
  participant text not null default 'personal' check (participant = 'personal'),
  address_id uuid not null references addresses(id),
  -- Snapshot of the address at booking time, so later edits never rewrite history.
  address_label text not null,
  address_line text not null,
  address_area text,
  address_pincode text,
  starts_at timestamptz,
  status booking_status not null,
  -- Plain uuids until the trainers table exists (then these become foreign keys).
  coach_id uuid,
  preferred_coach_id uuid,
  total_paise integer not null check (total_paise >= 0),
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  request_fingerprint text not null,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'trainer', 'admin', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode = 'instant' or starts_at is not null),
  constraint bookings_idempotency_unique unique (user_id, idempotency_key)
);
create index bookings_user_created_idx on bookings (user_id, created_at desc);
-- One live booking per customer per start time. The database enforces it, so two simultaneous requests cannot both win.
create unique index bookings_no_double_booking
  on bookings (user_id, starts_at)
  where starts_at is not null and status in ('matching', 'confirmed', 'rematching');
create trigger bookings_set_updated_at before update on bookings
  for each row execute function set_updated_at();
alter table bookings enable row level security;

-- Every change to a booking, for support and for analytics.
create table booking_events (
  id uuid primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null,
  actor text not null check (actor in ('customer', 'trainer', 'admin', 'system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);
alter table booking_events enable row level security;
