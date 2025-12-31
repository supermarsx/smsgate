//! Audit and login event logging helpers.
//! Provides an async background worker that persists audit trails and login attempts
//! through the configured `PersistentStore`.

use std::sync::Arc;

use chrono::Utc;
use std::collections::VecDeque;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    config::AuthMode,
    domain::{AuditEntry, LoginEvent},
    persistence::PersistentStore,
};

/// Internal task variants handled by the audit worker.
enum AuditTask {
    Audit(AuditEntry),
    Login(LoginEvent),
}

/// Asynchronous audit logger that fans out to the configured persistence store.
#[derive(Clone)]
pub struct AuditService {
    enabled: bool,
    tx: mpsc::Sender<AuditTask>,
    audits: std::sync::Arc<tokio::sync::Mutex<VecDeque<AuditEntry>>>,
    logins: std::sync::Arc<tokio::sync::Mutex<VecDeque<LoginEvent>>>,
    capacity: usize,
}

impl AuditService {
    /// Create a new audit service and spawn the worker task.
    pub fn new(store: Arc<dyn PersistentStore>, enabled: bool) -> Self {
        let audits = std::sync::Arc::new(tokio::sync::Mutex::new(VecDeque::with_capacity(512)));
        let logins = std::sync::Arc::new(tokio::sync::Mutex::new(VecDeque::with_capacity(512)));
        let capacity = 512usize;
        let audits_clone = audits.clone();
        let logins_clone = logins.clone();
        let (tx, mut rx) = mpsc::channel::<AuditTask>(512);
        if enabled {
            tokio::spawn(async move {
                while let Some(task) = rx.recv().await {
                    match task {
                        AuditTask::Audit(entry) => {
                            push_ring(&audits_clone, entry.clone(), capacity).await;
                            if let Err(err) = store.persist_audit(&entry).await {
                                tracing::warn!(
                                    target: "storage",
                                    error = %err,
                                    audit_id = %entry.id,
                                    "failed to persist audit entry"
                                );
                            }
                        }
                        AuditTask::Login(event) => {
                            push_ring(&logins_clone, event.clone(), capacity).await;
                            if let Err(err) = store.persist_login(&event).await {
                                tracing::warn!(
                                    target: "storage",
                                    error = %err,
                                    login_id = %event.id,
                                    "failed to persist login event"
                                );
                            }
                        }
                    }
                }
            });
        } else {
            tokio::spawn(async move {
                while let Some(task) = rx.recv().await {
                    match task {
                        AuditTask::Audit(entry) => {
                            push_ring(&audits_clone, entry.clone(), capacity).await;
                            tracing::debug!(
                                target: "audit",
                                audit_id = %entry.id,
                                "audit logging disabled; dropping entry"
                            );
                        }
                        AuditTask::Login(event) => {
                            push_ring(&logins_clone, event.clone(), capacity).await;
                            tracing::debug!(
                                target: "audit",
                                login_id = %event.id,
                                "audit logging disabled; dropping login event"
                            );
                        }
                    }
                }
            });
        }

        Self {
            enabled,
            tx,
            audits,
            logins,
            capacity,
        }
    }

    /// Returns true when audit logging is active.
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Record a structured audit entry describing an actor/action/target tuple.
    #[allow(clippy::too_many_arguments)]
    pub async fn log_action(
        &self,
        actor: String,
        action: String,
        target: Option<String>,
        result: String,
        details: serde_json::Value,
        correlation_id: Option<String>,
        ip: Option<String>,
        user_agent: Option<String>,
    ) {
        if !self.enabled {
            return;
        }

        let entry = AuditEntry {
            id: Uuid::new_v4().to_string(),
            actor,
            action,
            target,
            result,
            correlation_id,
            details,
            occurred_at: Utc::now(),
            ip,
            user_agent,
        };

        let _ = self.tx.send(AuditTask::Audit(entry)).await;
    }

    /// Record a login attempt with IP, user agent, and 2FA status.
    #[allow(clippy::too_many_arguments)]
    pub async fn log_login(
        &self,
        identity: String,
        mode: AuthMode,
        result: String,
        ip: String,
        user_agent: Option<String>,
        two_fa_passed: bool,
        correlation_id: Option<String>,
    ) {
        if !self.enabled {
            return;
        }

        let login_event = LoginEvent {
            id: Uuid::new_v4().to_string(),
            identity,
            mode,
            result,
            ip,
            user_agent,
            two_fa_passed,
            occurred_at: Utc::now(),
        };

        let _ = self.tx.send(AuditTask::Login(login_event)).await;
        if let Some(correlation) = correlation_id {
            // Mirror login attempts into the audit stream for correlation.
            let _ = self
                .tx
                .send(AuditTask::Audit(AuditEntry {
                    id: Uuid::new_v4().to_string(),
                    actor: "auth.login".to_string(),
                    action: "login_attempt".to_string(),
                    target: None,
                    result: "recorded".to_string(),
                    correlation_id: Some(correlation),
                    details: serde_json::json!({ "mode": format!("{:?}", mode) }),
                    occurred_at: Utc::now(),
                    ip: None,
                    user_agent: None,
                }))
                .await;
        }
    }

    /// Return recent audit entries (in-memory ring, newest last).
    pub async fn list_audit(&self) -> Vec<AuditEntry> {
        let guard = self.audits.lock().await;
        guard.iter().cloned().collect()
    }

    /// Return recent login events (in-memory ring, newest last).
    pub async fn list_logins(&self) -> Vec<LoginEvent> {
        let guard = self.logins.lock().await;
        guard.iter().cloned().collect()
    }
}

async fn push_ring<T: Clone>(ring: &tokio::sync::Mutex<VecDeque<T>>, value: T, capacity: usize) {
    let mut guard = ring.lock().await;
    if guard.len() >= capacity {
        guard.pop_front();
    }
    guard.push_back(value);
}
