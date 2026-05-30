# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

Spark is an embedded Shopify app with 3 deployable services:
- **Main App** (root `/workspace`): React Router + Vite + Shopify CLI, port 3000
- **Admin Panel** (`/workspace/admin`): Express backend (port 3099) + Vite React frontend (port 5174)
- **Translation Worker** (`/workspace/worker`): Background job processor

### Quick Commands

| Task | Command | Notes |
|------|---------|-------|
| Lint | `npm run lint` | Pre-existing lint errors in codebase (worker, some tests) |
| Typecheck | `npm run typecheck` | Pre-existing TS errors in some files |
| Test | `npm run test` | Vitest; 7 test files require `TURSO_TEST_DATABASE_URL` |
| Build (main) | `npm run build` | React Router build (Vite) |
| Build (admin) | `cd admin && npm run build` | Vite client + tsc server |
| Dev (main) | `npm run dev` | Requires Shopify CLI auth (`shopify app dev`) |
| Dev (admin) | `cd admin && npm run dev` | No external deps needed to start |

### Database Setup (Prisma)

- Prisma client generates to `app/generated/prisma/` (custom output path).
- `npm run setup` = `prisma generate && prisma migrate deploy`. The migrate step needs `DATABASE_URL`.
- For local dev without Turso: `DATABASE_URL=file:./prisma/dev.sqlite npx prisma db push` syncs schema.
- **Migration ordering issue**: The `20260529082508_add_ai_task_remove_shop_visual_job` migration runs before `20260529142233_init` alphabetically but depends on tables from init. Use `prisma db push` for fresh local setups instead of `prisma migrate deploy`.

### External Service Dependencies

The main app **requires** these env vars at runtime (will crash without them):
- `TURSO_TEST_DATABASE_URL` + `TURSO_TEST_AUTH_TOKEN` (or PROD variants)
- `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET`

Optional services (app works partially without): Cosmos DB, Azure Blob, Redis, DeepSeek/OpenAI API.

### Running Services Locally

1. **Admin panel** starts without any external credentials:
   ```
   cd admin && npm run dev
   ```
   Backend: http://localhost:3099/health → `{"ok":true}`
   Frontend: http://localhost:5174/

2. **Main app** needs Shopify CLI auth + Turso credentials:
   ```
   npm run dev   # wraps shopify app dev
   ```
   Without Shopify CLI auth, use Vite directly for frontend-only dev:
   ```
   SHOPIFY_API_KEY=test SHOPIFY_API_SECRET=test npx vite --port 3000
   ```
   (Server-side routes will fail without Turso, but Vite HMR works)

3. **Worker**: `cd worker && npm run dev` (needs Cosmos/Redis/Blob env vars)

### Testing Notes

- Tests in `tests/` use Vitest with `~/` alias pointing to `app/`.
- Tests that import `app/db.server.ts` transitively require `TURSO_TEST_DATABASE_URL` (a real Turso URL). These tests will fail in environments without the secret configured.
- Pure unit tests (postprocess, formatting, utility) pass without any env vars.
- After code changes: `npm run lint && npm run typecheck && npm run test && npm run build`
- Admin has no test framework; verify with `cd admin && npm run build`.
