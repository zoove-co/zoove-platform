-- One reminder per trainer per session per start time. A moved session or a new trainer gets a fresh reminder.
create table trainer_session_reminders (
  booking_id uuid not null references bookings(id) on delete cascade,
  trainer_id uuid not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (booking_id, trainer_id, starts_at)
);
alter table trainer_session_reminders enable row level security;
