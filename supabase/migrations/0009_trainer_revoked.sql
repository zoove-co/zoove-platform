-- 0009: an approved trainer can be paused, suspended, revoked and resumed from the admin panel.
-- 'paused' and 'suspended' already existed; 'revoked' is new. Why each change is made is kept in the application history.
alter table trainers drop constraint trainers_status_check;
alter table trainers add constraint trainers_status_check check (status in ('active', 'paused', 'suspended', 'revoked'));
