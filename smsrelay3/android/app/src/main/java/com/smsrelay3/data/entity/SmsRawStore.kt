package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sms_raw_store")
data class SmsRawStore(
    @PrimaryKey val id: String,
    val capturedAtMs: Long,
    val providerId: String?,
    val sender: String,
    val contentHash: String,
    val length: Int,
    val simSlotIndex: Int?,
    val subscriptionId: Int?,
    val deliveryPath: String
)
