-- 0019: referral reward starting values (open question 10, decided by the founders).
-- Both sides get 10% off, one use, valid 15 days. The rewards stay SWITCHED OFF: an owner turns them on in Admin > Rewards,
-- and can change the percent or the days there at any time (it only affects rewards given after the change).
-- Data only, and only touches a rule nobody has edited yet (never switched on, never saved by an admin).
update reward_rules
   set kind = 'percent', percent_off = 10, valid_days = 15
 where not enabled and kind is null and flat_off_paise is null and percent_off is null and updated_by is null;
