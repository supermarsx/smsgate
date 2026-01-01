use std::{env, fs, path::Path};

use syncserver::config::{AppConfig, DatabaseAdapter, HotStoreMode, RunEnvironment};

fn write_config(path: &Path) {
    let body = r#"
    {
      "env": "production",
      "server": {
        "host": "127.0.0.1",
        "port": 9090,
        "ws_max_connections": 2000,
        "ws_snapshot_limit": 25,
        "ws_ping_interval_ms": 5000
      },
      "hot_store": {
        "mode": "redis",
        "redis_url": "redis://example"
      },
      "database": {
        "adapter": "postgres",
        "url": "postgres://user:pass@localhost:5432/sync"
      },
      "auth": {
        "modes": ["oauth", "simple_signin"]
      }
    }
    "#;
    fs::write(path, body).expect("failed to write config fixture");
}

#[test]
fn loads_config_from_file_and_env_overrides() {
    let tmp_dir = tempfile::tempdir().expect("tmpdir");
    let config_path = tmp_dir.path().join("config.json");
    write_config(&config_path);

    env::set_var("SYNC_CONFIG_PATH", &config_path);
    env::set_var("SYNC_PORT", "8081");
    env::set_var("SYNC_HOTSTORE", "memory");
    env::set_var("SYNC_DB_ADAPTER", "sqlite");
    env::set_var("SYNC_DB_PATH", "data/test.db");
    // Required when oauth mode is enabled in the fixture
    env::set_var("SYNC_OAUTH_ISSUER", "https://issuer.example/");
    env::set_var("SYNC_OAUTH_AUDIENCE", "sync-audience");
    env::set_var("SYNC_OAUTH_HMAC_SECRET", "secretkey");

    let cfg = AppConfig::load().expect("config loaded");

    // File-loaded values.
    assert_eq!(cfg.env, RunEnvironment::Production);
    assert_eq!(cfg.server.host, "127.0.0.1");
    assert_eq!(cfg.server.ws_max_connections, 2000);
    assert_eq!(cfg.server.ws_snapshot_limit, 25);
    assert_eq!(cfg.server.ws_ping_interval_ms, 5000);
    assert_eq!(cfg.hot_store.redis_url.as_deref(), Some("redis://example"));
    assert_eq!(
        cfg.database.url.as_deref(),
        Some("postgres://user:pass@localhost:5432/sync")
    );
    assert!(cfg
        .auth
        .modes
        .iter()
        .any(|mode| matches!(mode, syncserver::config::AuthMode::Oauth)));

    // Env overrides applied last.
    assert_eq!(cfg.server.port, 8081);
    assert_eq!(cfg.hot_store.mode, HotStoreMode::Memory);
    assert_eq!(cfg.database.adapter, DatabaseAdapter::Sqlite);
    assert_eq!(cfg.database.path.as_deref(), Some("data/test.db"));

    // Derived helper.
    assert_eq!(cfg.socket_addr().to_string(), "127.0.0.1:8081");

    // Cleanup env for other tests.
    env::remove_var("SYNC_CONFIG_PATH");
    env::remove_var("SYNC_PORT");
    env::remove_var("SYNC_HOTSTORE");
    env::remove_var("SYNC_DB_ADAPTER");
    env::remove_var("SYNC_DB_PATH");
    env::remove_var("SYNC_OAUTH_ISSUER");
    env::remove_var("SYNC_OAUTH_AUDIENCE");
    env::remove_var("SYNC_OAUTH_HMAC_SECRET");
}
