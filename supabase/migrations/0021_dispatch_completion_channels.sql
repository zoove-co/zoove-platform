-- 0021: trainer dispatch in widening waves, session completion, push devices, package expiry reminders. Additive only.

-- Dispatch: when a session starts "finding a coach" (new, or the trainer dropped, or it was moved to a busy time), the clock
-- restarts and earlier alerts are forgotten, so the nearest trainers are alerted first and the circle widens over time.
alter table bookings add column dispatch_started_at timestamptz;
alter table bookings add column dispatch_wave smallint not null default 0;
-- An instant session nobody took within the limit: the customer was told once and offered to move it to a date or cancel.
alter table bookings add column unfilled_notified_at timestamptz;
-- Completion: set when a trainer (or ops) closes the session. completion_flagged_at: ops were told it is still open after it ended.
alter table bookings add column completed_at timestamptz;
alter table bookings add column completed_by uuid references users(id);
alter table bookings add column completion_flagged_at timestamptz;
create index bookings_dispatch_idx on bookings (dispatch_started_at) where status in ('matching', 'rematching');
create index bookings_completion_idx on bookings (starts_at) where status = 'confirmed' and completion_flagged_at is null;

create function public.bookings_restart_dispatch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('matching', 'rematching') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.dispatch_started_at := now();
    new.dispatch_wave := 0;
    new.unfilled_notified_at := null;
    if tg_op = 'UPDATE' then
      delete from public.job_alerts where booking_id = new.id;
    end if;
  end if;
  return new;
end $$;

-- Who was alerted about which open session. The trainer's job board shows exactly these, so it widens as the waves widen.
create table job_alerts (
  booking_id uuid not null references bookings(id) on delete cascade,
  trainer_id uuid not null references users(id) on delete cascade,
  wave smallint not null,
  alerted_at timestamptz not null default now(),
  primary key (booking_id, trainer_id)
);
create index job_alerts_trainer_idx on job_alerts (trainer_id, alerted_at desc);
alter table job_alerts enable row level security;

create trigger bookings_restart_dispatch before insert or update on bookings
  for each row execute function public.bookings_restart_dispatch();


-- Phones that can receive push messages. One row per app install.
create table notification_devices (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique check (length(token) between 10 and 300),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index notification_devices_user_idx on notification_devices (user_id);
alter table notification_devices enable row level security;

-- Package expiry reminders: each kind is sent once per package.
create table package_reminders (
  purchase_id uuid not null references package_purchases(id) on delete cascade,
  kind text not null check (kind in ('7d', '1d', 'expired')),
  sent_at timestamptz not null default now(),
  primary key (purchase_id, kind)
);
alter table package_reminders enable row level security;

-- Sessions that are open or confirmed when this runs were handled by hand until now. Do not email anyone about them:
-- every open session is shown to every active trainer silently (as if all waves had run), and confirmed sessions that
-- already started are marked as seen so ops are not told about old ones.
update bookings set dispatch_started_at = now(), dispatch_wave = 3 where status in ('matching', 'rematching');
insert into job_alerts (booking_id, trainer_id, wave)
  select b.id, t.user_id, 3 from bookings b cross join trainers t where b.status in ('matching', 'rematching') and t.status = 'active'
  on conflict do nothing;
update bookings set completion_flagged_at = now() where status = 'confirmed' and starts_at is not null and starts_at < now();
