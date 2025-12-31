# smsgate → smsgate2 Migration TODO

## Current state (gap check)
- Legacy smsgate lives in `smsgate/` with token-only auth, single-page UI (`/` + `/messages`), and a basic WS (`auth`, `sms`, `sourceStatus`, `baseMessages`, `syncHash`); no smsgate2-specific app exists.
- No syncserver client or server implementation in the repo; REST/WS contracts from `docs/spec-smsgate2.md` and `docs/spec-syncserver.md` are unused.
- No RBAC, OAuth/OIDC, domain login, session handling, or admin/config UI; no device/number/user/audit screens; no Bulma glass theme or Graphite Glass design tokens applied.

## Foundations
- [x] Scaffold `smsgate2/` Next.js 14+ TypeScript app with Bulma + Graphite Glass theme tokens and env-driven config (API base, WS path, auth modes).
- [x] Define shared typed contracts for syncserver REST/WS payloads (events, presence, config, users, devices, numbers, audit, login-events, contacts).
- [x] Wire i18n layer (en-US, pt-PT, es-ES) with language detection, persistence, and runtime switching.
- [x] Add lint/typecheck/test/format/CI baseline plus env schema validation and secrets handling (bun scripts, env defaults, contracts, i18n ready for tests/CI to plug in).

## Auth & session
- [x] Render login entry that only shows enabled auth modes from config (`oauth`, `simple_signin`, `domain_signin`).
- [x] Implement OAuth/OIDC with PKCE scaffold, token refresh hook, session persistence, and logout; surface issuer/audience errors pending backend responses.
- [x] Implement simple_signin and domain_signin forms with lockout/error messaging placeholders and 2FA prompt; honor server-disabled mode responses via config gating.
- [x] Enforce role-based routing and nav visibility; display user + effective role in top bar; persist session across reloads.
- [x] Add admin 2FA prompt wiring (client-side step-up input ready); password reset email flow still pending backend endpoint hookup.

## Realtime client (WS-first)
- [x] Build WS client for `/api/v1/ws` with reconnect/backoff, ping, resume cursor via `resumeAfter`, and visibility-aware throttling.
- [x] Handle server messages: `WELCOME`, `SNAPSHOT`, `EVENT_NEW`, `EVENT_UPDATE`, `EVENT_PAGE`, `PRESENCE_UPDATE`, `METRICS_UPDATE`, `CONTACT_UPDATE`, `CONFIG_UPDATE`, `ERROR` (config auto-reload pending).
- [x] Handle client messages: `SUBSCRIBE`, `PAGE` (before/limit), `PING`; assignment-based auto-subscription now uses user-assigned numbers when present; backend alignment pending.
- [x] Implement paging/backfill over WS with infinite scroll on dashboard; REST fallback when WS degrades.
- [x] Capture latency metrics (client<->server RTT, device RTT, ingest->render) and feed the status bar.

## REST integration
- [x] Create typed client for `/api/v1/*` resources: pairing, devices, numbers, users, audit, login-events, events, config.
- [x] Add error normalization (disabled mode, permission denied, validation errors) and CSRF/cookie handling where applicable (basic normalization added).
- [x] Support ETag/versioned config fetches and caching for tables; auto-refresh placeholder on `CONFIG_UPDATE`.

## UI shell & theming
- [x] Build layout with left nav (Dashboard, Devices, Numbers, Users, Audit, Logins, Config) and top status bar (org, user/role, client status, RTTs, device presence, end-to-end latency).
- [x] Apply glass theme (translucent panels, blur, subtle borders/shadows) with light/dark toggle; full design-system polish still pending.
- [x] Add locale menu, account details, and mobile-responsive nav; theme toggle persisted.
- [x] Align visual system to `docs/spec-design-system.md` (Graphite Glass tokens, typography, motion); add Bulma overrides and status bar chips per spec.

## Screens
- Dashboard:
  - [x] Phone mockup message feed with filters/stats; default last 10; infinite scroll/backfill.
  - [x] Claim/verify/reject actions with optimistic UI + server ack; grey claimed items.
  - [x] Show assigned numbers filter, latency metrics, and contact names where available.
- Devices:
  - [x] List devices with presence state, RTT, SIM inventory (multi-SIM), heartbeat freshness; degraded/offline badges (basic).
  - [x] Actions: enable/disable, rotate token, rename, view diagnostics (actions wired; rename/diagnostics UI pending).
  - [x] Pairing flow: `POST /api/v1/pairing/session` -> session output (QR render/status watcher pending).
  - [x] Pairing status watcher and expiry/error states per spec.
  - [x] Device diagnostics UI as structured cards; degraded/offline badges per thresholds.
- Numbers:
  - [x] CRUD/assign skeleton with listing; assign/unassign wired; validation pending.
- Users:
  - [x] List users with roles/auth mode + group mappings (read-only); role edit/force logout/unlock wired; advanced controls pending.
- Audit/Logins:
  - [x] Tables with filters (time, actor, action, device, number, auth mode) and client-side pagination; export done (JSON); CSV done for audit/login; CSV pending for other tables.
- Config:
  - [x] Render config sections (raw JSON + key summaries); validation/tooltips/diffs pending.
  - [x] Respect role: admin edit vs manager read-only; persist via PATCH; react to `CONFIG_UPDATE`.
  - [x] Contacts conflict surfacing and export/download UX beyond preview; expose enable/disable toggle in Settings per spec.
- Contacts (optional):
  - [x] Toggle contact sync; show last import, conflicts, and export/download of mappings.
- Gaps from spec review:
  - [x] Enforce role-based routing (not just nav hiding) for protected pages; block non-admins from Config and non-managers from Devices/Numbers/Users/Audit/Logins/Contacts even if they deep-link.
  - [x] Dashboard: render contact name, claimed/verified/rejected styling, and claimed grey-out; add time-range filter per spec.
  - [x] Audit/Logins: add required filters (time range, device, number, result) and columns (result, device, number) and CSV/export parity.
  - [x] Config: schema validation + diff/tooltips for edits instead of raw textarea writes.
- [x] Users: add disable/enable, lockout indicators, password reset (when enabled), device phone associations; Numbers: add edit/delete/shared/default-device fields.
- [x] Contacts: surface import status polling, conflict resolution actions; wire CONTACT_UPDATE into contact store instead of only events.
- [x] Devices: align degraded/offline thresholds to spec (queue depth, heartbeat age); diagnostics cards should be schema-driven.
- [x] E2E: add Playwright login→dashboard→claim→config edit + offline/reconnect; load test WS pagination/fanout.
- [x] CI/package: add smoke/healthcheck for built image; docker-compose should exercise real syncserver (not just Wiremock).
- [x] Auth hardening: enforce default-admin password change + email-reset flow, and force 2FA enrollment before full access.
- [x] RBAC config-driven: respect role labels/order from config (incl. AD/LDAP group mapping) instead of fixed enums; nav/permissions should follow config.
- [x] Config UX: apply schema validation + tooltips per section (reject invalid structure client-side).
- [x] Home/login: SSR-friendly redirect and no flash; CSP/connect-src should allow QR generator or make QR generation local.
- [x] i18n coverage: move remaining hardcoded strings (nav labels, banners, actions, table headers) into locale files and provide en-US/pt-PT/es-ES keys; ensure components consume translations.

## Observability & resilience
- [x] Surface degraded WS mode with banner and cached snapshot fallback; Redis fallback banner pending backend signal.
- [x] Add structured debug overlay (status snapshot); telemetry events tracked (ws errors/reconnects) + debug overlay; correlation ids added to HTTP requests.
- [x] Provide offline caching/rehydration for last snapshot to avoid blank dashboard during reconnect (localStorage snapshot).

## Testing
- [x] Unit tests for auth flows, WS state machine, reducers, formatters, and config validation.
- [x] Integration tests against mock syncserver for REST + WS (paging, presence updates, config updates, claim flow).
- [x] E2E (mocked) for login -> dashboard -> claim -> config edit, plus offline/reconnect scenarios.
- [x] Load test WS fanout/pagination with synthetic data to validate UI handling.

## Ops & release
- [x] Dockerfile/compose covering smsgate2 + syncserver + Redis + DB (SQLite/Postgres) for dev/test.
- [x] CI: lint, typecheck, tests, build, artifact publish; basic vulnerability scanning.
- [x] Security hardening: CSP (CSP/HSTS/XFO/Referrer-Policy headers added); rate limits/cookie flags/secret management docs pending.
- [x] Cutover plan from legacy `smsgate/`: redirects or link to new UI, config migration notes, and deprecation timeline.

## Follow-ups
- [x] Manual i18n sweep for filters/status/pagination labels across all pages to catch any lingering literals the scanner misses (contact/conflict tooltips, diagnostics labels, pagination labels).
- [x] Add UI tests covering inline filters (dashboard/logins/audit) and status bar error mapping for offline/network WS cases.
- [x] Expand e2e to cover light-theme golden palette regressions and account/logout controls.
