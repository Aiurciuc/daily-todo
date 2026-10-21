# Local Daily Tasks

A self-hosted day-by-day task list: Angular web UI, NestJS API, PostgreSQL, and Prisma. Each account has its own calendar, protected by cookie-based authentication and server-enforced task ownership. Use HTTPS when deploying beyond localhost.

## Angular 22 application

The root shell renders the API-backed calendar in `apps/web/src/app/features/calendar-preview/`, composed from reusable `terra-ui` components. It uses standalone OnPush components, zoneless change detection, signals, and `httpResource` for cancellable date-range reads. Day/week/month navigation uses actual local dates. Create, edit, completion/reopen and delete actions persist through `HttpClient`; the calendar reloads after successful writes. Writes are guarded against duplicate submissions, errors retain form drafts, and loading/error/retry/empty states are explicit. Date-only tasks remain visible as unscheduled items. Notes and shared/private/team labels are persisted; labels are not access controls. Task links encode the selected task and date. The previous daily-list implementation remains under `apps/web/src/app/features/tasks/` but is not the active page.

Components keep separate HTML and SCSS files. Angular CLI defaults enforce external templates, SCSS, and OnPush for new components; existing component/service naming remains consistent. Prettier handles formatting and ESLint handles code quality.

Web checks: `npm run build --prefix apps/web`, `npm test --workspace @local-todo/web`, and `npm run lint`.

## NestJS API structure

The API uses feature modules with explicit dependencies. Task controllers accept validated request DTOs; `TasksService` maps results to public response DTOs, and `TasksRepository` owns Prisma queries and serializable transactions. Global validation rejects unknown fields and wrong types; serialization hides internal task positions. A database exception filter maps Prisma failures to sanitized HTTP responses.

`ConfigModule` supplies typed, validated API/database settings. `DatabaseService` owns the PostgreSQL pool and disposes it after HTTP shutdown. Health controllers delegate readiness checks to `HealthService`, preserving the existing health response bodies. Authentication is provided by the auth feature module; every task operation is scoped to the authenticated account.

API checks: `npm run typecheck --workspace @local-todo/api`, `npm test --workspace @local-todo/api`, `npm run lint --workspace @local-todo/api`, and `npm run build --workspace @local-todo/api`. Unit and Supertest HTTP tests use mocks; PostgreSQL integration tests remain opt-in.

### Swagger and Bruno

With the API running, open Swagger UI at **http://localhost:3000/api/docs** (or the configured API host and port). The OpenAPI document is served at **http://localhost:3000/api/docs-json**. Swagger lists the API routes and lets you try them against the running server.

To load every API route into Bruno, use **Import** → **URL** (or **OpenAPI**) and import `http://localhost:3000/api/docs-json`; choose or create a Bruno collection when prompted. This imports the routes from the live OpenAPI document, so newly documented endpoints are included on the next import. Use the auth endpoints to register or log in first; task requests require the session cookie. In Swagger, logging in sets the HttpOnly cookie for subsequent requests. Bruno must retain cookies between requests. For writes, send an `Origin` header matching the server's public origin (for example `http://localhost:3000` for direct local API access), and use `Content-Type: application/json` for auth requests, including logout.

## Accounts and task access

Create an account at `/register`, or sign in at `/login`. Registration signs you in; the calendar restores your session after reload. Sign out to revoke the session. Passwords are hashed, and the browser receives an HttpOnly session cookie rather than a JavaScript-readable token.

The API exposes `POST /api/auth/register` (`name`, `email`, `password`), `POST /api/auth/login` (`email`, `password`), `GET /api/auth/me`, and `POST /api/auth/logout`. Unauthenticated task requests return 401. All list, create, update, completion, deletion, and reorder operations enforce account ownership on the server; another account's IDs do not grant access. Signup does not accept roles or owner IDs. There is no admin bypass or team-sharing flow. Email verification, password reset, and invitations are not implemented.

Deploy the committed authentication migration with `npm run db:migrate`, then run `npm run db:generate`. Existing tasks are preserved as **unassigned** and are not visible to new accounts. They are never automatically claimed by the first signup; assigning legacy tasks requires a deliberate administrator-controlled database migration after verifying ownership. Do not reset the database.

Passwords must be 8–128 characters. Session cookies expire after seven days by default (`AUTH_SESSION_TTL_SECONDS`, configurable from 60 to 2592000 seconds). Login and signup are limited to 10 attempts per minute per API socket peer by default. **Behind nginx, all clients share this bucket unless you configure `AUTH_TRUSTED_PROXY_IPS` with the exact API-facing proxy IP(s)**. Trusted proxies must overwrite `X-Forwarded-For` with one validated client IP (the bundled nginx does); arbitrary forwarded headers are ignored. Keep the API private and update the allowlist when proxy addresses change. Deployments with multiple replicas should also use a shared edge rate limiter. Use `AUTH_COOKIE_SECURE=true` for HTTPS and configure the API's `AUTH_ORIGIN` to its exact public origin when TLS terminates at a reverse proxy. The default Compose setup is loopback-bound plain HTTP and explicitly disables Secure cookies for local development only.

## Calendar task data

The calendar uses the real API and PostgreSQL; it contains no seeded tasks or fabricated calendar details. An empty database shows an empty calendar. Existing date-only create, completion, and reorder requests remain compatible.

Deploy the additive migration with `npm run db:migrate`, then regenerate the Prisma client with `npm run db:generate` before running the API. The migration at `apps/api/prisma/migrations/20261015120000_calendar_task_details/migration.sql` preserves existing titles, dates, completion states, and positions. Legacy tasks become unscheduled (`startMinute` / `durationMinutes` null), with `PRIVATE` visibility, and null detail fields.

Create a scheduled task with `POST /api/tasks`:

```json
{
  "title": "Design Review",
  "date": "2024-10-22",
  "startMinute": 570,
  "durationMinutes": 90,
  "visibility": "SHARED",
  "notes": "Review the latest layouts",
  "sharedWith": "Design Team"
}
```

Only `title` and `date` are required. Scheduling uses **floating local calendar time**, not UTC instants: `570` means 09:30 on the supplied date. Supply both schedule fields or neither (both null is also accepted). Start is an integer from 0–1439, duration is an integer from 1–1440, and the task must end by midnight on the same date. PostgreSQL also enforces these constraints. No timezone conversion or cross-midnight scheduling is implied.

`visibility` is `PRIVATE` (default) or `SHARED`. **These are display/filter labels, not sharing permissions**; all tasks, including SHARED tasks, remain accessible only to their owner. `sharedWith` is a team label. Optional detail strings may be null. Task responses include the calendar fields, never internal positions. Projects, calls, and attendees are not supported; these fields are rejected in requests. Completion and reorder responses preserve the calendar details.

Calendar reads support either a single date or a range:

- `GET /api/tasks?date=2024-10-22` — preserves the existing manual day order.
- `GET /api/tasks?from=2024-10-20&to=2024-10-27` — inclusive `from`, exclusive `to`, 1–366 days, ordered by date, start time (unscheduled last), position, and ID.
- Either mode accepts `visibility=PRIVATE|SHARED` and `completed=true|false` filters, for example `/api/tasks?from=2024-10-20&to=2024-10-27&visibility=SHARED&completed=false`.

Do not combine `date` with `from`/`to`. Reordering still requires every task ID on that day, not just the filtered subset. `PATCH /api/tasks/:id` remains completion-only. `PUT /api/tasks/:id` replaces editable details using the same contract as creation (title/date required; omitted optional details reset to defaults) while preserving completion. Moving to another date appends to its manual order. `DELETE /api/tasks/:id` returns 204. Missing IDs return 404. Invitations and join calls are not supported. Unit/HTTP coverage includes strict field validation, range boundaries, and legacy requests. Opt-in PostgreSQL integration tests also verify metadata persistence, database schedule constraints, and migration preservation of legacy rows.

## Run with Docker Compose

Create an untracked `.env` with `DB_PASSWORD=your-password` (and optionally `DB_NAME`, `DB_USER`, `WEB_PORT`). Run `docker compose up --build -d` and open http://127.0.0.1:8080. The API image runs committed Prisma migrations before starting the API; it does not reset existing data. PostgreSQL data persists in the `postgres_data` volume. Use an HTTPS reverse proxy and secure session cookies before exposing the app publicly.

## Run locally

Requires Node 22+, npm and PostgreSQL. Set `DB_HOST`, `DB_PORT` (default 5432), `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in your environment or an untracked root `.env`. The API and Prisma CLI share these settings; no separate `DATABASE_URL` is needed. Create an empty application database and grant its application user schema/table permissions. Then:

```
npm ci
npm run db:migrate
npm run start:dev
```

`npm run db:migrate` deploys committed migrations; run it before starting the API when updating an installation. `npm run db:generate` regenerates the typed client offline. `npm run db:migrate:dev` is **development only**: Prisma Migrate Dev requires a disposable shadow database or PostgreSQL CREATE DATABASE rights; configure a dedicated shadow database if the app account does not have that privilege. Never use reset or schema push on an existing database.

`npm run test` uses Vitest for API and web tests; `npm run lint` and `npm run build` are available. `npm run test:e2e` runs Playwright against a configured running instance. Use only a disposable database for browser or database integration tests; tests create accounts and tasks. `E2E_BASE_URL=http://127.0.0.1:4200 npx playwright test e2e/auth-ui.spec.ts` checks the login/signup UI with a mocked API and needs no database; use `E2E_CHROMIUM_CHANNEL=msedge` if only Edge is installed. The remaining browser specs require the migrated real API. For real-database integration tests, create a separate disposable database whose name includes `test`, deploy the committed migration to it using that database as `DB_NAME`, then restore your normal `DB_NAME` and run `TEST_DB_NAME=<disposable-test-database> npm run test:integration`. The integration test refuses to use your configured application database. API endpoints: `GET /api/tasks?date=YYYY-MM-DD`, `POST /api/tasks` (`{ "title": "...", "date": "YYYY-MM-DD" }`), `PUT /api/tasks/:id` (same editable payload as POST), `DELETE /api/tasks/:id`, `PATCH /api/tasks/:id` (`{ "completed": true }`). Reordering: `PATCH /api/tasks/order` (`{ "date": "YYYY-MM-DD", "ids": [2, 1] }`), including every task ID for that day exactly once. Health: `/api/health/live` and `/api/health/ready`.
