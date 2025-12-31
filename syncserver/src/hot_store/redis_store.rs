use std::time::Duration;

use async_trait::async_trait;
use redis::{aio::ConnectionManager, AsyncCommands};

use crate::domain::SmsEvent;

use super::HotStore;

/// Redis-backed hot store with simple list-based ring buffer per org (single org for now).
pub struct RedisHotStore {
    client: ConnectionManager,
    list_key: String,
    dedup_prefix: String,
    capacity: usize,
}

impl RedisHotStore {
    pub async fn new(url: &str, capacity: usize) -> Result<Self, String> {
        let client = redis::Client::open(url)
            .map_err(|err| format!("failed to open redis client: {}", err))?;
        let manager = ConnectionManager::new(client)
            .await
            .map_err(|err| format!("failed to connect redis: {}", err))?;
        Ok(Self {
            client: manager,
            list_key: "syncserver:events".into(),
            dedup_prefix: "syncserver:dedup:".into(),
            capacity,
        })
    }

    fn dedup_key(&self, key: &str) -> String {
        format!("{}{}", self.dedup_prefix, key)
    }
}

#[async_trait]
impl HotStore for RedisHotStore {
    async fn append_event(&self, event: SmsEvent) {
        let payload =
            serde_json::to_string(&event).expect("event serialization should not fail at runtime");
        let mut conn = self.client.clone();
        let _: () = conn
            .lpush(&self.list_key, payload)
            .await
            .unwrap_or_default();
        let _: () = conn
            .ltrim(&self.list_key, 0, (self.capacity as isize) - 1)
            .await
            .unwrap_or_default();
    }

    async fn latest(&self, limit: usize) -> Vec<SmsEvent> {
        let mut conn = self.client.clone();
        let values: Vec<String> = conn
            .lrange(&self.list_key, 0, (limit as isize) - 1)
            .await
            .unwrap_or_default();
        values
            .into_iter()
            .filter_map(|v| serde_json::from_str(&v).ok())
            .collect()
    }

    async fn page_before(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent> {
        let entries = self.latest(self.capacity).await;
        let mut collected = Vec::new();
        let mut found = false;
        for event in entries.iter() {
            if found && collected.len() < limit {
                collected.push(event.clone());
            }
            if event.id == anchor_id {
                found = true;
            }
            if collected.len() == limit {
                break;
            }
        }
        collected
    }

    async fn page_after(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent> {
        let entries = self.latest(self.capacity).await;
        let mut collected = Vec::new();
        let mut found = false;
        for event in entries.iter().rev() {
            if found && collected.len() < limit {
                collected.push(event.clone());
            }
            if event.id == anchor_id {
                found = true;
            }
            if collected.len() == limit {
                break;
            }
        }
        collected.reverse();
        collected
    }

    async fn set_dedup_key(&self, key: &str, ttl: Duration) {
        let mut conn = self.client.clone();
        let _: () = conn
            .set_ex(self.dedup_key(key), "1", ttl.as_secs())
            .await
            .unwrap_or_default();
    }

    async fn has_dedup_key(&self, key: &str) -> bool {
        let mut conn = self.client.clone();
        conn.exists(self.dedup_key(key)).await.unwrap_or(false)
    }
}
