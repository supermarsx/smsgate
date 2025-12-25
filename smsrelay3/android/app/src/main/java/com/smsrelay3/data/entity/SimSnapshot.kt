package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sim_snapshots")
data class SimSnapshot(
    @PrimaryKey val id: String,
    val capturedAtMs: Long,
    val slotIndex: Int,
    val subscriptionId: Int?,
    val iccid: String?,
    val msisdn: String?,
    val carrierName: String?,
    val status: String
)
