package com.smsrelay3.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "outbound_messages")
data class OutboundMessage(
    @PrimaryKey val id: String,
    val deviceId: String,
    val seq: Long,
    val createdAtMs: Long,
    val smsReceivedAtMs: Long,
    val sender: String,
    val content: String,
    val contentHash: String,
    val simSlotIndex: Int?,
    val subscriptionId: Int?,
    val iccid: String?,
    val msisdn: String?,
    val status: String,
    val retryCount: Int,
    val lastAttemptAtMs: Long?,
    val source: String
)
