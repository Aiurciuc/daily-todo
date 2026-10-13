# First Feature Phase — Minimal Daily Tasks

## Context
- The user now wants only a task list for the current calendar day, previous/next day navigation, and completing/reactivating tasks.
- This supersedes the earlier undated Today bucket and broader product scope for this phase. No accounts, dashboards, backlog, reminders, or other features.
- Existing infrastructure: Angular 20, NestJS, and PostgreSQL via `pg`. Add Prisma for typed task queries, schema management, and migrations as requested; keep the feature scope unchanged.

## Approach
- Replace the connectivity-only home page with one date header, previous/next buttons, and a task list with completion checkboxes.
- Start on the browser's current local calendar date. Store task dates as PostgreSQL DATE values and transmit YYYY-MM-DD strings; no task times, timezone fields, automatic rollover, or movement between days.
- Keep completed tasks visible on their assigned day so they can be reactivated.
- Persist tasks and completion changes in PostgreSQL through one injectable Prisma service. Use Prisma's PostgreSQL driver adapter with a managed `pg` pool; replace the existing direct-pool provider rather than keeping parallel database clients. Preserve bounded connection/query timeouts, sanitized errors, and graceful shutdown.
- Include a title-only input and Add button to create a task for the selected day. Trim titles and require 1–200 characters. New tasks start active; clear the input only after a successful save. Disable submission while saving.
- Default scope is one common list per date without authentication or user separation; trusted local use only.

### Data and API contract
- One `tasks` table: identity integer `id`, `title` (maximum 200 characters, nonblank), `task_date` (DATE, indexed), and `completed` (BOOLEAN, default false). No user, dashboard, description, priority, or due-time fields.
- Define a Prisma `Task` model mapped to `tasks`: `id Int @id @default(autoincrement())`, `title String @db.VarChar(200)`, `date DateTime @db.Date @map("task_date")`, `completed Boolean @default(false)`, and an index on `date`. Add a nonblank-title CHECK constraint to the generated migration SQL.
- Responses use `{ id, title, date, completed }`. Prisma represents DATE values as JavaScript Date objects: convert validated YYYY-MM-DD inputs to UTC midnight explicitly and serialize using UTC date components, never local-time conversion. Keep browser calendar arithmetic separate. List tasks in ascending ID order and keep their position when toggled.
- `GET /api/tasks?date=YYYY-MM-DD` returns an array for that date, including completed tasks.
- `POST /api/tasks` accepts `{ title, date }` and returns the created task with HTTP 201.
- `PATCH /api/tasks/:id` accepts only `{ completed: boolean }` and returns the updated task. Set the explicit requested state rather than blindly toggling it.
- Validate real calendar dates in years 0001–9999, positive integer IDs, field types, and allowed fields. Return 400 for invalid requests, 404 for missing tasks (including Prisma record-not-found errors), and sanitized 503 responses for database unavailability. Use Prisma model operations; any raw health query must be a safe tagged query, never interpolated unsafe SQL.
- Use Prisma Migrate, not a custom migration runner or ledger. Commit the initial task migration. Provide `db:generate` (Prisma generate), `db:migrate:dev` (Prisma migrate dev, development only), and `db:migrate` (Prisma migrate deploy, local/container deployment) scripts. Generate the client before builds; migrations run explicitly before serving task requests. Never use schema push/reset against existing data.
- Select mutually compatible supported Prisma CLI/client/PostgreSQL adapter versions, pin them together in the lockfile, and verify compatibility with the existing Node, TypeScript, NestJS build, and container runtime. Include generated client, Prisma configuration/schema, migrations, and migration tooling in the API image.
- Retain the current DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD settings, with shared validated configuration for Prisma CLI and runtime. Construct the datasource URL with properly encoded credentials without logging it; do not require users to maintain conflicting connection settings. Document development shadow-database requirements without granting the application account broad privileges.
- Keep `/api/health/live` independent of PostgreSQL and use the same Prisma service for `/api/health/ready` with `SELECT 1`. Preserve existing 200/503 bodies and database-outage recovery behavior.

### UI and failure behavior
- Use the existing Angular 20 standalone setup, signals for view state, and HttpClient through a task service; no UI library, router, or global state library is needed.
- Previous/next buttons move one calendar day, not a fixed number of elapsed hours. Initial load/reload selects the browser's current local date; there is no automatic midnight rollover. Disable navigation at supported date limits.
- Display a labelled date heading, title input/Add button, and checkboxes with visible task titles. Completed tasks remain visible with checked boxes and struck-through titles.
- Cancel or ignore obsolete list requests when navigating quickly. Clear the unsaved title when changing days. Disable navigation while a create/update request is pending so a write cannot appear on the wrong day.
- Apply saved changes only after a successful response; disable pending actions and show a concise error on failure, retaining the title or prior completion state for retry. Include basic loading, empty-list, and retry states.
- No edit/delete, task movement, date picker, search, sorting controls, authentication, or additional feature screens. Keep health endpoints but replace the home connectivity screen.

## Files to modify
- `apps/web/src/app/app.component.ts` — replace status screen with minimal daily list.
- `apps/web/src/app/tasks.service.ts` — new HTTP access for date-specific tasks.
- `apps/api/src/tasks/` — new focused task module/controller/service and tests.
- `apps/api/src/app.module.ts` — register task module.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/prisma.config.ts` — Prisma model, committed migrations, and CLI configuration.
- `apps/api/src/database/` — shared configuration and injectable Prisma lifecycle service replacing the direct-pool provider.
- `apps/api/src/health/health.controller.ts` — readiness through Prisma with unchanged public contract.
- `apps/api/Dockerfile` — generate/package Prisma client and include deployment migration tooling.
- `e2e/` — daily-list browser tests.
- `package.json`, `apps/api/package.json`, `package-lock.json` — Prisma dependencies and generation/migration/test commands.
- `apps/web/src/app/` and `apps/api/test/` — task UI/service and API tests.
- `README.md` — native/Compose migration and verification instructions; do not modify actual `.env` secrets.

## Reuse
- `apps/api/src/database/database.module.ts`: reuse existing configuration validation, timeout policy, and shutdown intent while replacing `DATABASE_POOL` consumers with the Prisma service.
- `apps/web/src/main.ts`: existing HttpClient setup.
- Existing `/api` development and Nginx proxy infrastructure; preserve health endpoints.
- Existing Jest, Angular Vitest, and Playwright tooling.

## Steps
- [ ] Add Prisma schema, generated-client configuration, shared connection configuration, and managed Prisma service; adapt readiness checks and their tests.
- [ ] Generate and review the initial task migration; add generation/deployment commands, container packaging, and native/container migration instructions.
- [ ] Implement validated date-filtered listing, title-only creation, and explicit completion/reactivation updates.
- [ ] Implement single-screen day navigation and task checkboxes, with basic loading/error/empty states.
- [ ] Add focused tests and concise setup instructions without adding unrelated features.

## Verification
- Initial display uses today's local calendar date.
- Previous/next navigation isolates tasks by date across month/year/leap-day boundaries.
- Complete/reactivate persists after navigation and reload; tasks remain assigned to their original day.
- Rapid navigation cannot display results for an older selected date.
- Failed saves do not falsely show a successful state change.
- Add tasks to today, a previous day, and a next day; verify each appears only on its assigned date and survives reload.
- Test blank/overlong titles, malformed/nonexistent dates, invalid IDs, unknown payload fields, missing tasks, and sanitized database failures.
- Test Prisma migration deployment against an empty disposable PostgreSQL database and rerun it without errors or data loss; run real-database API integration tests using Prisma.
- Verify date-only round trips under different process/browser timezones, including DST transitions and years below 0100; no day shifting is allowed.
- Verify generated-client builds and container packaging; test unchanged liveness/readiness responses and database outage/recovery through Prisma. Verify credentials containing URL-special characters and clean shutdown without leaked pools.
- Update the existing Playwright connectivity test to check health endpoints independently of the replaced home screen, and add a browser test for creating, navigating, completing, reopening, and persistence.
- Run `npm run lint`, `npm test`, `npm run build`, and browser tests against a configured instance. Report any environment-dependent checks that cannot be executed.

## Explicit defaults and scope
- UI task creation is confirmed. Tasks use calendar-day grouping, replacing the earlier undated Today bucket.
- One common list per day; no login or private/shared separation in this minimal phase. Use only on a trusted local machine/network.
- Dates are date-only values; the browser's local calendar supplies the initial day. No timezone settings or automatic carry-over.
- This plan is the active feature scope; earlier broader roadmap items in `PLAN.md` are not included or authorized.
