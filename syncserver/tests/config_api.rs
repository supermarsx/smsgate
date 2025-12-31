use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::get,
    Router,
};
use syncserver::{config::AppConfig, routes::config, state::AppState};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/config", get(config::get_config))
        .with_state(state)
}

#[tokio::test]
async fn returns_config_snapshot() {
    let mut config = AppConfig::default();
    config.auth.modes = vec![
        syncserver::config::AuthMode::SimpleSignin,
        syncserver::config::AuthMode::Oauth,
    ];
    config.ingest.max_batch = 42;
    let state = AppState::new(config).await;
    let app = app_with_state(state);

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .header("x-user-id", "user-1")
                .header("x-user-role", "admin")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
}
