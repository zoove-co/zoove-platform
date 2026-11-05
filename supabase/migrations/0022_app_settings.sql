-- 0022: small platform switches ops can flip in the admin site. First one: alert every trainer in the city at once.
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
-- off = widening waves (pincode, then cluster, then city). on = every eligible trainer is alerted at once.
insert into app_settings (key, value) values ('dispatch_alert_all', 'false'::jsonb);
