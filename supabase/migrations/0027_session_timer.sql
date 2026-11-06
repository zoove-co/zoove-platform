-- The session clock: set when the trainer checks in (start time + the service's length). The finish code is shown to the
-- customer, and accepted from the trainer, only once this time is over. time_up_notified_at makes "session is over" go out once.
alter table bookings
  add column ends_at timestamptz,
  add column time_up_notified_at timestamptz;
