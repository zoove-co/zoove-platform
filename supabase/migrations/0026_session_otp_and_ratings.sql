-- Check-in and check-out codes, the moment a session really started, and the customer's star rating.
-- Every booking gets two random 4-digit codes when it is created (existing rows get theirs now). The customer shows the
-- start code to the trainer on arrival and the finish code after the training. Wrong tries are counted and locked.
alter table bookings
  add column start_code text not null default lpad(floor(random() * 10000)::int::text, 4, '0'),
  add column end_code text not null default lpad(floor(random() * 10000)::int::text, 4, '0'),
  add column started_at timestamptz,
  add column code_attempts integer not null default 0,
  add column code_attempt_at timestamptz;

-- One rating per finished session: the customer rates the trainer.
create table session_ratings (
  booking_id uuid primary key references bookings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  trainer_id uuid not null references users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index session_ratings_trainer_idx on session_ratings (trainer_id, created_at desc);
alter table session_ratings enable row level security;
