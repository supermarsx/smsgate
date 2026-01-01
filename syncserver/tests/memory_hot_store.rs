use std::time::Duration;

use chrono::{TimeZone, Utc};
use syncserver::{
    domain::{EventSource, EventState, SmsEvent},
    hot_store::{HotStore, MemoryHotStore},
};

fn sample_event(id: &str) -> SmsEvent {
    SmsEvent {
        id: id.to_string(),
        device_id: "device-1".into(),
        sim_slot_index: None,
        iccid: None,
        number_e164: Some("+123456789".into()),
        sender: "alice".into(),
        content: format!("hello {id}"),
        content_hash: format!("hash-{id}"),
        parsed_code: None,
        claimed_by: None,
        claimed_at: None,
        state: EventState::New,
        source: EventSource::AndroidSms,
        device_received_at: None,
        server_received_at: Utc.timestamp_millis_opt(0).single().unwrap(),
    }
}

#[tokio::test]
async fn stores_latest_and_pages_before_after() {
    let store = MemoryHotStore::new(5);
    for idx in 1..=5 {
        store.append_event(sample_event(&idx.to_string())).await;
    }

    let latest = store.latest(3).await;
    assert_eq!(latest.len(), 3);
    assert_eq!(latest[0].id, "5");
    assert_eq!(latest[1].id, "4");
    assert_eq!(latest[2].id, "3");

    let before = store.page_before("3", 2).await;
    assert_eq!(before.len(), 2);
    assert_eq!(before[0].id, "2");
    assert_eq!(before[1].id, "1");

    let after = store.page_after("3", 2).await;
    assert_eq!(after.len(), 2);
    assert_eq!(after[0].id, "4");
    assert_eq!(after[1].id, "5");
}

#[tokio::test]
async fn prunes_to_capacity() {
    let store = MemoryHotStore::new(3);
    for idx in 1..=5 {
        store.append_event(sample_event(&idx.to_string())).await;
    }
    let latest = store.latest(5).await;
    let ids: Vec<_> = latest.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, vec!["5", "4", "3"]);
}

#[tokio::test]
async fn dedup_keys_respect_ttl() {
    let store = MemoryHotStore::new(3);
    store.set_dedup_key("abc", Duration::from_millis(50)).await;
    assert!(store.has_dedup_key("abc").await);
    tokio::time::sleep(Duration::from_millis(60)).await;
    assert!(!store.has_dedup_key("abc").await);
}
