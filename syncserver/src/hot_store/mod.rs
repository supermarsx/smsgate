//! Hot store abstraction for realtime fanout and paging.
//! Provides a pluggable interface with an in-memory fallback; Redis adapter will be added later.

use std::{
    collections::{HashMap, VecDeque},
    time::{Duration, Instant},
};

use async_trait::async_trait;
use tokio::sync::Mutex;

use crate::domain::SmsEvent;

/// Default ring buffer capacity for the in-memory hot store.
const DEFAULT_CAPACITY: usize = 1_000;

/// Interface for storing and paging hot events plus dedup metadata.
#[async_trait]
pub trait HotStore: Send + Sync {
    /// Append an event into the hot store, trimming to retention window.
    async fn append_event(&self, event: SmsEvent);
    /// Return the newest events up to `limit`, ordered newest -> oldest.
    async fn latest(&self, limit: usize) -> Vec<SmsEvent>;
    /// Return events older than the anchor (exclusive), newest -> oldest, up to `limit`.
    async fn page_before(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent>;
    /// Return events newer than the anchor (exclusive), oldest -> newest, up to `limit`.
    async fn page_after(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent>;
    /// Insert a dedup key with TTL.
    async fn set_dedup_key(&self, key: &str, ttl: Duration);
    /// Check whether a dedup key is present and unexpired.
    async fn has_dedup_key(&self, key: &str) -> bool;
}

/// In-memory hot store with ring buffer and TTL-based dedup keys.
pub struct MemoryHotStore {
    capacity: usize,
    events: Mutex<VecDeque<SmsEvent>>,
    dedup: Mutex<HashMap<String, Instant>>,
}

impl MemoryHotStore {
    /// Create a new in-memory store with a fixed capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            events: Mutex::new(VecDeque::with_capacity(capacity)),
            dedup: Mutex::new(HashMap::new()),
        }
    }

    fn prune_dedup_map(map: &mut HashMap<String, Instant>) {
        let now = Instant::now();
        map.retain(|_, expires_at| *expires_at > now);
    }
}

#[async_trait]
impl HotStore for MemoryHotStore {
    async fn append_event(&self, event: SmsEvent) {
        let mut events = self.events.lock().await;
        if events.len() == self.capacity {
            events.pop_front();
        }
        events.push_back(event);
    }

    async fn latest(&self, limit: usize) -> Vec<SmsEvent> {
        let events = self.events.lock().await;
        events.iter().rev().take(limit).cloned().collect::<Vec<_>>()
    }

    async fn page_before(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent> {
        let events = self.events.lock().await;
        let mut collected = Vec::with_capacity(limit);
        let mut seen_anchor = false;

        for event in events.iter().rev() {
            if seen_anchor && collected.len() < limit {
                collected.push(event.clone());
            }
            if event.id == anchor_id {
                seen_anchor = true;
            }
            if collected.len() == limit {
                break;
            }
        }

        collected
    }

    async fn page_after(&self, anchor_id: &str, limit: usize) -> Vec<SmsEvent> {
        let events = self.events.lock().await;
        let mut collected = Vec::with_capacity(limit);
        let mut seen_anchor = false;

        for event in events.iter() {
            if seen_anchor && collected.len() < limit {
                collected.push(event.clone());
            }
            if event.id == anchor_id {
                seen_anchor = true;
            }
            if collected.len() == limit {
                break;
            }
        }

        collected
    }

    async fn set_dedup_key(&self, key: &str, ttl: Duration) {
        let mut dedup = self.dedup.lock().await;
        dedup.insert(key.to_string(), Instant::now() + ttl);
    }

    async fn has_dedup_key(&self, key: &str) -> bool {
        let mut dedup = self.dedup.lock().await;
        Self::prune_dedup_map(&mut dedup);
        dedup.contains_key(key)
    }
}

impl Default for MemoryHotStore {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}
