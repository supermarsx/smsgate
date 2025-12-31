# smsgate2 (scaffold)

Next.js 14 app-directory scaffold to migrate the legacy smsgate UI toward the smsgate2 spec.

## Run

```
bun install
bun run dev
```

For Turbopack (experimental, fastest reloads):

```
bun run dev:turbo
```

Security headers: `next.config.js` sets a conservative CSP, HSTS, X-Frame-Options, and Referrer-Policy; adjust `connect-src` if your syncserver lives on a different origin.

## Scripts

- `bun run lint` / `bun run format` / `bun run typecheck` / `bun run test` / `bun run build`
- `bun run package` builds the production Docker image (see `Dockerfile`); CI runs format, lint, typecheck, test, build, package, and audit jobs separately.

## Docker & compose

- `docker build -f Dockerfile -t smsgate2:local .` to build the app image.
- `docker-compose up` (repo root) brings up smsgate2 + mock syncserver (Wiremock) + Redis + Postgres; drop Wiremock stubs into `docs/mock-syncserver`.
- Copy `.env.example` to `.env.local` or set `NEXT_PUBLIC_*` env vars for your environment. You can also drop a JSON config instead of envs (see below).
- The image copies `config/` and `locales/` so they can be volume-mounted for overrides (see `docker-compose.yml` volumes).

## Notes

- Bulma and Graphite Glass styling hooks are available in `styles/globals.css`.
- Auth entry lives at `/login` with config-driven auth modes (SSO/local/domain), PKCE scaffold, and session persistence; root `/` redirects based on session.
- Protected shell with role-aware nav/topbar is scaffolded under `/dashboard` and other routes.
- See `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` for contract details.
- i18n dictionaries live in `locales/*.json`; `lib/i18n` loads them and `bun run scan:i18n` flags hardcoded UI strings.
- Pairing QR codes are rendered locally (no external QR server); CSP allows inline scripts for Next runtime while keeping other sources tight.
- Configuration:
  - Default JSON config lives at `config/app.config.json`. It includes `apiBaseUrl`, `wsPath`, `wsOrigin`, `qrOrigin`, `authModes` (oauth/simpleSignin/domainSignin booleans), and locale settings (`locales`, `defaultLocale`).
  - Optional `primaryAuthMode` picks the default login method (`oauth` / `simple_signin` / `domain_signin`); falls back to the first enabled mode.
  - Optional SMTP/offline reset config lives in the same JSON (`smtp` block for host/port/secure/username/password/fromEmail, `offlineReset` for enabling offline reset and default admin credentials).
  - Local overrides live in `config/app.config.dev.json` (applied automatically when `NODE_ENV !== "production"`).
  - Example (see checked-in files):
    ```json
    {
      "apiBaseUrl": "http://localhost:4000/api/v1",
      "wsPath": "/api/v1/ws",
      "wsOrigin": "http://localhost:4000",
      "qrOrigin": "https://api.qrserver.com",
      "authModes": { "oauth": true, "simpleSignin": true, "domainSignin": false },
      "primaryAuthMode": "simple_signin",
      "smtp": {
        "host": "localhost",
        "port": 1025,
        "secure": false,
        "username": "",
        "password": "",
        "fromEmail": "no-reply@example.com"
      },
      "offlineReset": { "enabled": true, "defaultAdminUsername": "admin", "defaultAdminPassword": "changeme" },
      "locales": ["en-US", "pt-PT", "es-ES"],
      "defaultLocale": "en-US"
    }
    ```
  - Env vars still override JSON when both are present (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_PATH`, `NEXT_PUBLIC_WS_ORIGIN`, `NEXT_PUBLIC_QR_ORIGIN`, `NEXT_PUBLIC_AUTH_*`, `NEXT_PUBLIC_LOCALE_DEFAULT`).
