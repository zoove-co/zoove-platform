-- The mobile number a customer gives when they book (asked at checkout if missing). It is a contact number the
-- customer typed: NOT verified, and kept apart from phone_e164, which is the verified number used to sign in by SMS.
alter table users add column contact_phone text check (contact_phone is null or contact_phone ~ '^\+91[6-9][0-9]{9}$');
