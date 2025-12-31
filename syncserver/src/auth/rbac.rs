//! RBAC store that resolves roles and permissions.

use std::collections::HashMap;

use crate::{
    auth::Role,
    config::{RbacConfig, RoleDefinition},
};

/// In-memory RBAC store backed by config.
#[derive(Debug, Clone)]
pub struct RbacStore {
    roles: HashMap<String, Role>,
    group_mapping: HashMap<String, String>,
}

impl RbacStore {
    pub fn from_config(config: &RbacConfig) -> Self {
        let mut roles = HashMap::new();
        for role in &config.roles {
            roles.insert(role.name.clone(), to_role(role));
        }
        Self {
            roles,
            group_mapping: config.group_mapping.clone(),
        }
    }

    /// Provide a clone for axum state extraction.
    pub fn clone_store(&self) -> Self {
        Self {
            roles: self.roles.clone(),
            group_mapping: self.group_mapping.clone(),
        }
    }

    /// Resolve a role by explicit name.
    pub fn role_by_name(&self, name: &str) -> Option<Role> {
        self.roles.get(name).cloned()
    }

    /// Resolve a role from group claims (highest precedence wins).
    pub fn role_from_groups(&self, groups: &[String]) -> Option<Role> {
        let mut best: Option<Role> = None;
        for group in groups {
            if let Some(role_name) = self.group_mapping.get(group) {
                if let Some(role) = self.roles.get(role_name) {
                    match &best {
                        Some(existing) if existing.precedence >= role.precedence => {}
                        _ => best = Some(role.clone()),
                    }
                }
            }
        }
        best
    }
}

fn to_role(def: &RoleDefinition) -> Role {
    Role {
        name: def.name.clone(),
        precedence: def.precedence,
        permissions: def.permissions.clone(),
    }
}

impl axum::extract::FromRef<crate::state::AppState> for RbacStore {
    fn from_ref(state: &crate::state::AppState) -> Self {
        state.rbac.as_ref().clone_store()
    }
}
