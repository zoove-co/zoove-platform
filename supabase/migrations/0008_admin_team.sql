-- 0008: the admin team. Who is on the Zoove admin, what they are called, who they report to, and what they may do.
-- An admin is still a users row with the 'admin' role (that is what lets them sign in by email code).
-- admin_profiles adds the team details and the per-person permission switches on top of it.
--
-- job_title is free text on purpose: owners type whatever fits ("Operations", "Support lead") and can change it any time.
-- permissions holds the switches that are ON for this person. An owner (is_owner) has every permission and can manage the team.
-- Removing someone means blocking the users row (status = 'blocked'), never deleting it, so history keeps its author.

create table admin_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  job_title text not null default 'Team member' check (length(btrim(job_title)) between 2 and 60),
  is_owner boolean not null default false,
  reports_to uuid references users(id) on delete set null check (reports_to is distinct from user_id),
  permissions text[] not null default '{}',
  invited_by uuid references users(id) on delete set null,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_profiles_reports_to_idx on admin_profiles (reports_to) where reports_to is not null;
create trigger admin_profiles_set_updated_at before update on admin_profiles
  for each row execute function set_updated_at();

alter table admin_profiles enable row level security;

-- Everyone who is an admin today is a founder: they become owners so nobody is locked out when permissions start being checked.
insert into admin_profiles (user_id, display_name, job_title, is_owner)
select u.id,
       coalesce(nullif(btrim(u.full_name), ''), initcap(split_part(coalesce(u.verified_email, u.email, 'admin@zoove'), '@', 1))),
       'Owner',
       true
  from users u
  join user_roles r on r.user_id = u.id and r.role = 'admin'
on conflict (user_id) do nothing;
