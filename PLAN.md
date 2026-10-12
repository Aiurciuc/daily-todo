# Locally Self-Hosted Todo Application

## Context
- Build a locally self-hosted todo application with a Node.js backend and Angular frontend.
- The working directory is empty; there is no existing application or configuration to reuse.
- Support multiple users, initially accessible only over the local network.
- Deploy using Docker, with the database in a separate container/image.
- Deliver in separately approved phases. Phase 1 is infrastructure/setup only: prove Angular → NestJS → PostgreSQL communication without generating business code.
- Eventual MVP: basic tasks for the current day and a backlog of todos. Future-phase notes below preserve requirements, not authorization to implement them.

## Approach
- Recommend TypeScript throughout, Angular with Angular Material, NestJS for a modular Node.js REST API, and Prisma with PostgreSQL.
- PostgreSQL runs from its own official image, providing a natural fit for the required separate database service and concurrent users.
- NestJS provides dependency injection, validation integration, and testable modules; its structure should feel familiar alongside Angular.
- Use Docker Compose with three services: Nginx serving the Angular build and proxying `/api`, the NestJS API, and PostgreSQL.
- Publish only the web entry point to the LAN; API and database communicate over private Docker networking without published ports. Document host firewall restrictions.
- Store PostgreSQL data in a named volume. Phase 1 documents startup, shutdown without deleting volumes, configuration, and connectivity troubleshooting.

### Phase 1 — setup and connectivity only
- Scaffold minimal Angular and NestJS TypeScript applications in an npm workspace. Defer Angular Material until feature UI work.
- Use the PostgreSQL Node.js driver `pg` for a pooled connection and parameterless `SELECT 1` readiness probe. Introduce Prisma in the data-model phase; do not create dummy models, tables, seeds, or migrations just to test connectivity.
- Add `GET /api/health/live` for process liveness and `GET /api/health/ready` for an actual database query. Return HTTP 200 with `{ "api": "ok", "database": "ok" }` when ready, and HTTP 503 with `{ "api": "ok", "database": "unavailable" }` when the probe fails. Bound connection/query timeouts and do not expose credentials or raw database errors.
- The Angular root page is a technical connection-status screen only. Call the readiness endpoint with Angular HttpClient using relative `/api` URLs; show checking, connected, database unavailable, or API unreachable states and a Retry button. No todo/dashboard mockups.
- Nginx serves the Angular build and proxies `/api` unchanged to NestJS. For native development, configure the Angular dev-server proxy equivalently. The browser never connects directly to PostgreSQL.
- Compose starts three services from separate web, API, and official PostgreSQL images. Gate initial API startup on PostgreSQL health (`pg_isready`); keep the API alive during later database outages so readiness can report failure and recover without an API restart. Close the database pool on graceful shutdown.
- Publish only the web port, with a configurable LAN bind address; leave API and database ports unpublished. Use plain HTTP only for this credential-free setup demo on a trusted LAN. Add HTTPS before authentication or real user data in Phase 2.
- No users, authentication, roles, sessions, tasks, dashboards, date logic, business DTOs, CRUD endpoints, domain schema, or placeholder business modules in Phase 1.

### Future phases — retained product requirements (not Phase 1 work)
- Include administrator-created accounts, password hashing with Argon2id, and server-side authorization; no public registration.
- Give each user one private dashboard and provide one shared dashboard for all authenticated users. Everyone can create, edit, complete, reopen, and delete shared tasks. Private tasks are accessible only to their owner, including when accessed by an administrator.
- Provide Today and Backlog views with task creation, editing, completion, deletion, and manual movement between views.
- Treat Today as a manually managed bucket, interpreting the user's confirmation of the first option. Do not automatically move or change tasks at midnight. No calendar grouping, due dates, due times, or task timezone fields.
- Keep completion separate from bucket placement; show completed tasks in a collapsible section and allow reopening.
- Exclude reminders, recurring tasks, selected-member boards, and private/shared task transfers from the MVP.

### Future data and API (Phase 2 onward)
- `User`: username (unique), password hash, role (`ADMIN` or `USER`).
- `Dashboard`: kind (`PRIVATE` or `SHARED`) and optional unique owner ID. Migrations enforce valid ownership and a single shared dashboard; account creation also creates its private dashboard transactionally.
- `Task`: ID, dashboard ID, nonempty title (maximum 200 characters), optional description (maximum 5,000 characters), bucket (`TODAY` or `BACKLOG`), completed flag, creator ID. Technical audit timestamps do not affect task grouping.
- `Session`: hashed opaque token, user ID, expiry. Persist sessions in PostgreSQL; Redis is unnecessary.
- REST routes under `/api`: login/logout/current user, admin account creation/listing, accessible dashboards, and dashboard-scoped task listing/create/update/delete. Use PATCH for bucket and completion changes.
- Validate payloads with NestJS DTOs (`class-validator`/`class-transformer`); reject unknown fields. Derive identity from the session and check dashboard access on every task operation. Return consistent validation and authorization errors; use last-write-wins for concurrent edits initially.

### Future authentication and operations (Phase 2 onward)
- Bootstrap the first administrator using an explicit interactive CLI command inside the API container; never ship default credentials. Admins create subsequent accounts in a minimal admin screen.
- Use same-origin, HttpOnly, SameSite cookies, expiring server-side sessions, logout invalidation, CSRF tokens for mutations, and login rate limiting. Do not store tokens in browser local storage.
- Support LAN HTTPS via Nginx with a locally trusted certificate and Secure cookies. Document certificate trust setup; any optional plain HTTP development mode must warn that credentials are unencrypted.
- Use a supported Node.js LTS release and compatible stable Angular/NestJS/Prisma versions at implementation time; commit the lockfile and pin container versions.
- Configure database readiness checks and run committed migrations as a one-shot Compose service using the API image before starting the API. Build Angular into the Nginx image; use multi-stage builds and run the API as a non-root user.
- Keep secrets out of version control; document configuration, LAN bind address/firewall, startup, initial admin creation, upgrades, database backups, and restoration.

## Files to modify — Phase 1 only
New files and directories (greenfield application):
- `package.json`, `package-lock.json` — npm workspaces, pinned dependencies, and build/test/lint scripts.
- `apps/web/` — minimal Angular scaffold and generated TypeScript/build/test configuration.
- `apps/web/src/app/app.*`, `apps/web/src/app/connection-status.service.ts` — technical status page, HTTP service, and tests.
- `apps/web/proxy.conf.json` — local-development `/api` proxy.
- `apps/api/` — minimal NestJS scaffold and TypeScript/build/test configuration.
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts` — startup and infrastructure wiring.
- `apps/api/src/health/`, `apps/api/src/database/` — health endpoints, database pool, and focused tests only.
- `apps/api/test/` — readiness integration tests.
- `e2e/connectivity.spec.ts`, `playwright.config.ts` — browser connectivity smoke test.
- `compose.yaml` — three services, private networking, health checks, and PostgreSQL volume.
- `apps/web/Dockerfile`, `apps/web/nginx.conf`, `apps/api/Dockerfile` — multi-stage container builds and web proxy.
- `.env.example`, `.gitignore`, `.dockerignore` — configuration template and secret/build exclusions.
- `README.md` — setup, commands, expected health responses, network exposure, persistence, and troubleshooting.
- Do not create Prisma schemas/migrations or any business-feature directories in Phase 1.

## Reuse
- No existing application code; the directory was empty before `PLAN.md` was created.
- Reuse standard Angular/NestJS scaffolding and the official PostgreSQL image. Keep only infrastructure components needed for connectivity.

## Steps — Phase 1 implementation checklist
- [x] Scaffold the npm workspace, Angular app, and NestJS app with a supported Node.js LTS and compatible stable dependencies; commit the lockfile and pin container versions.
- [x] Add validated environment configuration and PostgreSQL connection pooling, bounded health queries, and graceful shutdown.
- [x] Implement liveness/readiness endpoints and test success/failure responses.
- [x] Build the technical Angular connection-status page and dev-server proxy.
- [x] Add multi-stage Docker builds, Nginx routing, Compose readiness checks, private networking, and persistent PostgreSQL storage; run the API as non-root.
- [x] Add connectivity tests and document local/Docker startup, LAN configuration, and troubleshooting. Keep actual secrets out of version control.
- [ ] Demonstrate FE → BE → DB connectivity and outage recovery in Docker, then stop for review. Docker is unavailable in the current environment; see implementation handoff.

## Later phases — roadmap only
Each phase requires its own detailed plan and approval before implementation.
1. **Phase 2: identity and security.** Add Prisma, user/session migrations, admin provisioning, login/logout, authorization foundations, HTTPS, and account management. Replace the direct `pg` pool with the chosen Prisma integration while retaining the health contract.
2. **Phase 3: todo MVP.** Add private and global shared dashboards, task schema/API/UI, manual Today/Backlog buckets, and completion/reopening. Everyone can edit shared tasks; private tasks remain owner-only.
3. **Phase 4: hardening and operations.** Expand cross-user/browser tests and document/test upgrades, backups, and restoration. Essential security and tests ship with their owning phase rather than waiting until this phase.

## Verification — Phase 1 acceptance criteria
- Run workspace lint, unit tests, integration tests, and production builds.
- From a clean configuration, run `docker compose up --build`; all three services start successfully without migrations or seeds.
- Open the web page from the host and a second LAN device. It reports connected based on a real `/api/health/ready` request through Nginx and a successful database query, not mocked data.
- Verify `/api/health/live` returns 200 and readiness returns 200 with the documented JSON. Test readiness against a disposable real PostgreSQL instance as well as mocked failure paths.
- Stop PostgreSQL after startup: readiness returns 503 within the configured timeout, liveness remains 200, and clicking Retry shows database unavailable. Restart PostgreSQL and Retry; connectivity recovers without rebuilding or restarting the API.
- Stop the API and Retry; the frontend displays API unreachable rather than a misleading database status or uncaught error. Restore the API and verify recovery.
- Test frontend checking/success/failure/retry states; run a Playwright smoke test of the real connected page.
- Confirm only the web port is published and the database named volume survives container recreation without volume deletion.
- Confirm no business tables, task/account endpoints, authentication code, feature mockups, or domain placeholders were generated.
- Review logs and responses for accidental secret disclosure. Document that this phase is an unauthenticated, HTTP-only connectivity demo, not ready for real user data.

## Scope confirmation
- Today means an undated manual bucket, not calendar history. Tasks stay there until explicitly changed.
- Shared means accessible and editable by every authenticated user; no invitations or membership management initially.
