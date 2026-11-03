-- Duo, Loved one and Group bookings (open questions 5, 8, 9: pricing and rules per participant type are still to be confirmed).
-- Until Pratik answers, every participant type is priced like Personal and the booking just records who it is for.
alter table bookings drop constraint bookings_participant_check;
alter table bookings add constraint bookings_participant_check check (participant in ('personal', 'duo', 'loved_one', 'group'));
