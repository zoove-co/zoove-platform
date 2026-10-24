-- seed.sql: development / staging seed data. Safe to re-run.
-- Clusters come from Pratik's launch deck. Boundaries (polygons) are drawn later in the admin panel.
-- All clusters start locked; activate one (Powai first) from admin when the launch gate is met.

insert into clusters (slug, name, rollout_stage, status) values
  ('powai-hiranandani',    'Powai / Hiranandani',    1, 'locked'),
  ('bandra-khar',          'Bandra-Khar',            2, 'locked'),
  ('andheri-west-versova', 'Andheri West / Versova', 3, 'locked'),
  ('lower-parel-worli',    'Lower Parel / Worli',    4, 'locked'),
  ('chembur',              'Chembur',                5, 'locked'),
  ('juhu-vile-parle',      'Juhu / Vile Parle',      5, 'locked'),
  ('santacruz-west',       'Santacruz West',         5, 'locked')
on conflict (slug) do nothing;

-- Services from the current app designs (Oct 2026): Yoga, Strength, Pilates, Zumba. HIIT was dropped.
insert into services (vertical, slug, name, tagline, duration_min_minutes, duration_max_minutes, intensity, sort_order) values
  ('fitness', 'yoga',     'Yoga',     'Move. Breathe. Feel good.',           45, 60, 'low_moderate',  1),
  ('fitness', 'strength', 'HIIT/Strength', 'Build strength that fits your life.', 45, 60, 'moderate_high', 2),
  ('fitness', 'pilates',  'Pilates',  'Move with control. Find your center.', 45, 60, 'low_moderate',  3),
  ('fitness', 'zumba',    'Zumba',    'Dance. Sweat. Repeat.',               40, 55, 'moderate_high', 4)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  duration_min_minutes = excluded.duration_min_minutes,
  duration_max_minutes = excluded.duration_max_minutes,
  intensity = excluded.intensity,
  sort_order = excluded.sort_order;

update services set is_active = false where slug = 'hiit';
update service_formats set is_active = false
 where service_id in (select id from services where is_active = false);

-- Styles (formats) with the copy used in the app. Re-running updates names and descriptions.
insert into service_formats (service_id, slug, name, description, sort_order)
select s.id, f.slug, f.name, f.description, f.sort_order
from services s
join (values
  ('yoga',     'power-yoga',          'Power Yoga',          'Build strength, balance and flexibility through flowing poses at a pace that works for you.', 1),
  ('yoga',     'vinyasa-yoga',        'Vinyasa Yoga',        'Link breath with movement in an energizing sequence that supports flexibility and focus.',     2),
  ('yoga',     'hatha-yoga',          'Hatha Yoga',          'Steady poses and mindful breathing help you release tension and improve posture.',            3),
  ('strength', 'strength-training',   'Strength Training',   'Progressive resistance work tailored to your goals, experience and available equipment.',     1),
  ('strength', 'functional-strength', 'Functional Strength', 'Train everyday movement patterns with guided resistance, control and confidence.',            2),
  ('strength', 'mobility-strength',   'Mobility + Strength', 'Combine joint mobility with controlled strength work for a balanced routine.',                 3),
  ('pilates',  'mat-pilates',         'Mat Pilates',         'Build core control and full-body strength through precise, low-impact mat work.',              1),
  ('pilates',  'core-pilates',        'Core Pilates',        'Strengthen deep core muscles with focused, controlled movement and breath.',                   2),
  ('pilates',  'mobility-pilates',    'Mobility Pilates',    'Improve balance and range of motion with mindful Pilates sequences.',                          3),
  ('zumba',    'zumba',               'Zumba',               'Follow upbeat dance combinations that keep you moving and lift your mood.',                    1),
  ('zumba',    'bollywood-mix',       'Bollywood Mix',       'Bollywood-inspired choreography makes cardio feel joyful while you build stamina.',            2),
  ('zumba',    'dance-cardio',        'Dance Cardio',        'Easy-to-follow dance sequences build stamina while you move to upbeat music.',                 3)
) as f(service_slug, slug, name, description, sort_order) on f.service_slug = s.slug
on conflict (service_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Pincodes per cluster. PLACEHOLDERS from public Mumbai pincode lists: Pratik/ops must confirm before launch.
insert into cluster_pincodes (cluster_id, pincode)
select c.id, p.pincode
  from (values
    ('powai-hiranandani',    '400076'),
    ('bandra-khar',          '400050'), ('bandra-khar', '400051'), ('bandra-khar', '400052'),
    ('andheri-west-versova', '400053'), ('andheri-west-versova', '400061'),
    ('lower-parel-worli',    '400013'), ('lower-parel-worli', '400018'),
    ('chembur',              '400071'), ('chembur', '400074'),
    ('juhu-vile-parle',      '400049'), ('juhu-vile-parle', '400056'),
    ('santacruz-west',       '400054')
  ) as p(slug, pincode)
  join clusters c on c.slug = p.slug
on conflict do nothing;

-- Default prices (paise). PLACEHOLDERS taken from Pratik's prototype, not confirmed. Admin edits them (D13).
insert into service_prices (service_id, mode, price_paise, original_price_paise)
select null, v.mode::booking_mode, v.price, v.original
  from (values
    ('instant',   189900, null::integer),
    ('scheduled', 150000, null),
    ('demo',       50000, 150000)
  ) as v(mode, price, original)
 where not exists (
   select 1 from service_prices sp where sp.service_id is null and sp.mode = v.mode::booking_mode and sp.is_active
 );
