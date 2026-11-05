-- A trainer's private note on a session they hold or held. Only that trainer can read or write it through the API.
create table trainer_session_notes (
  booking_id uuid not null references bookings(id) on delete cascade,
  trainer_id uuid not null references users(id) on delete cascade,
  note text not null check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (booking_id, trainer_id)
);
alter table trainer_session_notes enable row level security;
