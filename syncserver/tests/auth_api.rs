use axum::{
    body,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
    Router,
};
use serde_json::json;
use syncserver::{
    config::{AppConfig, AuthMode},
    routes::{auth as auth_routes, config},
    state::AppState,
};
use tower::ServiceExt;

fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/auth/login", post(auth_routes::login))
        .route("/api/v1/auth/logout", post(auth_routes::logout))
        .route(
            "/api/v1/config",
            axum::routing::get(config::get_config).patch(config::patch_config),
        )
        .with_state(state)
}

#[tokio::test]
async fn simple_signin_login_and_session_auth() {
    let mut cfg = AppConfig::default();
    cfg.auth.modes = vec![AuthMode::SimpleSignin];
    cfg.auth.password_pepper = Some("pepper".into());
    cfg.auth.session_ttl_secs = 3600;
    let state = AppState::new(cfg).await;
    let app = app_with_state(state);

    let login_payload = json!({
        "mode": "simple_signin",
        "username": "admin",
        "password": "changeme"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/login")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(login_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value =
        serde_json::from_slice(&body::to_bytes(res.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let session = body["session_token"].as_str().unwrap();

    // Use session token to read config via UserAuth session path.
    let config_res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .method("GET")
                .header("authorization", format!("Bearer {}", session))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(config_res.status(), StatusCode::OK);
}
