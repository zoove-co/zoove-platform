# Calling the API by hand (Postman or Bruno)

Every request lives in `steps.mjs`. The Postman collection, the Bruno collection and `API-REFERENCE.md` are
generated from it, and `smoke.mjs` replays the same list against a running API. All three were run against
the real API and pass (31 requests, 65 checks).

## Use Bruno (free, files live in git)

1. Install Bruno. Open Collection and choose `services/api/api-client/bruno`.
2. Pick the **local** environment (top right).
3. Run **Sign in > Verify OTP** first. It saves the access and refresh tokens; every other request uses them.
4. Run the folders top to bottom, or the whole collection with the Run button.

Command line: `cd services/api/api-client/bruno && npx @usebruno/cli run --env local -r`

## Use Postman

Import `postman/zoove-api.postman_collection.json` and `postman/zoove-local.postman_environment.json`,
choose the **Zoove local** environment, run **Sign in > Verify OTP**, then the rest.
You can also import the live spec from `http://localhost:3000/docs-json` (needs `SWAGGER_ENABLED=true`),
but that spec has no example bodies, so prefer the collection.

## Before you start

1. API running locally with `DEV_FIXED_OTP=123456` (see `services/api/README.md`).
2. A cluster open, or bookings answer NOT_SERVICEABLE:
   `update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar';`
3. Wait 30 seconds between two runs: one OTP per phone per 30 seconds.

## Change or add a request

Edit `steps.mjs`, then from `services/api`:

```
pnpm api:collections     # regenerate Postman, Bruno and API-REFERENCE.md
pnpm api:smoke           # replay everything against the running API
```

Commit the regenerated files. CI replays the list on every push, so a request that stops working fails the build.

## Rules

- Never put real phone numbers, tokens or secrets in `steps.mjs` or the environment files.
- `otp` = 123456 only works in development. Production sends a real SMS.
- Every new endpoint gets a line in `steps.mjs` in the same change that adds it.
