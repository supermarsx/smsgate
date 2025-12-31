use axum::{
    body,
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use syncserver::{
    auth::Principal,
    config::{AppConfig, AuthMode, BootstrapDevice},
    routes,
    state::AppState,
};
use tower::ServiceExt;

fn admin_headers(builder: axum::http::request::Builder) -> axum::http::request::Builder {
    builder
        .header("x-user-id", "admin-tester")
        .header("x-user-role", "admin")
}

#[tokio::test]
async fn admin_user_crud_and_force_logout() {
    let mut cfg = AppConfig::default();
    cfg.auth.modes = vec![AuthMode::SimpleSignin];
    let state = AppState::new(cfg).await;
    let app = routes::router(state.clone());

    let create_payload = json!({
        "username": "alice",
        "password": "supersecret",
        "role": "admin"
    });

    let res = app
        .clone()
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/users")
                    .method("POST")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(create_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let body: serde_json::Value =
        serde_json::from_slice(&body::to_bytes(res.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let user_id = body["id"].as_str().unwrap().to_string();

    // Issue a session for the new user and verify it works, then force logout and expect failure.
    let role = state.user_store.get(&user_id).unwrap().role.clone();
    let session = state
        .session_store
        .create_session(Principal::User { id: user_id.clone(), role });

    let res_ok = routes::router(state.clone())
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .method("GET")
                .header("authorization", format!("Bearer {}", session.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_ok.status(), StatusCode::OK);

    let logout_res = routes::router(state.clone())
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri(format!("/api/v1/admin/users/{}/force_logout", user_id))
                    .method("POST"),
            )
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logout_res.status(), StatusCode::OK);

    let res_fail = routes::router(state.clone())
        .oneshot(
            Request::builder()
                .uri("/api/v1/config")
                .method("GET")
                .header("authorization", format!("Bearer {}", session.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_fail.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn admin_number_assignments() {
    let mut cfg = AppConfig::default();
    cfg.pairing.bootstrap_device = Some(BootstrapDevice {
        id: "dev-1".into(),
        token: "token-1".into(),
        name: Some("Device One".into()),
        enabled: true,
    });
    let state = AppState::new(cfg).await;
    let app = routes::router(state.clone());

    let create_payload = json!({
        "e164": "+15551234567",
        "label": "Test Number",
        "shared": false,
        "default_device_id": "dev-1"
    });
    let res = app
        .clone()
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/numbers")
                    .method("POST")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(create_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    let assign_payload = json!({ "device_id": "dev-1" });
    let assign_res = app
        .clone()
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/numbers/+15551234567/assign")
                    .method("POST")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(assign_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign_res.status(), StatusCode::OK);
    let assigned: serde_json::Value =
        serde_json::from_slice(&body::to_bytes(assign_res.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    assert_eq!(
        assigned["assigned_device_ids"].as_array().unwrap().len(),
        1
    );

    let unassign_res = app
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/numbers/+15551234567/unassign")
                    .method("POST")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(assign_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unassign_res.status(), StatusCode::OK);
    let unassigned: serde_json::Value =
        serde_json::from_slice(&body::to_bytes(unassign_res.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    assert!(unassigned["assigned_device_ids"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn admin_can_create_role_and_mapping() {
    let cfg = AppConfig::default();
    let state = AppState::new(cfg).await;
    let app = routes::router(state.clone());

    let role_payload = json!({
        "name": "auditor",
        "precedence": 10,
        "permissions": ["audit.read"]
    });
    let res = app
        .clone()
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/roles")
                    .method("POST")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(role_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    let mapping_payload = json!({
        "mapping": {
            "group-a": "auditor"
        }
    });
    let mapping_res = app
        .oneshot(
            admin_headers(
                Request::builder()
                    .uri("/api/v1/admin/rbac/groups")
                    .method("PUT")
                    .header("content-type", "application/json"),
            )
            .body(Body::from(mapping_payload.to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(mapping_res.status(), StatusCode::OK);
}
