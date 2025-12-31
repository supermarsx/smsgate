use std::{env, net::SocketAddr};

#[derive(Debug, Clone, Copy)]
pub enum RunEnvironment {
    Development,
    Production,
}

impl RunEnvironment {
    pub fn as_str(&self) -> &'static str {
        match self {
            RunEnvironment::Development => "development",
            RunEnvironment::Production => "production",
        }
    }

    pub fn from_env(value: Option<String>) -> Self {
        match value
            .as_deref()
            .map(|env| env.to_ascii_lowercase())
            .as_deref()
        {
            Some("production") | Some("prod") => RunEnvironment::Production,
            _ => RunEnvironment::Development,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub env: RunEnvironment,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let host = env::var("SYNC_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("SYNC_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(8080);
        let env = RunEnvironment::from_env(
            env::var("SYNC_ENV")
                .ok()
                .or_else(|| env::var("APP_ENV").ok())
                .or_else(|| env::var("RUN_ENV").ok()),
        );

        Self { host, port, env }
    }

    pub fn socket_addr(&self) -> SocketAddr {
        let value = format!("{}:{}", self.host, self.port);
        value
            .parse()
            .unwrap_or_else(|err| panic!("invalid SYNC_HOST/SYNC_PORT combination: {}", err))
    }
}
