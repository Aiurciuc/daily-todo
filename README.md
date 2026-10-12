# Local Todo — Phase 1 connectivity setup

Phase 1 is infrastructure only: a small Angular connectivity screen calls a NestJS health API, which executes a real `SELECT 1` against PostgreSQL. There are no users, tasks, domain tables, migrations, or todo workflows yet. This intentionally unauthenticated HTTP setup is a connectivity demo, not suitable for real user data.

## Requirements

- Node.js 22 LTS (22.14 or later) and npm 10+
- Docker Engine with the Docker Compose plugin for the full container stack

## Run the full stack with Docker

1. Copy `.env.example` to `.env` and set `DB_PASSWORD` to a long unique random secret. `.env` is ignored by git.
2. Choose exposure: default `WEB_BIND_ADDRESS=127.0.0.1` is host-only. To allow LAN access, set it to the host computer's LAN IPv4 address (for example `192.168.1.20`), then permit TCP `WEB_PORT` in the host firewall only for the trusted local subnet. Do not forward this port from your router to the public internet.
3. Start: `docker compose up --build -d`
4. Open `http://127.0.0.1:8080` locally, or `http://<host-lan-ip>:8080` from an allowed device. The page should report **All services connected**.
5. API and PostgreSQL ports are not published. The web container is the only published service; the API and database use the private Compose network.

Compose waits for PostgreSQL's `pg_isready` check before initially starting the API. The API remains running if PostgreSQL later goes away, so its readiness endpoint can report the outage and recover after the DB returns. No application migrations or seed data are needed.

Stop without removing data: `docker compose down`. PostgreSQL's named volume persists. **Do not run `docker compose down -v`** unless intentionally deleting the database volume.

## Native development (optional)

1. Copy `.env.example` to `.env`; set a development password.
2. Start PostgreSQL only: `docker compose up -d database`.
3. Install dependencies: `npm ci`.
4. Run both dev servers: `npm run start:dev`.
5. Open `http://localhost:4200`. Angular proxies `/api` to NestJS on port 3000.

The API loads root `.env` automatically. For native development, `DB_HOST=localhost`; Compose overrides it to `database` for the API container. The frontend uses a same-origin `/api` URL and never connects directly to PostgreSQL.

## Health endpoints

- `GET /api/health/live` returns `200 {"api":"ok"}` and does not check the database.
- `GET /api/health/ready` runs a bounded PostgreSQL query. It returns `200 {"api":"ok","database":"ok"}` when ready or `503 {"api":"ok","database":"unavailable"}` when the DB probe fails. Database credentials and driver errors are not returned.

Retry on the page to recheck. API unreachable is shown separately from database unavailable.

## Checks

- `npm run lint` — TypeScript checks.
- `npm test` — API health and Angular HTTP service tests.
- `npm run build` — production builds for API and frontend.
- `npm run test:e2e` — Playwright browser connectivity smoke test against the running Docker stack at port 8080. Install its browser once with `npx playwright install chromium` if needed.

## Troubleshooting

- **Compose says DB_PASSWORD is missing:** create `.env` from `.env.example` and replace its example value.
- **Port already in use:** set another `WEB_PORT` in `.env` and use that port in the browser.
- **Cannot open from another device:** set `WEB_BIND_ADDRESS` to the host's LAN IP, allow that port from the trusted subnet in the host firewall, and ensure the devices share the LAN. Keep router port forwarding disabled.
- **Database unavailable:** inspect `docker compose logs database api`; check `docker compose ps` and `docker compose logs database`. PostgreSQL must become healthy. The API retries through readiness checks without requiring a restart.
- **API unreachable:** inspect `docker compose logs api web`, confirm the API is running, and ensure the proxy path is `/api`.
- **Configuration changes:** after changing Compose environment configuration, recreate services using `docker compose up -d --force-recreate`. Preserve the named volume.

Phase 1 uses plain HTTP and has no authentication by design. Do not expose it to untrusted networks or put real credentials/data into it. HTTPS, identity, and business functionality belong to later approved phases.
