//! Contact store with disk persistence for device-uploaded contacts.

use dashmap::DashMap;
use std::{fs, path::PathBuf};

/// Simple contact store keyed by phone number.
#[derive(Debug)]
pub struct ContactStore {
    entries: DashMap<String, String>,
    path: PathBuf,
}

impl ContactStore {
    /// Create a new contact store and hydrate from disk if present.
    pub fn new(path: PathBuf) -> Self {
        let store = Self {
            entries: DashMap::new(),
            path,
        };
        store.load_from_disk();
        store
    }

    /// Insert or update a contact mapping.
    pub fn upsert(&self, number: &str, name: &str) {
        self.entries.insert(number.to_string(), name.to_string());
        let _ = self.persist();
    }

    /// Remove a contact by number.
    pub fn remove(&self, number: &str) {
        self.entries.remove(number);
        let _ = self.persist();
    }

    /// Bulk upsert from a list of number/name pairs.
    pub fn upsert_all(&self, contacts: &[(String, String)]) {
        for (number, name) in contacts {
            self.entries.insert(number.clone(), name.clone());
        }
        let _ = self.persist();
    }

    /// Bulk remove numbers.
    pub fn remove_all(&self, numbers: &[String]) {
        for number in numbers {
            self.entries.remove(number);
        }
        let _ = self.persist();
    }

    /// List all contacts as (number, name) tuples.
    pub fn list(&self) -> Vec<(String, String)> {
        self.entries
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect()
    }

    fn load_from_disk(&self) {
        if !self.path.exists() {
            return;
        }
        if let Ok(raw) = fs::read_to_string(&self.path) {
            if let Ok(map) =
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&raw)
            {
                for (k, v) in map {
                    if let Some(name) = v.as_str() {
                        self.entries.insert(k, name.to_string());
                    }
                }
            }
        }
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("failed to create contacts dir: {err}"))?;
        }
        let map: serde_json::Map<String, serde_json::Value> = self
            .entries
            .iter()
            .map(|entry| {
                (
                    entry.key().clone(),
                    serde_json::Value::String(entry.value().clone()),
                )
            })
            .collect();
        let serialized = serde_json::to_string_pretty(&map)
            .map_err(|err| format!("serialize contacts: {err}"))?;
        fs::write(&self.path, serialized).map_err(|err| format!("write contacts file: {err}"))?;
        Ok(())
    }
}
