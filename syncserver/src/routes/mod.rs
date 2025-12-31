use axum::{routing::get, Router};

use crate::{metrics, state::AppState};

pub mod admin;
pub mod audit;
pub mod auth;
pub mod config;
pub mod context;
pub mod contacts;
pub mod devices;
pub mod events;
mod health;
pub mod ingest;
pub mod pairing;
pub mod presence;
pub mod device;
pub mod ws;

/// Build the Axum router with health, readiness, and metrics endpoints.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::health))
        .route("/readyz", get(health::ready))
        .route("/api/v1/healthz", get(health::health))
        .route("/api/v1/readyz", get(health::ready))
        .route("/api/v1/events", get(events::list_events))
        .route(
            "/api/v1/config",
            get(config::get_config).patch(config::patch_config),
        )
            .route(
                "/api/v1/pairing/session",
                axum::routing::post(pairing::create_session),
            )
            .route(
                "/api/v1/pairing/session/:session_id",
                axum::routing::get(pairing::get_session),
            )
            .route(
                "/api/v1/pairing/complete",
                axum::routing::post(pairing::complete_session),
            )
            .route("/api/v1/auth/login", axum::routing::post(auth::login))
            .route(
                "/api/v1/auth/simple_signin",
                axum::routing::post(auth::simple_signin),
            )
            .route(
                "/api/v1/auth/domain_signin",
                axum::routing::post(auth::domain_signin),
            )
            .route("/api/v1/auth/logout", axum::routing::post(auth::logout))
        .route(
            "/api/v1/auth/password_reset/request",
            axum::routing::post(auth::request_password_reset),
        )
            .route(
                "/api/v1/auth/password_reset/confirm",
                axum::routing::post(auth::confirm_password_reset),
            )
            .route(
                "/api/v1/auth/refresh",
                axum::routing::post(auth::refresh_session),
            )
            .route("/api/v1/devices", get(devices::list_devices))
        .route(
            "/api/v1/devices/:device_id/rename",
            axum::routing::post(devices::rename_device),
        )
        .route(
            "/api/v1/devices/:device_id",
            axum::routing::patch(devices::rename_device),
        )
        .route(
            "/api/v1/devices/:device_id/disable",
            axum::routing::post(devices::disable_device),
        )
        .route(
            "/api/v1/devices/:device_id/enable",
            axum::routing::post(devices::enable_device),
        )
        .route(
            "/api/v1/devices/:device_id/diagnostics",
            axum::routing::get(devices::diagnostics),
        )
        .route(
            "/api/v1/events/:event_id/claim",
            axum::routing::post(events::claim_event),
        )
        .route(
            "/api/v1/events/:event_id/verify",
            axum::routing::post(events::verify_event),
        )
        .route(
            "/api/v1/events/:event_id/reject",
            axum::routing::post(events::reject_event),
        )
        .route(
            "/api/v1/events/:event_id/state",
            axum::routing::post(events::update_event_state),
        )
        .route("/api/v1/events", get(events::list_events))
            .route("/api/v1/ingest", axum::routing::post(ingest::ingest))
            .route(
                "/api/v1/presence/heartbeat",
                axum::routing::post(presence::heartbeat),
            )
            .route("/api/v1/ws", axum::routing::get(ws::ws_handler))
            .route(
                "/api/v1/device/config",
                axum::routing::get(device::get_device_config),
            )
            .route(
                "/api/v1/device/sims",
                axum::routing::post(device::update_sims),
            )
            .route(
                "/api/v1/device/contacts",
                axum::routing::post(device::update_contacts),
            )
            .route("/api/v1/audit", axum::routing::get(audit::list_audit))
        .route(
            "/api/v1/login-events",
            axum::routing::get(audit::list_login_events),
        )
        .route(
            "/api/v1/contacts",
            axum::routing::get(contacts::list_contacts),
        )
        .route(
            "/api/v1/contacts/toggle",
            axum::routing::post(contacts::toggle_contacts),
        )
        .route(
            "/api/v1/contacts/conflicts/:id/resolve",
            axum::routing::post(contacts::resolve_conflict),
        )
        .route(
            "/api/v1/contacts/export",
            axum::routing::get(contacts::export_contacts),
        )
        .route("/api/v1/admin/users", axum::routing::get(admin::list_users))
        .route(
            "/api/v1/admin/users",
            axum::routing::post(admin::create_user),
        )
        .route(
            "/api/v1/admin/users/:user_id",
            axum::routing::patch(admin::update_user).delete(admin::delete_user),
        )
        .route(
            "/api/v1/admin/users/:user_id/unlock",
            axum::routing::post(admin::unlock_user),
        )
        .route(
            "/api/v1/admin/users/:user_id/force_logout",
            axum::routing::post(admin::force_logout),
        )
        .route(
            "/api/v1/admin/numbers",
            axum::routing::get(admin::list_numbers).post(admin::create_number),
        )
        .route(
            "/api/v1/admin/numbers/:e164",
            axum::routing::patch(admin::update_number),
        )
        .route(
            "/api/v1/admin/numbers/:e164/assign",
            axum::routing::post(admin::assign_number),
        )
            .route(
                "/api/v1/admin/numbers/:e164/unassign",
                axum::routing::post(admin::unassign_number),
            )
            .route(
                "/api/v1/admin/numbers/:e164",
                axum::routing::delete(admin::delete_number),
            )
            .route("/api/v1/admin/roles", axum::routing::get(admin::list_roles))
            .route(
                "/api/v1/admin/roles",
                axum::routing::post(admin::create_role),
            )
            .route(
                "/api/v1/admin/rbac/groups",
                axum::routing::put(admin::update_group_mapping),
            )
            // UI compatibility aliases (non-admin paths)
            .route("/api/v1/users", axum::routing::get(admin::list_users))
            .route("/api/v1/users", axum::routing::post(admin::create_user))
            .route(
                "/api/v1/users/:user_id",
                axum::routing::patch(admin::update_user).delete(admin::delete_user),
            )
            .route(
                "/api/v1/users/:user_id/unlock",
                axum::routing::post(admin::unlock_user),
            )
            .route(
                "/api/v1/users/:user_id/force-logout",
                axum::routing::post(admin::force_logout),
            )
            .route("/api/v1/numbers", axum::routing::get(admin::list_numbers))
            .route("/api/v1/numbers", axum::routing::post(admin::create_number))
            .route(
                "/api/v1/numbers/:e164",
                axum::routing::patch(admin::update_number).delete(admin::delete_number),
            )
            .route(
                "/api/v1/numbers/:e164/assign",
                axum::routing::post(admin::assign_number),
            )
            .route(
                "/api/v1/numbers/:e164/assign",
                axum::routing::delete(admin::unassign_number),
            )
            .route("/metrics", get(metrics::metrics_handler))
            .with_state(state)
    }
