# smsrelay3 config keys

Core:
- realtime_mode: foreground_service | persistent_background | best_effort

Heartbeat:
- heartbeat.interval_s

SIM:
- sim.poll.interval_s

Reconcile:
- reconcile.enabled
- reconcile.window_minutes
- reconcile.interval_minutes
- reconcile.max_scan_count

Retention:
- retention.acked_hours
- retention.heartbeat_hours
- retention.sim_days
- retention.log_days
- retention.sms_raw_hours

Overrides:
- overrides.enabled
- overrides.allowlist[]

Contacts:
- contacts_sync.enabled
- contacts_sync.interval_s

TLS pinning:
- tls_pinning.enabled
- tls_pinning.pins[]
