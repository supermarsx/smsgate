# syncserver environment and config keys

Runtime flags are read from `config/config.json` (see `syncserver/config/config.example.json`) with environment variable overrides. Defaults are shown in parentheses.

- `SYNC_CONFIG_PATH` (`config/config.json`): path to JSON config file loaded at startup.
- `SYNC_ENV` (`development`): environment tag (`development` | `production`).
- `SYNC_HOST` (`0.0.0.0`): interface to bind.
- `SYNC_PORT` (`8080`): HTTP/WS listen port.
- `SYNC_WS_SNAPSHOT_LIMIT` (`10`): initial events sent on `SNAPSHOT`.
- `SYNC_WS_MAX_CONNECTIONS` (`5000`): hard cap on concurrent WS clients.
- `SYNC_WS_PING_INTERVAL_MS` (`15000`): WS ping interval in milliseconds.
- `SYNC_INGEST_DEDUP_TTL_MS` (`60000`): TTL for ingest deduplication keys.
- `SYNC_HOTSTORE_CAPACITY` (`1000`): hot store ring buffer capacity for latest events.
- `SYNC_INGEST_MAX_BATCH` (`100`): maximum events accepted per ingest request.
- `SYNC_PRESENCE_ONLINE_MS` (`20000`): heartbeat age threshold for online state.
- `SYNC_PRESENCE_DEGRADED_MS` (`60000`): heartbeat age threshold for degraded state (beyond is offline).
- `SYNC_HOTSTORE` (`memory`): hot store backend (`memory` | `redis`).
- `SYNC_REDIS_URL` (required when `SYNC_HOTSTORE=redis`): Redis connection string.
- `SYNC_DB_ADAPTER` (`json_db`): persistence backend (`json_db` | `sqlite` | `postgres` | `mysql`).
- `SYNC_DB_URL` (required for `postgres`/`mysql`; optional for `sqlite`): database connection string.
- `SYNC_DB_PATH` (`data/syncserver.json` when using `json_db`; optional for `sqlite`): file path for file-backed adapters.
- `SYNC_AUTH_MODES` (`simple_signin`): comma-separated list of enabled auth modes (`oauth`, `simple_signin`, `domain_signin`).

Docker Compose defaults set `SYNC_PORT=4000`, point Redis/DB to local compose services, and mount `./syncserver/config` into `/app/config`.
