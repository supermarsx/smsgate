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
- Copy `.env.example` to `.env.local` or set `NEXT_PUBLIC_*` env vars for your environment.

## Notes

- Bulma and Graphite Glass styling hooks are available in `styles/globals.css`.
- Auth entry lives at `/login` with config-driven auth modes (SSO/local/domain), PKCE scaffold, and session persistence; root `/` redirects based on session.
- Protected shell with role-aware nav/topbar is scaffolded under `/dashboard` and other routes.
- See `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` for contract details.
- Copy `.env.example` to `.env.local` and tweak `NEXT_PUBLIC_*` values to match your syncserver endpoint.
