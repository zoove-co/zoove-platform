-- A trainer's own switch: on = they are offered open sessions, off = they are not. Their confirmed sessions are not affected.
alter table trainers add column accepting_jobs boolean not null default true;
