package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "local_log_entries",
    indices = [
        Index(value = ["level"]),
        Index(value = ["tsMs"])
    ]
)
data class LocalLogEntry(
    @PrimaryKey val id: String,
    val tsMs: Long,
    val level: String,
    val category: String,
    val message: String,
    val detailsJson: String?
)
