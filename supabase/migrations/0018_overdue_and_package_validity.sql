-- Overdue sessions and 60-day packages. Additive only.

-- When a scheduled session's start time passes with no trainer, the customer is told once. This records that, so the
-- notice is never sent twice. It is cleared when the customer moves the session to a new time.
alter table bookings add column overdue_notified_at timestamptz;
create index bookings_overdue_idx on bookings (starts_at) where status in ('matching', 'rematching') and overdue_notified_at is null;

-- Every package lives 60 days from the day it is marked paid (founder decision, 5 Nov 2026). The two larger placeholder
-- packages were seeded with 120 and 180 days; bring them in line. Packages already bought keep the expiry they were given.
alter table packages alter column validity_days set default 60;
update packages set validity_days = 60 where name in ('8 sessions', '12 sessions') and validity_days in (120, 180);
