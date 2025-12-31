use chrono::Utc;
use syncserver::domain::{EventSource, EventState, SmsEvent};
use syncserver::persistence::{
    sql::{sqlite_url_from_path, SqlStore},
    PersistentStore,
};

#[tokio::test]
async fn sqlite_store_persists_event() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("events.db");
    let url = sqlite_url_from_path(&path);
    let store = SqlStore::connect(&url).await.expect("connect sqlite");

    let event = SmsEvent {
        id: "evt-sql".into(),
        device_id: "dev-1".into(),
        number_e164: Some("+1555".into()),
        sender: "alice".into(),
        content: "hello".into(),
        content_hash: "hash".into(),
        parsed_code: None,
        state: EventState::New,
        source: EventSource::AndroidSms,
        device_received_at: None,
        server_received_at: Utc::now(),
    };

    store.persist_event(&event).await.expect("persist");

    let pool = sqlx::any::AnyPoolOptions::new()
        .connect(&url)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}
