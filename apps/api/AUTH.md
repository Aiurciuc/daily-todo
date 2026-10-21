# API authentication deployment

Run `npm run db:migrate --workspace apps/api` before starting this version. The
additive migration leaves existing tasks unassigned (`owner_id IS NULL`), retained
but invisible. Signup never claims legacy tasks. SHARED remains a display label.

No additional dependencies are needed. Passwords use Node scrypt with random
salts; session cookies contain 32-byte random tokens, only SHA-256 hashes persist.

Configuration:
- `AUTH_ORIGIN`: exact public browser origin, e.g. `https://todo.example.com`
  (no trailing slash). **Set this when TLS terminates at a reverse proxy**;
  this is a canonical origin, not a CORS allowlist. Without it, the direct request
  protocol and Host are used. The bundled HTTP proxies preserve the browser Host
  and port, so local Angular/Compose need no override. Forwarded host/proto are ignored.
- `AUTH_COOKIE_SECURE`: `true` or `false`; defaults true in production. Keep
  true with HTTPS; use false only for local HTTP development.
- `AUTH_SESSION_TTL_SECONDS`: 60–2592000; default 604800 (7 days).
- `AUTH_TRUSTED_PROXY_IPS`: optional comma-separated **exact socket peer IPs**
  (including IPv4-mapped IPv6 if appropriate). Only these peers may supply a
  single valid client IP in X-Forwarded-For for rate limiting. The trusted edge
  MUST overwrite that header, never append client-supplied values. Do not expose
  the backend directly through a trusted address. Empty by default (forwarding
  headers ignored).

Login and registration share a per-client 10 attempts/minute limit, including
invalid input and successful attempts. It is process-local: deploy a shared
edge rate limiter for multi-replica APIs. Without trusted client forwarding,
clients behind a proxy share the proxy's limit.

Auth writes require `Content-Type: application/json` (send `{}` for logout).
All auth writes and authenticated task writes require the exact public Origin.
Use same-origin browser requests/cookies; no CORS credentials configuration is
needed. Cookies are HttpOnly, SameSite=Lax, host-only, path /api. Logout is
idempotent, revokes the stored token and clears the same cookie scope.

Expired tokens always fail authentication. Periodically remove expired rows
using `DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP`; the expiry
column is indexed. Also revoke relevant sessions when administratively removing
or disabling accounts. Never log passwords, raw cookies or session hashes.
