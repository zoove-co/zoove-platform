-- 0001_foundation.sql
-- Foundation schema: identity, consent, addresses, clusters, service catalog, events, audit.
-- Deliberately NOT included yet (waiting on product decisions): bookings, trainers/matching,
-- packs/credits, pricing, payments. Those arrive in 0002+ once Pratik confirms the model.
--
-- Conventions
--   * ids: uuid. The API generates UUIDv7 values; gen_random_uuid() is only a fallback default.
--   * money: integer paise (never float) in later migrations.
--   * all timestamps are timestamptz (UTC).
--   * phone numbers are stored in E.164 format.
--   * RLS is enabled on every table with NO policies: the Supabase anon/authenticated keys can
--     read nothing. Only the API (direct database connection) touches data.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'trainer', 'admin');
create type user_status as enum ('active', 'blocked', 'deleted');
create type cluster_status as enum ('locked', 'active');

-- ---------------------------------------------------------------------------
-- Identity (own OTP login; no vendor auth)
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  full_name text,
  email text,
  status user_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_key on users (lower(email)) where email is not null;
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role user_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_challenges_phone_idx on otp_challenges (phone_e164, created_at desc);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  device jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Customer profile and consent
-- ---------------------------------------------------------------------------
create table customer_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  gender text check (gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  birth_year smallint check (birth_year between 1900 and 2100),
  height_cm smallint check (height_cm between 50 and 260),
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),
  goals text[] not null default '{}',
  focus_areas text[] not null default '{}',
  target_days_per_week smallint check (target_days_per_week between 1 and 7),
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column customer_profiles.medical_notes is
  'SENSITIVE health data. Collect only with a recorded health_data consent; restrict who can read it.';
create trigger customer_profiles_set_updated_at before update on customer_profiles
  for each row execute function set_updated_at();

create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'health_data', 'marketing')),
  version text not null,
  accepted boolean not null,
  ip inet,
  recorded_at timestamptz not null default now()
);
create index consents_user_kind_idx on consents (user_id, kind, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Clusters (polygon-based serviceability) and addresses
-- ---------------------------------------------------------------------------
create table clusters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null default 'Mumbai',
  rollout_stage smallint not null,
  status cluster_status not null default 'locked',
  boundary extensions.geography(MultiPolygon, 4326),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clusters_boundary_gix on clusters using gist (boundary);
create trigger clusters_set_updated_at before update on clusters
  for each row execute function set_updated_at();

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  locality text,
  city text not null default 'Mumbai',
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  location extensions.geography(Point, 4326) not null,
  cluster_id uuid references clusters(id),
  is_default boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on addresses (user_id) where deleted_at is null;
create index addresses_location_gix on addresses using gist (location);
create unique index addresses_one_default_per_user
  on addresses (user_id) where is_default and deleted_at is null;
create trigger addresses_set_updated_at before update on addresses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Service catalog (data, not code: new services and verticals are admin changes)
-- ---------------------------------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  vertical text not null default 'fitness',
  slug text not null unique,
  name text not null,
  tagline text,
  description text,
  duration_min_minutes smallint not null,
  duration_max_minutes smallint not null,
  intensity text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_max_minutes >= duration_min_minutes)
);
create trigger services_set_updated_at before update on services
  for each row execute function set_updated_at();

create table service_formats (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  unique (service_id, slug)
);

-- ---------------------------------------------------------------------------
-- Events: transactional outbox (reliable side effects) and our own analytics copy
-- ---------------------------------------------------------------------------
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  attempts smallint not null default 0,
  last_error text
);
create index outbox_events_unpublished_idx on outbox_events (created_at) where published_at is null;

create table event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  anonymous_id text,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  source text not null check (source in ('customer_app', 'trainer_app', 'admin', 'website', 'api')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index event_log_name_time_idx on event_log (name, occurred_at desc);
create index event_log_user_time_idx on event_log (user_id, occurred_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lock the public API surface: deny everything to the Supabase client roles
-- ---------------------------------------------------------------------------
alter table users enable row level security;
alter table user_roles enable row level security;
alter table otp_challenges enable row level security;
alter table refresh_tokens enable row level security;
alter table customer_profiles enable row level security;
alter table consents enable row level security;
alter table clusters enable row level security;
alter table addresses enable row level security;
alter table services enable row level security;
alter table service_formats enable row level security;
alter table outbox_events enable row level security;
alter table event_log enable row level security;
alter table audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
