# @zoove/api

NestJS modular monolith (decision D4). This first slice has sign-in, the profile and the service catalog.
Bookings, matching and payments come later as their own modules.

## What is in it

| Module | What it does |
|---|---|
| `config` | Reads and checks environment variables at start-up. The app refuses to start if something is wrong. |
| `database` | One Postgres connection pool. `tx()` runs a block in a transaction. |
| `identity` | Phone + OTP sign-in, access and refresh tokens, `/me`. |
| `catalog` | Services, their styles and prices, read from the database. |
| `addresses` | Saved addresses and "do we serve this pincode". |
| `bookings` | Slots, booking, cancel, reschedule. Safe to retry. |
| `health` | `/health` (alive) and `/health/ready` (can reach the database). |

## Endpoints

All under `/v1` except health. Errors always look like `{ "error": { "code", "message", "details" } }`.

| Method and path | Auth | Notes |
|---|---|---|
| `POST /v1/auth/otp/request` `{ phone }` | no | Phone must be `+91` and a valid mobile. Returns `{ resendAfterSeconds }`. |
| `POST /v1/auth/otp/verify` `{ phone, code }` | no | Returns `{ token, refreshToken, expiresInSeconds, isNewUser }`. |
| `POST /v1/auth/refresh` `{ refreshToken }` | no | Rotates the refresh token. Reusing an old one ends all sessions. |
| `POST /v1/auth/logout` `{ refreshToken }` | no | Ends one device. Always 204. |
| `GET /v1/me`, `PATCH /v1/me` | bearer | First name, last name, email. |
| `GET /v1/services` | no | Active services with styles and prices (paise). |
| `GET /v1/addresses`, `POST /v1/addresses` | bearer | Saving is always allowed, even outside the service area. |
| `POST /v1/addresses/serviceability` `{ pincode }` | bearer | `{ serviceable }`. |
| `PUT /v1/addresses/:id/default`, `DELETE /v1/addresses/:id` | bearer | Return the updated list. Delete is refused while a session is booked there. |
| `GET /v1/slots?service=yoga&date=2026-10-25` | bearer | Eight start times in India time, each `available` or not. |
| `POST /v1/bookings` | bearer | Needs `idempotencyKey`. Same key = same booking. Returns the booking. |
| `GET /v1/bookings`, `GET /v1/bookings/:id` | bearer | Mine only. |
| `POST /v1/bookings/:id/reschedule` `{ startsAt }`, `POST /v1/bookings/:id/cancel` | bearer | Allowed until 2 hours before. Cancelling twice is fine. |
| `GET /health`, `GET /health/ready` | no | For the load balancer. |

Swagger UI is at `/docs` when `SWAGGER_ENABLED=true` (keep it off in production).

## Run it

```bash
cp .env.example .env          # then fill in DATABASE_URL and two random secrets of 32+ characters
pnpm --filter @zoove/api start:dev
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

In development set `DEV_FIXED_OTP=123456` to sign in without an SMS provider. Without it the
code is printed in the API log (the console SMS provider). The app refuses `DEV_FIXED_OTP` in production.

## Test it

```bash
pnpm --filter @zoove/api typecheck
pnpm --filter @zoove/api test          # unit tests; database tests are skipped
```

Database tests need a Postgres with the project migrations applied:

```bash
# any empty database with PostGIS available
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zoove_test
DATABASE_URL=$TEST_DATABASE_URL ./scripts/prepare-test-db.sh
pnpm --filter @zoove/api test
```

The tests empty the identity tables, so only point them at a throwaway database.

## Booking rules that are assumptions

All in `src/bookings/rules.ts`, each tied to an open question: slot times (Q20), 2-hour change window (Q7),
60-day horizon (not yet asked), Personal only (Q5, 8, 9), several instant bookings allowed (Q19).
Prices and pincodes in `supabase/seed.sql` are placeholders. New bookings stay in `matching` until the
trainer and matching modules exist.

To try bookings locally, open a cluster first (the seed leaves them locked):

```sql
update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar';
```

## Production checklist (the API refuses some of these itself)

- `NODE_ENV=production` with `SMS_PROVIDER=console` or `DEV_FIXED_OTP` set will not start.
- Behind a load balancer set `TRUST_PROXY=true`, or every customer shares one rate limit.
- `JWT_SECRET` and `OTP_SECRET`: different random values, 32+ characters.
- Keep `SWAGGER_ENABLED` off.

## Rules to keep

- Every database change is a new numbered file in `supabase/migrations`. Never edit an applied one.
- Money is integer paise. Times are UTC. Phones are E.164.
- Secrets live in `.env` (ignored by git) and later in AWS Secrets Manager. Never commit them.
- A new module gets its own folder and talks to others through their services, not their tables.
