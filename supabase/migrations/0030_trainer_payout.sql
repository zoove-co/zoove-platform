-- Trainer earnings. The payout is one flat rupee amount per completed session, set by an owner in the admin site (app_settings key
-- 'trainer_payout_paise'). Each completed session keeps the amount that applied when it was closed, so changing the amount later never
-- rewrites past earnings. Sessions closed before an amount was set stay empty until an owner sets one (then they are filled in once).
alter table bookings add column trainer_payout_paise integer check (trainer_payout_paise is null or trainer_payout_paise >= 0);
create index bookings_coach_completed_idx on bookings (coach_id, completed_at desc) where status = 'completed';
insert into app_settings (key, value) values ('trainer_payout_paise', 'null'::jsonb) on conflict (key) do nothing;
