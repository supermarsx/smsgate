# syncserver

Rust realtime core for smsrelay3 ingest and smsgate2 dashboards. Provides HTTP/WS APIs, auth/RBAC, pairing, presence, SIM inventory, persistence adapters, and an admin CLI (`syncctl`).

## Quick start

```bash
cd syncserver
cargo run
# server listens on 0.0.0.0:8080 using config/config.json (or SYNC_CONFIG_PATH)
```

Health: `/healthz`, readiness: `/readyz`, metrics: `/metrics`.

## Configuration

- Baseline file: `config/config.json` (see `config/config.example.json` for keys).
- Overrides: environment variables documented in `docs/syncserver-env.md`.
- Live PATCH: `/api/v1/config` (guarded by RBAC); changes are persisted back to `SYNC_CONFIG_PATH` and broadcast to WS clients.
- Auth policy: password entropy/denylist/history, lockout, admin bootstrap username (must be non-default in production).
- OAuth HS256 validation: `auth.oauth_issuer`, `auth.oauth_audience`, `auth.oauth_hmac_secret`.
- SMTP reset delivery: `auth.smtp.*` or `SYNC_SMTP_*`.

### Seeding

`config.seeding` allows idempotent startup seeds:

- `users[]`: username/password/role/totp_secret
- `numbers[]`: e164/label/shared/default_device_id
- `devices[]`: id/token/name/enabled

Seeds are validated and only created when missing.

## CLI: syncctl

Builds with the crate and calls the server’s REST APIs.

Examples:

```bash
# login (simple_signin); prints and exports session token
cargo run --bin syncctl -- login --username admin --password 'SmsgateSync#2025!'
export SYNCCTL_TOKEN=... # from login output

# fetch config
cargo run --bin syncctl -- config get

# create user
cargo run --bin syncctl -- user create --username ops@example.com --password 'Str0ng#Pass2025' --role manager

# list devices
cargo run --bin syncctl -- device list
```

Flags: `--base-url` (default `http://127.0.0.1:8080`), `--token` or `SYNCCTL_TOKEN`.

## Building binaries

Cross-platform helpers:

- Windows: `scripts/build-syncserver-all.ps1`
- Unix/macOS: `scripts/build-syncserver-all.sh`

Both build release binaries for `syncserver`, `syncctl`, and `migrate` into `dist/<target>/`. Adjust targets via `TARGETS` (shell) or `-Targets` (PowerShell). Targets must be installed via `rustup target add`.

## Tests

```bash
cargo test            # full suite (may be heavy on Windows toolchains)
cargo test --test seeding  # seed flow coverage
```

If you hit Windows PDB linker limits, try `cargo clean` then rerun, or build in a smaller workspace/test subset.
