# smsgate2 (scaffold)

Next.js 14 app-directory scaffold to migrate the legacy smsgate UI toward the smsgate2 spec.

## Run

```
bun install
bun run dev
```

## Notes
- Bulma and Graphite Glass styling hooks are available in `styles/globals.css`.
- `app/page.tsx` loads env-driven config, locale switching, and basic copy for next steps.
- See `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` for contract details.
- Copy `.env.example` to `.env.local` and tweak `NEXT_PUBLIC_*` values to match your syncserver endpoint.
