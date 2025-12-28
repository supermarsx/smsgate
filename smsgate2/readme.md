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

## Notes
- Bulma and Graphite Glass styling hooks are available in `styles/globals.css`.
- Auth entry lives at `/login` with config-driven auth modes (SSO/local/domain), PKCE scaffold, and session persistence; root `/` redirects based on session.
- Protected shell with role-aware nav/topbar is scaffolded under `/dashboard` and other routes.
- See `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` for contract details.
- Copy `.env.example` to `.env.local` and tweak `NEXT_PUBLIC_*` values to match your syncserver endpoint.
