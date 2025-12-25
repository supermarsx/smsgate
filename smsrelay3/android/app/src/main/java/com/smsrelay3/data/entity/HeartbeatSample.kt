package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "heartbeat_samples",
    indices = [
        Index(value = ["createdAtMs"])
    ]
)
data class HeartbeatSample(
    @PrimaryKey val id: String,
    val createdAtMs: Long,
    val queueDepth: Int,
    val networkType: String,
    val batteryPercent: Int,
    val lastSuccessSendAtMs: Long?,
    val lastRttMs: Long?,
    val wsState: String
)
