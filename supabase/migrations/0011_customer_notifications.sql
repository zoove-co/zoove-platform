-- 0011: in-app notifications for customers (the bell in the customer app).
-- Written in the same transaction as the booking change they describe. Push messages come later.

create table customer_notifications (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 500),
  booking_id uuid references bookings(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_notifications_user_idx on customer_notifications (user_id, created_at desc);
create index customer_notifications_booking_idx on customer_notifications (booking_id) where booking_id is not null;
alter table customer_notifications enable row level security;
