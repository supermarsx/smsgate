use syncserver::{
    auth::{permissions, users::UserStore},
    config::{AppConfig, AuthMode},
};

#[test]
fn password_policy_rejects_short_passwords() {
    let cfg = AppConfig::default();
    let roles: Vec<syncserver::auth::Role> = cfg
        .rbac
        .roles
        .iter()
        .map(|role| syncserver::auth::Role {
            name: role.name.clone(),
            precedence: role.precedence,
            permissions: role.permissions.clone(),
        })
        .collect();
    let store = UserStore::new(&cfg.auth, &roles);
    let err = store
        .create_user("bob", "short", roles[0].clone(), None)
        .unwrap_err();
    assert!(format!("{err:?}").to_lowercase().contains("password"));
}

#[test]
fn peppered_hash_allows_authentication() {
    let mut cfg = AppConfig::default();
    cfg.auth.modes = vec![AuthMode::SimpleSignin];
    cfg.auth.password_pepper = Some("pepper".into());
    let roles: Vec<syncserver::auth::Role> = cfg
        .rbac
        .roles
        .iter()
        .map(|role| syncserver::auth::Role {
            name: role.name.clone(),
            precedence: role.precedence,
            permissions: role.permissions.clone(),
        })
        .collect();
    let store = UserStore::new(&cfg.auth, &roles);
    let created = store
        .create_user("carol", "supersecret", roles[0].clone(), None)
        .expect("create user");
    let authed = store
        .authenticate("carol", "supersecret")
        .expect("auth ok");
    assert_eq!(created.id, authed.id);
    assert!(authed.role.has_permission(permissions::CONFIG_READ));
}
