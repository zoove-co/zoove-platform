-- 0005: indexes on foreign keys, two integrity checks, and switch off the dropped HIIT styles.

-- Foreign keys without an index make joins and deletes scan the whole table.
create index bookings_address_idx on bookings (address_id);
create index bookings_service_idx on bookings (service_id);
create index bookings_format_idx on bookings (format_id);
create index addresses_cluster_idx on addresses (cluster_id) where cluster_id is not null;
create index service_prices_service_idx on service_prices (service_id) where service_id is not null;
create index audit_log_actor_idx on audit_log (actor_user_id) where actor_user_id is not null;

-- A cancelled booking must say when it was cancelled, and a live one must not.
alter table bookings add constraint bookings_cancel_consistent
  check ((status = 'cancelled') = (cancelled_at is not null));

-- Duration range must make sense; intensity limited to known values (add more here when needed).
alter table services add constraint services_duration_order check (duration_min_minutes <= duration_max_minutes);
alter table services add constraint services_intensity_known
  check (intensity is null or intensity in ('low', 'low_moderate', 'moderate', 'moderate_high', 'high'));

-- HIIT was dropped from the app; its styles stay in the table but hidden.
update service_formats set is_active = false
 where service_id in (select id from services where is_active = false);
