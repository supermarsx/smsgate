# smsgate → smsgate2 Cutover Plan

- **Pilot**: deploy smsgate2 alongside legacy at `/new` with read-only syncserver mirror; validate auth/roles and device pairing in a non-prod tenant.
- **Data migration**: migrate config/users/devices/numbers to syncserver JSON/DB; export legacy tokens/numbers and re-import to syncserver; verify assignments and contact sync toggles.
- **Redirects**: add banner + link in legacy UI; configure reverse-proxy redirect from `/` to `/dashboard` once pilot is validated; keep legacy `/messages` accessible under `/legacy` for two weeks.
- **Rollback**: keep legacy database read/write for rollback window; retain syncserver config snapshot (`config.json`) and DB backups.
- **Comms & training**: send operator guide (auth modes, pairing, claim/verify UX); announce deprecation timeline (T0 notice, T+14d redirect, T+28d legacy off).
- **Monitoring**: enable CI (lint/typecheck/test/build/package) + docker-compose smoke; monitor audit/login events and device presence after switchover; capture WS reconnect/error metrics for first 48h.
