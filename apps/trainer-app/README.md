# Zoove Trainer app (Expo)

The trainer's phone app. It uses the same API and database as the "Join Zoove" page (`apps/trainer-web`) and the admin panel, so a trainer sees the same application status in both.

- Sign in: email code (`audience: trainer`), same as the web page.
- Not approved: application wizard (About you, Where you live, Experience, ID details, Documents, Review) saved step by step; then a pending / changes / rejected status screen. The server decides the screen (`src/lib/useApplication.ts` `destinationFor`).
- Approved and active: tabs Open jobs, My sessions, Profile; push registration.
- Run: `cp .env.example .env`, set `EXPO_PUBLIC_API_URL`, `npx expo install --fix`, `npx expo start`.
- Push needs `eas init` (project id) and Expo/Firebase credentials. The API does not yet send push to trainers (email only).
