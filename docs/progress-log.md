# Zoove: progress log

Newest entry first. Add a new dated section at the top whenever something meaningful changes.

---

## 22 October 2026: where we are

### One-paragraph summary
The customer app (React Native + Expo) is feature-complete on a mock API. A real backend (NestJS + Postgres) now
exists with sign-in, profile, service catalog with prices, addresses with serviceability, time slots and
idempotent bookings, plus Postman and Bruno collections that replay every request. 65 automated tests and 31
live API requests pass. Nothing is deployed, the app does not talk to the real API yet, and the last three
commits are on Ritesh's PC but not pushed to GitHub.

### Status at a glance

| Area | State |
|---|---|
| Customer app screens and flows | Done on mock API |
| Backend: sign-in, profile | Done, tested |
| Backend: catalog and prices | Done, tested |
| Backend: addresses and serviceability | Done, tested |
| Backend: slots and bookings (create, list, view, cancel, reschedule) | Done, tested |
| Postman and Bruno collections, API reference, smoke test | Done, verified with Bruno CLI and newman |
| CI (build, lint, typecheck, test, database job, request replay) | Written, **never run on GitHub yet** |
| App connected to the real API | Not started |
| Coaches, matching, trainer app | Not started (waiting on business answers) |
| Packages and credits, payments, refunds | Not started |
| Notifications, real SMS | Not started |
| Admin panel, website | Not started |
| Deployment (Docker, AWS, staging) | Not started |

### Git state
- Pushed to GitHub (`zoove-co/zoove-platform`): up to `cb8721f`.
- On Ritesh's PC, **not pushed**: `98a28d4` (Streak page, booking fixes), `81d5d34` (Academy/Help/Policies/Referral and the whole API), `87e870a` (API collections, CI replay).
- The cloud session cannot push (no GitHub credentials). Ritesh must run `git push`.
- Run `pnpm install` first and commit the changed `pnpm-lock.yaml`, or CI fails (it uses a frozen lockfile).

---

## What was built

### Customer app (`apps/customer-app`)
- React Native + Expo SDK 57, Expo Router, TanStack Query, Zustand, React Hook Form + Zod, i18n.
- Screens: sign-in (phone + OTP), Home, service detail with style picker, booking flow (address, schedule, review), booking success, Orders, session details with reschedule and cancel, Account, addresses, notifications, packages, Streak, Zoove Party planner (4 steps), Academy, Help, Policies, Referral.
- Pratik's artwork wired in (services, formats, participants, banners, academy, logo).
- Duo, Loved one and Group are shown as "Soon" (open questions 5, 8, 9). Only Personal can be booked.
- Booking safety in the app: idempotency key tied to the request, slot checks, error states, rematching state when a trainer cancels (D15).
- Streak page: week-streak hero, week calendar, stats, focus areas, recent sessions.
- Everything goes through one typed API interface (`src/lib/api/types.ts`). Today it is the mock (`mock.ts`); later a generated HTTP client replaces it (D11).
- Analytics events are defined in `@zoove/shared` (`events.ts`) and listed in `docs/tracking-plan.md`.

### Backend (`services/api`, NestJS modular monolith)
| Module | What it does |
|---|---|
| config | Checks environment variables at start. Refuses short secrets and a fixed OTP in production. |
| database | One Postgres pool; `tx()` for transactions. |
| identity | Phone OTP sign-in, access (15 min) and refresh (30 day) tokens, refresh rotation with theft detection, `/me`. |
| catalog | Services, styles and prices (paise) from the database; per-service price overrides. |
| addresses | Save, list, default, delete; serviceable = pincode belongs to an active cluster. |
| bookings | Slots in India time; create (idempotent), list, view, reschedule, cancel; history and outbox events. |
| health | `/health`, `/health/ready`. |

Safety built in:
- OTP stored only as a hash; 5 wrong tries lock it; one code per 30 seconds, 5 per hour; a code can be used once, even under simultaneous requests.
- Refresh token reuse signs the customer out everywhere.
- Same booking key returns the same booking; same key with a different request is refused; ten simultaneous identical requests make one booking.
- The database itself refuses two live bookings at the same start time for one customer.
- Cancelling twice is harmless. Changes close 2 hours before a confirmed session.
- Every failure looks like `{ "error": { "code", "message", "details" } }`.
- Rate limits: 120 requests a minute overall, tighter on OTP routes.

### Database (`supabase/migrations`)
- 0001 foundation: users, roles, OTP, refresh tokens, profiles, consents, clusters, addresses, services, formats, outbox, event log, audit log.
- 0002 hardening of the updated-at function.
- 0003 first/last name on users, descriptions on formats.
- 0004 address coordinates, `cluster_pincodes`, `service_prices`, `bookings`, `booking_events`, booking enums, no-double-booking index.
- `seed.sql`: clusters from Pratik's deck (all locked), Yoga/Strength/Pilates/Zumba with styles, **placeholder** pincodes and **placeholder** prices.

### Tooling
- `services/api/api-client`: `steps.mjs` (single list of 31 requests) generates the Postman collection, the Bruno collection and `API-REFERENCE.md`. `smoke.mjs` replays them. Verified: Bruno CLI 31/31 (34 tests), newman 31/31 (65 assertions), run twice.
- CI (`.github/workflows/ci.yml`): build, lint, typecheck, test; a second job with PostGIS runs database tests and replays every request.

### Tests
- 65 automated tests pass against a real Postgres: 5 config, 24 sign-in/profile/catalog, 36 addresses/slots/bookings.
- They were run on Postgres 16 **without PostGIS** (geography columns swapped for text). PostGIS itself is first exercised when CI runs.

### Decisions and open questions
- Decisions D1 to D18 in `docs/decisions.md`. New this period: D17 (API foundation: sign-in, errors, limits) and D18 (booking API: safe retries, rules in one place, India time, prices as data).
- Open questions 1 to 48 in `docs/open-questions.md`. New this period: 44 swap format, 45 demo online or at-home, 46 week streak rule, 47 sign-in policy, 48 booking rules we assumed.
- Prototype comparison in `docs/flutter-prototype-comparison.md`.

---

## Assumptions in the code that need a business answer
All booking rules live in `services/api/src/bookings/rules.ts`.
- Start times 6, 7, 8, 9 AM and 4, 5, 6, 7 PM (Q20).
- Change or cancel until 2 hours before (Q7).
- Booking up to 60 days ahead (not yet asked).
- Several instant bookings at once are allowed (Q19). Demo sessions are not limited per customer.
- Prices Rs 1,899 instant, Rs 1,500 scheduled, Rs 500 demo: from Pratik's prototype, not confirmed.
- Cluster pincodes in the seed are placeholders; ops must confirm.
- Sign-in: 6-digit OTP, 5 minutes, 5 tries, 30-day sessions (Q47).
- New bookings stay in `matching` because coaches do not exist yet.

---

## Pending

### Ritesh, on his PC (in this order)
1. `pnpm install`, then `pnpm --filter @zoove/shared build`.
2. `pnpm --filter @zoove/api typecheck`, `test`, `build`; in `apps\customer-app` run `pnpm typecheck` and `npx expo start --web --clear`.
3. `supabase db push` (applies migrations 0003 and 0004 and the seed).
4. Commit the new `pnpm-lock.yaml`, `git push`, confirm both GitHub Actions jobs are green. The PostGIS job has never run: expect a possible first-run fix.
5. Try the API by hand in Bruno (`services/api/api-client/README.md`).
6. Test the app on a real Android and iPhone.

### Next build (engineering)
1. Generated HTTP client so the app uses the real API instead of the mock (the mock and the API already share error codes).
2. Staging environment: Dockerfile (D9), hosting in Mumbai, secrets, database SSL verification, health checks.
3. Observability: error tracking, logs, metrics, alerts.
4. Real SMS provider and DLT registration (Q26).
5. Trainer module, matching and dispatch, trainer-cancel flow (D15).
6. Packages and credits (balance, expiry, deduction).
7. Payments, refunds, payouts.
8. Notifications from the outbox worker (outbox events are written but nothing reads them yet).
9. Admin panel (prices, clusters, bookings, support) and role permissions.
10. Public website.

### Blocked on Pratik (see `docs/open-questions.md`)
Cancellation and refund rules, duplicate and instant booking rules, operating hours, demo format, swap format, week-streak rule, Party pricing and rules (35 to 43), Duo / Loved one / Group, matching fallback and compensation (29 to 34), SMS provider, final prices, cluster pincodes and launch order.

### Known gaps and edge cases not handled yet
- App slots use the device time zone until the real API is connected (the API already uses India time).
- Package purchase and deduction are not built.
- Party plan has no idempotency key; leaving the planner discards answers.
- Rematch fallback when nobody accepts is undecided.
- Polygon-based serviceability is not used; serviceability is by pincode.
- Cluster activation is a manual database change until the admin panel exists.
- Production readiness not started: load testing, security review, backups and restore test, privacy policy and consent text, data-retention rules.
- Account items still missing from Pratik's prototype: Manage Bookings, Performance, Switch Profile; "Book Zoove for" row and benefit strip on packages; splash tagline.
- Housekeeping: invite Pratik to GitHub, Vercel and Drive; Lottie assets from the designer.

---

## Gap audit (22 October 2026, night)

### The app talks to 18 operations; the API covers 13 of them
Missing endpoints (the app's mock has them, the API does not):
- Home summary (name, default address, unread badge, prices, upcoming session, weekly progress)
- Notifications: list and mark read
- Past coaches ("rebook a coach")
- Packages list
- Streak
- Referral code
- Save party plan

### Missing tables (no SQL yet)
`notifications`, `session_packages` (definitions), `customer_packages` / credits ledger, `party_plans`, `referral_codes` and `referrals`, trainers/coaches and availability, trainer service areas, `payments`, `refunds`, `payouts`, `reviews`, support tickets, `device_tokens` (push). Streak needs no table: it is derived from bookings.

### Tables that exist but nothing uses
- `customer_profiles` (goals, focus areas): no endpoint.
- `consents`: sign-in does not record that the customer accepted Terms and Privacy. Needed before launch.
- `event_log`: the app tracks events, but there is no endpoint that stores them.
- `audit_log`: nothing writes to it yet.
- `outbox_events`: bookings write events, but no worker reads them, so nothing is ever delivered.
- `users.full_name`: deprecated by 0003, still present.

### Behaviour gaps in what is built
1. **Nothing marks a booking `completed`.** Streak, past coaches and "rebook" cannot work until the trainer flow (or an admin action) exists.
2. **A blocked customer keeps working for up to 15 minutes**, until the access token expires: the guard checks the token, not the account status.
3. **No account deletion.** Apple and Google Play both require in-app account deletion before approval.
4. `PATCH /v1/me` always demands a first name, so email alone cannot be updated.
5. Expired OTPs and refresh tokens are never cleaned up; the tables only grow.
6. No limit on saved addresses.
7. No request ids or error tracking, so a failure in production cannot be traced.
8. Database TLS does not verify the certificate (known TODO).
9. Swagger has no request or response schemas for addresses and bookings. The generated client (D11) needs them, so schemas must be added first.
10. No Dockerfile or deployment.

### Database actions that must still be run by hand
1. `supabase db push` applies migrations 0003 and 0004 only. It does **not** run `seed.sql`.
2. Run `supabase/seed.sql` once against the Supabase database (SQL editor or psql). Without it the remote database has no services, prices or pincodes. It is safe to re-run.
3. Clusters are all locked. Nothing is serviceable until you run: `update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar';`
4. Check: `select count(*) from services;` (4), `select count(*) from cluster_pincodes;` (13), `select count(*) from service_prices;` (3).

### Order I recommend
1. Add Swagger schemas, then the generated client (unblocks the app).
2. Missing read endpoints: home, notifications, packages, streak, referral, party plan (small, no business risk).
3. Account deletion, consent recording, status check in the auth guard, token cleanup job.
4. Staging deployment and error tracking.
5. Trainers, matching, completion, packages and payments once Pratik answers.

---

## Earlier milestones (short)
- Monorepo, Supabase project, CI skeleton, decisions D1 to D16, open questions 1 to 43.
- Customer app first build: login, Home, booking flow, orders, account, addresses, notifications, packages.
- Flutter prototype analysed and compared against our app (`docs/flutter-prototype-comparison.md`).
- React Native + Expo confirmed as the right choice; updates to JavaScript and images can ship over the air without store review, native changes cannot.
