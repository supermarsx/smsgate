use syncserver::{config::AppConfig, routes::router, state::AppState};
use tokio::net::TcpListener;

/// Entrypoint: load configuration, start telemetry, and run the Axum server.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    syncserver::telemetry::init_tracing();

    let config = AppConfig::load()?;
    let state = AppState::new(config.clone());
    let app_state = state.clone();
    let app = router(app_state);

    let listener = TcpListener::bind(config.socket_addr()).await?;
    tracing::info!(
        host = %config.server.host,
        port = config.server.port,
        env = config.env.as_str(),
        "syncserver listening"
    );

    // Mark HTTP as ready once the listener is bound.
    state
        .ready_flags
        .http_ready
        .store(true, std::sync::atomic::Ordering::Relaxed);

    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term =
            signal(SignalKind::terminate()).expect("failed to install termination signal handler");
        term.recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("shutdown signal received, terminating server");
}
