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

-- Services and formats from the current app designs (Oct 2026).
with s as (
  insert into services (vertical, slug, name, tagline, duration_min_minutes, duration_max_minutes, intensity, sort_order) values
    ('fitness', 'yoga',     'Yoga',     'Move. Breathe. Feel good.',          45, 60, 'low_moderate',  1),
    ('fitness', 'hiit',     'HIIT',     'Train hard. Feel strong.',           30, 45, 'high',          2),
    ('fitness', 'strength', 'Strength', 'Build strength that fits your life.', 45, 60, 'moderate_high', 3),
    ('fitness', 'zumba',    'Zumba',    'Dance. Sweat. Repeat.',              40, 55, 'moderate_high', 4)
  on conflict (slug) do nothing
  returning id, slug
)
insert into service_formats (service_id, slug, name, sort_order)
select s.id, f.slug, f.name, f.sort_order
from s
join (values
  ('yoga',     'power-yoga',          'Power Yoga',          1),
  ('yoga',     'vinyasa-yoga',        'Vinyasa Yoga',        2),
  ('yoga',     'hatha-yoga',          'Hatha Yoga',          3),
  ('hiit',     'hiit',                'HIIT',                1),
  ('hiit',     'circuit-training',    'Circuit Training',    2),
  ('hiit',     'bodyweight-training', 'Bodyweight Training', 3),
  ('strength', 'strength-training',   'Strength Training',   1),
  ('strength', 'functional-strength', 'Functional Strength', 2),
  ('strength', 'mobility-strength',   'Mobility + Strength', 3),
  ('zumba',    'zumba',               'Zumba',               1),
  ('zumba',    'bollywood-mix',       'Bollywood Mix',       2),
  ('zumba',    'dance-cardio',        'Dance Cardio',        3)
) as f(service_slug, slug, name, sort_order) on f.service_slug = s.slug;
