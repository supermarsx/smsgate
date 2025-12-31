use syncserver::config::{AppConfig, SeedDevice, SeedNumber, SeedUser};
use syncserver::state::AppState;

#[tokio::test]
async fn seeding_applies_users_numbers_devices() {
    let mut cfg = AppConfig::default();
    cfg.database.path = Some(
        tempfile::tempdir()
            .unwrap()
            .path()
            .join("seed.json")
            .to_string_lossy()
            .to_string(),
    );
    cfg.seeding.users.push(SeedUser {
        username: "alice@example.com".into(),
        password: "Str0ngPass#2025!".into(),
        role: "manager".into(),
        totp_secret: None,
    });
    cfg.seeding.numbers.push(SeedNumber {
        e164: "+15551234567".into(),
        label: Some("Support".into()),
        shared: false,
        default_device_id: Some("dev-seeded".into()),
    });
    cfg.seeding.devices.push(SeedDevice {
        id: "dev-seeded".into(),
        token: "seed-token-1".into(),
        name: Some("Seeded relay".into()),
        enabled: true,
    });

    let state = AppState::new(cfg).await;

    let user = state
        .user_store
        .user_by_username("alice@example.com")
        .expect("seeded user");
    assert_eq!(user.role.name, "manager");

    let number = state
        .numbers
        .get("+15551234567")
        .expect("seeded number present");
    assert_eq!(number.label.as_deref(), Some("Support"));
    assert_eq!(number.default_device_id.as_deref(), Some("dev-seeded"));

    let device = state
        .device_auth
        .diagnostics("dev-seeded")
        .expect("seeded device available");
    assert_eq!(device.name.as_deref(), Some("Seeded relay"));
    assert!(device.enabled);
}
