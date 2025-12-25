package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "config_state")
data class ConfigState(
    @PrimaryKey val version: Long,
    val etag: String?,
    val lastAppliedAtMs: Long,
    val rawJson: String?
)
