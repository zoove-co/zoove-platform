# Zoove platform

Monorepo for the Zoove home-fitness booking platform.

```
apps/customer-app     React Native + Expo (Android + iOS)         co.zoove.customer
apps/trainer-app      React Native + Expo (Android + iOS)         co.zoove.trainer
apps/admin            Next.js admin panel
services/api          NestJS modular monolith (REST + OpenAPI)
packages/shared       Types, constants, pure helpers
supabase/             Migrations and seed data
docs/                 Decisions, open questions, tracking plan
```

Read `docs/decisions.md` first. Product questions still waiting on Pratik are in `docs/open-questions.md`.

## One-time machine setup (Windows)

1. Node 22 LTS (use nvm-windows), then `corepack enable` so pnpm is available. Verify: `node -v`, `pnpm -v`.
2. Git (already installed), VS Code with the extensions listed in `.vscode/extensions.json`.
3. Android Studio (SDK, platform tools, one emulator). iOS builds are done in the cloud with EAS, so no Mac is needed.
4. Supabase CLI: `npx supabase --version` works without installing; install globally later if wanted.
5. Accounts, all created with admin@zoove.co: Expo (EAS), Supabase organization, Firebase project.

## Everyday commands

```
pnpm install            install all workspace dependencies
pnpm run typecheck      type-check every package
pnpm run lint           lint every package
pnpm run test           run every package's tests
pnpm run build          build every package
```

## Database

Migrations are plain SQL files in `supabase/migrations`, applied with the Supabase CLI
(`supabase link`, then `supabase db push`). Never edit the schema in the dashboard.
Secrets live in `.env` files that are git-ignored; commit only `.env.example`.
