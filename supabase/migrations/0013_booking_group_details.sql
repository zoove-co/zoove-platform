-- Who a Duo / Loved one / Group booking is for (open questions 5, 8, 9: rules still to be confirmed by Pratik).
-- Group: how many people. Loved one: the other person's name and mobile number so the coach can reach them.
alter table bookings
  add column group_size smallint,
  add column recipient_name text,
  add column recipient_phone text;

alter table bookings add constraint bookings_group_size_check check (
  (participant = 'group' and group_size between 3 and 30) or (participant <> 'group' and group_size is null)
);
alter table bookings add constraint bookings_recipient_check check (
  (participant = 'loved_one' and length(btrim(recipient_name)) between 2 and 80 and recipient_phone ~ '^\+91[6-9][0-9]{9}$')
  or (participant <> 'loved_one' and recipient_name is null and recipient_phone is null)
);
