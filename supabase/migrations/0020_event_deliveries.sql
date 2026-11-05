-- 0020: send business events to outside tools (CleverTap now, others later) without touching the email worker.
-- outbox_events stays the single list of what happened. One row here says "this event was handled for this destination",
-- so every destination keeps its own progress and a new destination can replay all history.
create table event_deliveries (
  event_id uuid not null references outbox_events(id) on delete cascade,
  destination text not null,
  status text not null check (status in ('delivered', 'skipped', 'failed')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (event_id, destination)
);
create index event_deliveries_retry_idx on event_deliveries (destination, next_attempt_at) where status = 'failed';
alter table event_deliveries enable row level security;
