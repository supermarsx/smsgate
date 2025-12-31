use std::time::Duration;

use tokio::sync::mpsc;

use crate::{domain::SmsEvent, persistence::PersistentStore};

/// Persistence worker handles background writes for compliance/policy.
pub struct PersistenceWorker {
    tx: mpsc::Sender<SmsEvent>,
}

impl PersistenceWorker {
    /// Spawn a new worker using the provided store.
    pub fn new(store: std::sync::Arc<dyn PersistentStore>) -> Self {
        let (tx, mut rx) = mpsc::channel::<SmsEvent>(1024);
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if let Err(err) = store.persist_event(&event).await {
                    tracing::warn!(
                        target: "storage",
                        error = %err,
                        event_id = %event.id,
                        "persistence worker failed to persist event"
                    );
                    // Basic backoff to avoid hammering storage on repeated errors.
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
        });
        Self { tx }
    }

    /// Enqueue an event for persistence.
    pub async fn enqueue(&self, event: SmsEvent) {
        let _ = self.tx.send(event).await;
    }
}

impl Clone for PersistenceWorker {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}
