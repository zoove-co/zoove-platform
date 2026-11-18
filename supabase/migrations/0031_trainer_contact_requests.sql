-- A trainer asks Zoove to change their sign-in email or their mobile number. The email is also how they sign in, so a person at
-- Zoove checks the request (usually with a call) and approves or rejects it in the admin site. Nothing changes until it is approved.
create table trainer_contact_requests (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  old_value text,
  new_value text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
-- One open request per trainer per kind: they can cancel it and send another, but not stack several.
create unique index trainer_contact_requests_one_pending on trainer_contact_requests (user_id, kind) where status = 'pending';
create index trainer_contact_requests_status_idx on trainer_contact_requests (status, created_at);
create index trainer_contact_requests_decided_by_idx on trainer_contact_requests (decided_by) where decided_by is not null;
alter table trainer_contact_requests enable row level security;
