#!/usr/bin/env bash
# Prepares an empty Postgres (with PostGIS available) for the API integration tests.
# Usage: DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/prepare-test-db.sh
# Mimics the pieces Supabase provides (roles, the `extensions` schema), then applies the
# project migrations and the seed in order.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
SQL

for file in "$root"/supabase/migrations/*.sql; do
  echo "applying $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$root/supabase/seed.sql"
echo "test database ready"
