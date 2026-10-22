-- 0006: trainer onboarding (KYC). Trainers apply on the web now and in the trainer app later; both use the same tables.
-- Files (Aadhaar copy, PAN, certificates, selfie) live in PRIVATE object storage. This database keeps only the
-- storage key and the review status of each file, never the file itself.

create type trainer_application_status as enum ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
create type trainer_document_kind as enum ('aadhaar_front', 'aadhaar_back', 'pan_card', 'selfie', 'certificate', 'other');
create type trainer_document_status as enum ('uploaded', 'accepted', 'rejected', 'replaced');

create table trainer_applications (
  id uuid primary key,
  user_id uuid not null unique references users(id),
  status trainer_application_status not null default 'draft',

  first_name text,
  last_name text,
  date_of_birth date,
  gender text check (gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  email text,
  address_line text,
  address_area text,
  address_city text not null default 'Mumbai',
  address_pincode text check (address_pincode ~ '^[1-9][0-9]{5}$'),

  -- Service slugs (yoga, strength, ...). Checked against the services table by the API.
  specialties text[] not null default '{}',
  experience_years smallint check (experience_years between 0 and 60),
  languages text[] not null default '{}',
  bio text check (length(bio) <= 1000),

  -- PAN is encrypted by the API (AES-256-GCM). pan_hash lets us spot the same PAN used twice without decrypting.
  pan_encrypted text,
  pan_last4 text check (pan_last4 ~ '^[A-Z0-9]{4}$'),
  pan_hash text,
  -- Aadhaar: only the last 4 digits are ever stored. The full number is never kept.
  aadhaar_last4 text check (aadhaar_last4 ~ '^[0-9]{4}$'),

  consent_version text,
  consented_at timestamptz,
  source text check (length(source) <= 60),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index trainer_applications_pan_hash_key on trainer_applications (pan_hash) where pan_hash is not null;
create index trainer_applications_status_idx on trainer_applications (status, submitted_at);
create index trainer_applications_reviewed_by_idx on trainer_applications (reviewed_by) where reviewed_by is not null;
create trigger trainer_applications_set_updated_at before update on trainer_applications
  for each row execute function set_updated_at();
alter table trainer_applications enable row level security;

create table trainer_documents (
  id uuid primary key,
  application_id uuid not null references trainer_applications(id) on delete cascade,
  kind trainer_document_kind not null,
  storage_key text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  status trainer_document_status not null default 'uploaded',
  reviewer_note text,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz
);
-- One current file per single-file kind; certificates and "other" can have several.
create unique index trainer_documents_one_current
  on trainer_documents (application_id, kind)
  where status <> 'replaced' and kind in ('aadhaar_front', 'aadhaar_back', 'pan_card', 'selfie');
create index trainer_documents_application_idx on trainer_documents (application_id);
alter table trainer_documents enable row level security;

-- Every step of a review, for support and for proof of who approved whom.
create table trainer_application_events (
  id uuid primary key,
  application_id uuid not null references trainer_applications(id) on delete cascade,
  type text not null,
  actor text not null check (actor in ('trainer', 'admin', 'system')),
  actor_user_id uuid references users(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index trainer_application_events_application_idx on trainer_application_events (application_id, created_at);
create index trainer_application_events_actor_idx on trainer_application_events (actor_user_id) where actor_user_id is not null;
alter table trainer_application_events enable row level security;

-- The approved trainer. Created when an application is approved; customer and trainer apps read trainers from here.
create table trainers (
  user_id uuid primary key references users(id),
  application_id uuid not null unique references trainer_applications(id),
  status text not null default 'active' check (status in ('active', 'paused', 'suspended')),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trainers_set_updated_at before update on trainers
  for each row execute function set_updated_at();
alter table trainers enable row level security;

-- The background worker retries failed events with a growing delay instead of hammering a failing service.
alter table outbox_events add column next_attempt_at timestamptz not null default now();
