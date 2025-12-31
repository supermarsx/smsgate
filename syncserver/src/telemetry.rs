use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry};

/// Initialize tracing subscriber with env-driven filter and formatted output.
pub fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("syncserver=debug,axum=info"));

    let registry = Registry::default()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(false));

    registry.init();
}
