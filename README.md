# Local Daily Tasks

A self-hosted day-by-day task list: Angular web UI, NestJS API, PostgreSQL, and Prisma. One shared list per date; **no authentication**. Keep it on a trusted local machine/network.

## Angular 22 application

The root shell renders the API-backed calendar in `apps/web/src/app/features/calendar-preview/`, composed from reusable `terra-ui` components. It uses standalone OnPush components, zoneless change detection, signals, and `httpResource` for cancellable date-range reads. Day/week/month navigation uses actual local dates. Create, edit, completion/reopen and delete actions persist through `HttpClient`; the calendar reloads after successful writes. Writes are guarded against duplicate submissions, errors retain form drafts, and loading/error/retry/empty states are explicit. Date-only tasks remain visible as unscheduled items. Notes and shared/private/team labels are persisted; labels are not access controls. Task links encode the selected task and date. The previous daily-list implementation remains under `apps/web/src/app/features/tasks/` but is not the active page.

Components keep separate HTML and SCSS files. Angular CLI defaults enforce external templates, SCSS, and OnPush for new components; existing component/service naming remains consistent. Prettier handles formatting and ESLint handles code quality.

Web checks: `npm run build --prefix apps/web`, `npm test --workspace @local-todo/web`, and `npm run lint`.

## NestJS API structure

The API uses feature modules with explicit dependencies. Task controllers accept validated request DTOs; `TasksService` maps results to public response DTOs, and `TasksRepository` owns Prisma queries and serializable transactions. Global validation rejects unknown fields and wrong types; serialization hides internal task positions. A database exception filter maps Prisma failures to sanitized HTTP responses.

`ConfigModule` supplies typed, validated API/database settings. `DatabaseService` owns the PostgreSQL pool and disposes it after HTTP shutdown. Health controllers delegate readiness checks to `HealthService`, preserving the existing health response bodies. The app intentionally remains unauthenticated for trusted local use.

API checks: `npm run typecheck --workspace @local-todo/api`, `npm test --workspace @local-todo/api`, `npm run lint --workspace @local-todo/api`, and `npm run build --workspace @local-todo/api`. Unit and Supertest HTTP tests use mocks; PostgreSQL integration tests remain opt-in.

### Swagger and Bruno

With the API running, open Swagger UI at **http://localhost:3000/api/docs** (or the configured API host and port). The OpenAPI document is served at **http://localhost:3000/api/docs-json**. Swagger lists the API routes and lets you try them against the running server.

To load every API route into Bruno, use **Import** → **URL** (or **OpenAPI**) and import `http://localhost:3000/api/docs-json`; choose or create a Bruno collection when prompted. This imports the routes from the live OpenAPI document, so newly documented endpoints are included on the next import. The app has no authentication; run it only on a trusted local network.

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

`visibility` is `PRIVATE` (default) or `SHARED`. **These are display/filter labels, not permissions**; this app still has no authentication. `sharedWith` is a team label. Optional detail strings may be null. Task responses include the calendar fields, never internal positions. Projects, calls, and attendees are not supported; these fields are rejected in requests. Completion and reorder responses preserve the calendar details.

Calendar reads support either a single date or a range:

- `GET /api/tasks?date=2024-10-22` — preserves the existing manual day order.
- `GET /api/tasks?from=2024-10-20&to=2024-10-27` — inclusive `from`, exclusive `to`, 1–366 days, ordered by date, start time (unscheduled last), position, and ID.
- Either mode accepts `visibility=PRIVATE|SHARED` and `completed=true|false` filters, for example `/api/tasks?from=2024-10-20&to=2024-10-27&visibility=SHARED&completed=false`.

Do not combine `date` with `from`/`to`. Reordering still requires every task ID on that day, not just the filtered subset. `PATCH /api/tasks/:id` remains completion-only. `PUT /api/tasks/:id` replaces editable details using the same contract as creation (title/date required; omitted optional details reset to defaults) while preserving completion. Moving to another date appends to its manual order. `DELETE /api/tasks/:id` returns 204. Missing IDs return 404. Invitations and join calls are not supported. Unit/HTTP coverage includes strict field validation, range boundaries, and legacy requests. Opt-in PostgreSQL integration tests also verify metadata persistence, database schedule constraints, and migration preservation of legacy rows.

## Run with Docker Compose

Create an untracked `.env` with `DB_PASSWORD=your-password` (and optionally `DB_NAME`, `DB_USER`, `WEB_PORT`). Run `docker compose up --build -d` and open http://127.0.0.1:8080. The API image runs committed Prisma migrations before starting the API; it does not reset existing data. PostgreSQL data persists in the `postgres_data` volume. Do not expose the web port publicly without adding authentication.

## Run locally

Requires Node 22+, npm and PostgreSQL. Set `DB_HOST`, `DB_PORT` (default 5432), `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in your environment or an untracked root `.env`. The API and Prisma CLI share these settings; no separate `DATABASE_URL` is needed. Create an empty application database and grant its application user schema/table permissions. Then:

```
npm ci
npm run db:migrate
npm run start:dev
```

`npm run db:migrate` deploys committed migrations; run it before starting the API when updating an installation. `npm run db:generate` regenerates the typed client offline. `npm run db:migrate:dev` is **development only**: Prisma Migrate Dev requires a disposable shadow database or PostgreSQL CREATE DATABASE rights; configure a dedicated shadow database if the app account does not have that privilege. Never use reset or schema push on an existing database.

`npm run test` uses Vitest for API and web tests; `npm run lint` and `npm run build` are available. `npm run test:e2e` runs Playwright against a configured running instance. Use only a disposable database for browser or database integration tests; tests create tasks. For real-database integration tests, create a separate disposable database whose name includes `test`, deploy the committed migration to it using that database as `DB_NAME`, then restore your normal `DB_NAME` and run `TEST_DB_NAME=<disposable-test-database> npm run test:integration`. The integration test refuses to use your configured application database. API endpoints: `GET /api/tasks?date=YYYY-MM-DD`, `POST /api/tasks` (`{ "title": "...", "date": "YYYY-MM-DD" }`), `PUT /api/tasks/:id` (same editable payload as POST), `DELETE /api/tasks/:id`, `PATCH /api/tasks/:id` (`{ "completed": true }`). Reordering: `PATCH /api/tasks/order` (`{ "date": "YYYY-MM-DD", "ids": [2, 1] }`), including every task ID for that day exactly once. Health: `/api/health/live` and `/api/health/ready`.
