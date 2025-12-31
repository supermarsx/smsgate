//! SIM inventory tracker that computes diffs and emits snapshots per device.

use dashmap::DashMap;

use crate::domain::SimSnapshot;

/// In-memory SIM inventory keyed by device id.
#[derive(Debug, Default)]
pub struct SimInventoryStore {
    sims: DashMap<String, Vec<SimSnapshot>>,
}

impl SimInventoryStore {
    /// Upsert SIM snapshots for a device, returning the updated list and a flag indicating change.
    pub fn upsert(&self, device_id: &str, sims: Vec<SimSnapshot>) -> (Vec<SimSnapshot>, bool) {
        let mut changed = false;
        let updated = self
            .sims
            .entry(device_id.to_string())
            .and_modify(|existing| {
                if *existing != sims {
                    *existing = sims.clone();
                    changed = true;
                }
            })
            .or_insert_with(|| {
                changed = true;
                sims.clone()
            })
            .clone();
        (updated, changed)
    }

    /// Fetch SIM snapshots for a device if present.
    pub fn get(&self, device_id: &str) -> Option<Vec<SimSnapshot>> {
        self.sims.get(device_id).map(|v| v.clone())
    }
}
