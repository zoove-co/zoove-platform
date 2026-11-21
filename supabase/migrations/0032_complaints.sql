-- Complaints. A customer or a trainer raises one about an upcoming session, a past session, or anything else. Each complaint is its own chat
-- thread between that person and the Zoove team, and stays open until the team resolves it. A customer's thread and a trainer's thread are
-- always separate, even when both are about the same session.
create table complaints (
  id uuid primary key,
  -- Shown to people and quoted on calls: ZC- plus the last 8 letters of the id, the same style as a session code (ZV-).
  code text generated always as ('ZC-' || upper(right(replace(id::text, '-', ''), 8))) stored,
  user_id uuid not null references users(id) on delete cascade,
  side text not null check (side in ('customer', 'trainer')),
  -- The session this is about. Empty for a general complaint.
  booking_id uuid references bookings(id) on delete set null,
  category text not null check (category in (
    'trainer_late_or_no_show', 'trainer_behaviour', 'session_quality', 'payment_or_package', 'app_problem',
    'customer_unavailable', 'customer_behaviour', 'payout', 'app_or_job_problem', 'other'
  )),
  subject text not null check (length(subject) between 3 and 120),
  -- open = waiting for Zoove, waiting_on_user = Zoove replied and is waiting for the person, resolved = closed.
  status text not null default 'open' check (status in ('open', 'waiting_on_user', 'resolved')),
  -- Safety and conduct complaints are marked urgent so they are seen first.
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  assigned_to uuid references users(id) on delete set null,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  -- The last time the team replied, and the last time the person opened the thread. A reply newer than the read time is "unread" in the app.
  last_admin_reply_at timestamptz,
  user_read_at timestamptz not null default now(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null)),
  constraint complaints_idempotency_unique unique (user_id, idempotency_key)
);
create unique index complaints_code_key on complaints (code);
create index complaints_user_idx on complaints (user_id, last_message_at desc);
-- The team's inbox: everything not yet resolved, urgent and oldest first.
create index complaints_inbox_idx on complaints (side, status, priority, last_message_at) where status <> 'resolved';
create index complaints_booking_idx on complaints (booking_id) where booking_id is not null;
create index complaints_assigned_idx on complaints (assigned_to) where assigned_to is not null;
create index complaints_resolved_by_idx on complaints (resolved_by) where resolved_by is not null;
create trigger complaints_set_updated_at before update on complaints
  for each row execute function set_updated_at();
alter table complaints enable row level security;

-- The messages in a thread. 'user' is the customer or trainer who raised it, 'admin' is the Zoove team, 'system' is Zoove saying something
-- automatically (for example "this was resolved"). An internal message is a note between team members: the person never sees it.
create table complaint_messages (
  id uuid primary key,
  complaint_id uuid not null references complaints(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('user', 'admin', 'system')),
  sender_user_id uuid references users(id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  check (not internal or sender_kind = 'admin')
);
create index complaint_messages_thread_idx on complaint_messages (complaint_id, created_at);
create index complaint_messages_sender_idx on complaint_messages (sender_user_id) where sender_user_id is not null;
alter table complaint_messages enable row level security;
