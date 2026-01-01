use chrono::Utc;
use syncserver::domain::{EventSource, EventState, SmsEvent};
use syncserver::persistence::sql::SqlStore;
use syncserver::persistence::PersistentStore;

#[tokio::test]
async fn sqlite_store_persists_event() {
    let store = SqlStore::connect("sqlite::memory:")
        .await
        .expect("connect sqlite");

    let event = SmsEvent {
        id: "evt-sql".into(),
        device_id: "dev-1".into(),
        sim_slot_index: None,
        iccid: None,
        number_e164: Some("+1555".into()),
        sender: "alice".into(),
        content: "hello".into(),
        content_hash: "hash".into(),
        parsed_code: None,
        claimed_by: None,
        claimed_at: None,
        state: EventState::New,
        source: EventSource::AndroidSms,
        device_received_at: None,
        server_received_at: Utc::now(),
    };

    store.persist_event(&event).await.expect("persist");

    let count = store.count_events().await.expect("count");
    assert_eq!(count, 1);
}
