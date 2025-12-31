//! In-memory contact store used for UI listings and device uploads.

use dashmap::DashMap;

/// Simple contact store keyed by phone number.
#[derive(Debug, Default)]
pub struct ContactStore {
    entries: DashMap<String, String>,
}

impl ContactStore {
    /// Insert or update a contact mapping.
    pub fn upsert(&self, number: &str, name: &str) {
        self.entries.insert(number.to_string(), name.to_string());
    }

    /// Remove a contact by number.
    pub fn remove(&self, number: &str) {
        self.entries.remove(number);
    }

    /// Bulk upsert from a list of number/name pairs.
    pub fn upsert_all(&self, contacts: &[(String, String)]) {
        for (number, name) in contacts {
            self.upsert(number, name);
        }
    }

    /// Bulk remove numbers.
    pub fn remove_all(&self, numbers: &[String]) {
        for number in numbers {
            self.remove(number);
        }
    }

    /// List all contacts as (number, name) tuples.
    pub fn list(&self) -> Vec<(String, String)> {
        self.entries
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect()
    }
}
