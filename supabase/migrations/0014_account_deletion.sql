-- 0014: delete my account.
-- A deleted customer keeps their row (orders and payments must stay for accounts and disputes) but loses every
-- personal detail. So the row may have no phone and no email any more, and a loved-one booking may have its
-- other person's name and number wiped.
alter table users drop constraint users_has_identity;
alter table users add constraint users_has_identity check (status = 'deleted' or phone_e164 is not null or verified_email is not null);

alter table bookings drop constraint bookings_recipient_check;
alter table bookings add constraint bookings_recipient_check check (
  (participant = 'loved_one' and (
     (length(btrim(recipient_name)) between 2 and 80 and recipient_phone ~ '^\+91[6-9][0-9]{9}$')
     or (recipient_name is null and recipient_phone is null)))
  or (participant <> 'loved_one' and recipient_name is null and recipient_phone is null)
);
