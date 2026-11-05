# Zoove Trainer app (Expo)

The trainer's phone app. It uses the same API and database as the "Join Zoove" page (`apps/trainer-web`) and the admin panel, so a trainer sees the same application status in both.

- Sign in: email code (`audience: trainer`), same as the web page.
- Not approved: application wizard (About you, Where you live, Experience, ID details, Documents, Review) saved step by step; then a pending / changes / rejected status screen. The server decides the screen (`src/lib/useApplication.ts` `destinationFor`).
- Approved and active: tabs Open jobs, My sessions, Profile; push registration.
- Run: `cp .env.example .env`, set `EXPO_PUBLIC_API_URL`, `npx expo install --fix`, `npx expo start`.
- Push needs `eas init` (project id) and Expo/Firebase credentials. The API does not yet send push to trainers (email only).

## Crash reports

Crashes and server errors (5xx) are reported to Sentry, with emails, phone numbers and tokens removed before anything leaves the phone. It is off until a key is set: put `EXPO_PUBLIC_SENTRY_DSN` in the `env` of the build profile in `eas.json` (or in a local `.env`). The code lives in `src/lib/monitoring.ts`, the only file that touches the vendor.

## Delete account

Profile → "Delete my account" calls `DELETE /v1/trainer-application/account` (Play Store and App Store require this). It removes personal details, ID documents and private notes, ends sign-in everywhere, and is refused while the trainer still holds a session that has not finished.
