-- 0003: first and last name on users, description on service styles.
-- The apps show first and last name separately, so storing one full_name would mean guessing the split.
-- full_name stays for now (nothing reads it); drop it in a later migration once confirmed unused.

alter table users add column first_name text;
alter table users add column last_name text;
comment on column users.full_name is 'Deprecated: use first_name and last_name.';

alter table service_formats add column description text;
