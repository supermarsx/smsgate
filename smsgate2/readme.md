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
- Copy `.env.example` to `.env.local` or set `NEXT_PUBLIC_*` env vars for your environment. You can also drop a JSON config instead of envs (see below). Use `NEXT_PUBLIC_SMTP_ENABLED=false` to disable email delivery without touching the JSON files. Use `NEXT_PUBLIC_SMTP_ALLOW_INVALID_CERT=true` only when testing against self-signed SMTP (avoid in production). Use `NEXT_PUBLIC_THEME_DEFAULT` (`light` | `dark` | `system`) and `NEXT_PUBLIC_THEME_FORCE=true` to pin the UI theme if desired.
- The image copies `config/` and `locales/` so they can be volume-mounted for overrides (see `docker-compose.yml` volumes).

## Notes

- Bulma and Graphite Glass styling hooks are available in `styles/globals.css`.
- Auth entry lives at `/login` with config-driven auth modes (SSO/local/domain), PKCE scaffold, and session persistence; root `/` redirects based on session.
- Protected shell with role-aware nav/topbar is scaffolded under `/dashboard` and other routes.
- See `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` for contract details.
- i18n dictionaries live in `locales/*.json`; `lib/i18n` loads them and `bun run scan:i18n` flags hardcoded UI strings.
- Pairing QR codes are rendered locally (no external QR server); CSP allows inline scripts for Next runtime while keeping other sources tight.
- Configuration:
  - Default JSON config lives at `config/app.config.json` (overridden by `config/app.config.dev.json` in non-prod). Env vars still win (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_PATH`, `NEXT_PUBLIC_WS_ORIGIN`, `NEXT_PUBLIC_QR_ORIGIN`, `NEXT_PUBLIC_AUTH_*`, `NEXT_PUBLIC_AUTH_PRIMARY`, `NEXT_PUBLIC_LOCALE_DEFAULT`).
  - JSON keys (grouped):
    - `urls` (object): `apiBaseUrl` (REST master URL), `wsPath`, `wsOrigin`, `qrOrigin` (defaults to `/api/v1/qr` internal; avoid external QR providers).
    - `allowOfflineAdmin` (bool): allow default admin to log in locally when the backend is unreachable (typically enable in dev).
    - `theme` (object): `default` (`light` | `dark` | `system`), `force` (bool) to pin a theme globally.
    - `smtp` (object, optional): `enabled` (bool), `allowInvalidCert` (bool; not recommended, skips TLS validation for SMTP), `host`, `port`, `secure`, `username`, `password`, `fromEmail` for email-based reset; UI disables reset emails when `enabled` is false.
    - `offlineReset` (object, optional): `enabled` (bool) to allow token-based resets without email.
    - `adminDefaults` (object, optional): `username`, `password` used for offline admin bootstrap and default login hint (moved out of `offlineReset`).
    - `authModes` (object): booleans `oauth`, `simpleSignin`, `domainSignin` to gate UI flows.
    - `primaryAuthMode` (string): preferred default mode (`oauth` | `simple_signin` | `domain_signin`); falls back to first enabled.
    - `localization` (object): `locales` (array) and `defaultLocale` (string).
    - Email templates live in `templates/email/*.html` (reset + verification examples) and can be mounted alongside config.
  - Example (see checked-in files):
    ```json
    {
      "urls": {
        "apiBaseUrl": "http://localhost:4000/api/v1",
        "wsPath": "/api/v1/ws",
        "wsOrigin": "http://localhost:4000",
        "qrOrigin": "/api/v1/qr"
      },
      "allowOfflineAdmin": true,
      "theme": { "default": "system", "force": false },
      "smtp": {
        "enabled": true,
        "allowInvalidCert": false,
        "host": "localhost",
        "port": 1025,
        "secure": false,
        "username": "",
        "password": "",
        "fromEmail": "no-reply@example.com"
      },
      "offlineReset": { "enabled": true },
      "adminDefaults": { "username": "admin", "password": "changeme" },
      "authModes": { "oauth": true, "simpleSignin": true, "domainSignin": false },
      "primaryAuthMode": "simple_signin",
      "localization": {
        "locales": ["en-US", "pt-PT", "es-ES"],
        "defaultLocale": "en-US"
      }
    }
    ```

  ### Email templates

  - templates/email/password-reset.html: password reset with gradient header and plaintext fallback URL placeholder `{{reset_link}}`.
  - templates/email/device-alert.html: new-device alert with metadata placeholders (`{{event_time}}`, `{{event_ip}}`, `{{user_agent}}`).
  - Both templates use the Graphite/ink gradient palette already used in the app shell (deep navy background, neon accent bar) to stay on-brand.
