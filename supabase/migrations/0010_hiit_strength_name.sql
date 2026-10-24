-- Pratik (24 Oct 2026): the "Strength" service is shown as "HIIT/Strength". Only the display name changes; the slug stays 'strength'.
update services set name = 'HIIT/Strength' where slug = 'strength';
