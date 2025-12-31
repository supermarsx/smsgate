//! Simple migration/seeding command for syncserver storage backends.
//! For JSON DB this is a no-op; for SQL backends this will ensure core tables
//! are present by invoking the SqlStore bootstrap.

use syncserver::{
    config::{AppConfig, DatabaseAdapter},
    persistence::sql::SqlStore,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    syncserver::telemetry::init_tracing();

    let config = AppConfig::load()?;
    match config.database.adapter {
        DatabaseAdapter::JsonDb => {
            println!("json_db adapter selected; no migrations required");
        }
        _ => {
            let url = config
                .database
                .url
                .clone()
                .or_else(|| {
                    config.database.path.as_ref().map(|p| {
                        syncserver::persistence::sql::sqlite_url_from_path(std::path::Path::new(p))
                    })
                })
                .unwrap_or_else(|| "sqlite://data/syncserver.db".into());
            println!("connecting to database at {}", url);
            SqlStore::connect(&url)
                .await
                .map_err(|err| format!("migration failed: {err}"))?;
            println!("migrations ensured for events/audit/login tables");
        }
    }

    Ok(())
}
