# Neon Postgres setup

The repository is configured for Neon organization `org-damp-field-95158736`, project `young-field-46674716`, branch `production`. Only the Postgres service is selected. The app continues to run as Vue/Vite plus an Express Node.js API; Neon deployment provisions/configures database services, not the frontend or Express hosting.

## Initialization

From the repository root:

```sh
npm i -g neon@latest
neon init -y --org-id org-damp-field-95158736 --project-id young-field-46674716 --branch production --services postgres
neon deploy
```

If global installation fails, use `npx neon@latest` instead of `neon`. Complete browser authentication when prompted; if it expires, run `neon login` and retry.

`neon.ts` declares the service policy. `.neon` selects the project/branch and is gitignored. Deployment pulls `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` into root `.env.local` (or `.env` if it already exists). These files contain credentials and must not be committed or copied into `web/public`.

## Database wiring

The existing Prisma 7 + `@prisma/adapter-pg` + `pg` stack is retained for the long-running Node.js API. Cloudflare Pages only serves the UI and API proxy; it does not open database connections. See [Neon's connection-method guidance](https://neon.com/docs/connect/choose-connection).

- `DATABASE_URL`: pooled application connections, used by `api/src/db.js` through API configuration.
- `DATABASE_URL_UNPOOLED`: direct connection for Prisma migrations in `api/prisma.config.js`.
- `api/src/env.js`: loads root `.env.local`, root `.env`, API `.env.local`, then API `.env`. Earlier files win; explicit shell/hosting variables take precedence.
- If a process explicitly supplies `DATABASE_URL` but not its direct counterpart, the loader does not import a migration URL from local files. This prevents a test database override from accidentally migrating production.
- Local integration tests explicitly set both database URLs to their disposable database.

For Neon on Render, configure **both** URLs in the Render environment. For local PostgreSQL, only `DATABASE_URL` is required. No database credentials are exposed through `VITE_*`.

## Install, build, migrate and run

Node.js 24+ is required. On a fresh checkout:

```sh
npm ci
npm ci --prefix api --include=dev
npm ci --prefix web
neon env pull
npm run build
```

Build generates Prisma Client, validates API source/OpenAPI, and builds Vue. Build does not run migrations.

Validate new migrations on a temporary branch before applying them to production. Once validated, run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts both apps, normally at `http://localhost:5173` and API port `3000`. `npm start` starts only the API for Node hosting. Both commands load the root Neon environment automatically.

If the default ports are already occupied:

```sh
WEB_PORT=5175 PORT=3105 FRONTEND_URL=http://localhost:5175 API_PROXY_TARGET=http://localhost:3105 npm run dev
```

These local commands use development mode and the existing local image-storage adapter. For production HTTPS, R2 credentials, stable JWT secret and hosting settings, follow [the Cloudflare deployment guide](deploy-cloudflare.md). The remote Neon branch name `production` does not itself set `NODE_ENV=production` on a local server.

## Verification

With the app running in one terminal, use another:

```sh
npm run test:unit
npm test --prefix api
SMOKE_BASE_URL=http://localhost:5175 npm run test:neon
```

Use port `5173` instead when running on the default port. `test:neon` connects to the database configured for the API and requires a Neon hostname. It creates a uniquely named disposable account through the real browser UI, checks its records directly in Neon, and deletes only that account and its related records in a `finally` block. It tests registration, sessions, diary CRUD, moods, tags, calendar aggregation, reload/refresh and logout. It does not test R2 or enable Neon Auth/Object Storage.

`test:neon` requires Playwright Chromium (`cd web` then `npx playwright install chromium` if missing). No traces or screenshots containing session credentials are saved by this smoke test. API regression tests use temporary local PostgreSQL, not the connected Neon database.

Verified on 2026-10-26:

```text
neon deploy
  Utilized services: Postgres
  Pulled 3 Neon variables into .env.local

npm run build
  Generated Prisma Client (v7.10.1)
  Checked 34 JavaScript files and 23 OpenAPI operations.
  58 modules transformed.
  built in 296ms

npm run db:migrate && npm run db:seed
  All migrations have been successfully applied.
  Seeded 5 system moods.

npm test --prefix api
  tests 21
  pass 21
  fail 0

SMOKE_BASE_URL=http://localhost:5175 npm run test:neon
  PASS Neon Postgres: connected; 5 system moods available
  PASS browser registration -> Express -> Neon user/session persistence
  PASS diary/mood/tag writes verified directly in Neon; reload and refresh-cookie read succeeded
  PASS calendar aggregation, diary update and soft-delete persisted in Neon
  PASS logout revoked the Neon session; protected page requires login; no browser errors
  CLEANUP removed 1 smoke-test account (and its related records)
```

The initial migration was first validated on a temporary child of production. That temporary branch was removed after verification; the local `.neon` context remains on production.

Environment issues encountered: sandbox restrictions initially blocked npm network access, Prisma's external cache, and local PostgreSQL tests; approved retries succeeded. Port 5173 was occupied, so the verified app used ports 5175/3105. `pg` emitted advisory warnings about future SSL-mode and query-concurrency behavior; they did not fail these checks. The CLI also warned about npm-gated install scripts; Prisma generation and the build completed successfully.
