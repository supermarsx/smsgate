//! Admin-facing stores for numbers and simple pagination helpers.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};

use crate::{domain::NumberRecord, error::AppError};

/// Admin number store tracking assignments to devices.
#[derive(Debug, Default)]
pub struct NumberStore {
    numbers: DashMap<String, NumberRecord>,
}

impl NumberStore {
    /// Create or replace a number record.
    pub fn upsert(
        &self,
        e164: String,
        label: Option<String>,
        shared: bool,
        default_device_id: Option<String>,
    ) -> NumberRecord {
        let record = NumberRecord {
            e164: e164.clone(),
            label,
            shared,
            default_device_id,
            assigned_device_ids: Vec::new(),
        };
        self.numbers.insert(e164.clone(), record.clone());
        record
    }

    /// Fetch a number by id.
    pub fn get(&self, e164: &str) -> Option<NumberRecord> {
        self.numbers.get(e164).map(|v| v.clone())
    }

    /// Assign a device to the number.
    pub fn assign(&self, e164: &str, device_id: &str) -> Result<NumberRecord, AppError> {
        if let Some(mut entry) = self.numbers.get_mut(e164) {
            if !entry.assigned_device_ids.contains(&device_id.to_string()) {
                entry.assigned_device_ids.push(device_id.to_string());
            }
            if entry.default_device_id.is_none() {
                entry.default_device_id = Some(device_id.to_string());
            }
            return Ok(entry.clone());
        }
        Err(AppError::Validation("number not found".into()))
    }

    /// Unassign a device from the number.
    pub fn unassign(&self, e164: &str, device_id: &str) -> Result<NumberRecord, AppError> {
        if let Some(mut entry) = self.numbers.get_mut(e164) {
            entry.assigned_device_ids.retain(|id| id != device_id);
            if entry.default_device_id.as_deref() == Some(device_id) {
                entry.default_device_id = entry.assigned_device_ids.first().cloned();
            }
            return Ok(entry.clone());
        }
        Err(AppError::Validation("number not found".into()))
    }

    /// Unassign all devices from the number (used by DELETE alias without payload).
    pub fn unassign_all(&self, e164: &str) -> Result<NumberRecord, AppError> {
        if let Some(mut entry) = self.numbers.get_mut(e164) {
            entry.assigned_device_ids.clear();
            entry.default_device_id = None;
            return Ok(entry.clone());
        }
        Err(AppError::Validation("number not found".into()))
    }

    /// Update metadata for a number.
    pub fn update(&self, e164: &str, patch: NumberPatch) -> Result<NumberRecord, AppError> {
        if let Some(mut entry) = self.numbers.get_mut(e164) {
            if let Some(label) = patch.label {
                entry.label = Some(label);
            }
            if let Some(shared) = patch.shared {
                entry.shared = shared;
            }
            if let Some(default) = patch.default_device_id {
                entry.default_device_id = Some(default);
            }
            return Ok(entry.clone());
        }
        Err(AppError::Validation("number not found".into()))
    }

    /// Remove a number from the registry.
    pub fn delete(&self, e164: &str) {
        self.numbers.remove(e164);
    }

    /// Check whether a device is assigned to the given number (or number is shared).
    pub fn device_allowed(&self, e164: &str, device_id: &str) -> bool {
        if let Some(entry) = self.numbers.get(e164) {
            if entry.shared {
                return true;
            }
            if entry.assigned_device_ids.iter().any(|id| id == device_id) {
                return true;
            }
            if entry.default_device_id.as_deref() == Some(device_id) {
                return true;
            }
            return false;
        }
        // If number not registered, allow by default.
        true
    }

    /// Return a page of numbers.
    pub fn list(&self, page: u32, page_size: u32) -> Vec<NumberRecord> {
        let skip = (page.saturating_sub(1) * page_size) as usize;
        let take = page_size as usize;
        let mut values: Vec<_> = self
            .numbers
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        values.sort_by(|a, b| a.e164.cmp(&b.e164));
        values.into_iter().skip(skip).take(take).collect()
    }
}

/// Patch document for number updates.
#[derive(Debug, Deserialize)]
pub struct NumberPatch {
    pub label: Option<String>,
    pub shared: Option<bool>,
    pub default_device_id: Option<String>,
}

/// Pagination query parameters for admin collections.
#[derive(Debug, Deserialize, Serialize, Default)]
pub struct PageQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

impl PageQuery {
    /// Normalize pagination inputs with defaults.
    pub fn normalized(&self) -> (u32, u32) {
        let page = self.page.unwrap_or(1).max(1);
        let size = self.page_size.unwrap_or(50).clamp(1, 200);
        (page, size)
    }
}
