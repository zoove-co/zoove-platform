-- 0007: sign in with an email code (trainer web page and admin panel), alongside the phone code.
-- Why: SMS needs DLT approval, which takes days. Email codes work now and stay useful afterwards for admins.
--
-- users.verified_email is separate from users.email on purpose. users.email is the profile email a customer
-- types in and is NOT proven. verified_email is only ever set by a successful email code, so nobody can take over
-- someone's login by typing their address into a profile.

alter table users alter column phone_e164 drop not null;
alter table users add column verified_email text;
alter table users add constraint users_verified_email_format
  check (verified_email is null or (verified_email = lower(verified_email) and verified_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
alter table users add constraint users_has_identity check (phone_e164 is not null or verified_email is not null);
create unique index users_verified_email_key on users (verified_email) where verified_email is not null;

alter table otp_challenges alter column phone_e164 drop not null;
alter table otp_challenges add column email text;
alter table otp_challenges add constraint otp_challenges_one_target check ((phone_e164 is null) <> (email is null));
create index otp_challenges_email_idx on otp_challenges (email, created_at desc) where email is not null;

-- The phone a trainer types into the form. NOT verified until the trainer signs in by SMS in the trainer app.
alter table trainer_applications add column phone_e164 text check (phone_e164 ~ '^\+91[6-9][0-9]{9}$');
