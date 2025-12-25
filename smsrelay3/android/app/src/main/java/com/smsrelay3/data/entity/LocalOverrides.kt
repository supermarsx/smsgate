package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "local_overrides")
data class LocalOverrides(
    @PrimaryKey val id: String,
    val updatedAtMs: Long,
    val rawJson: String
)
