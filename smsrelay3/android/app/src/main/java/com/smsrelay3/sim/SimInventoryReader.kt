package com.smsrelay3.sim

import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import com.smsrelay3.data.entity.SimSnapshot
import java.util.UUID

object SimInventoryReader {
    fun readSnapshots(context: Context): List<SimSnapshot> {
        if (!hasPermission(context)) return emptyList()
        val manager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
        val subs = manager?.activeSubscriptionInfoList ?: emptyList()
        val now = System.currentTimeMillis()
        return subs.map { info -> buildSnapshot(info, now) }
    }

    private fun hasPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun buildSnapshot(info: SubscriptionInfo, capturedAtMs: Long): SimSnapshot {
        val iccid = try {
            info.iccId
        } catch (_: SecurityException) {
            null
        }
        val msisdn = try {
            info.number
        } catch (_: SecurityException) {
            null
        }
        val carrier = info.carrierName?.toString()
        return SimSnapshot(
            id = UUID.randomUUID().toString(),
            capturedAtMs = capturedAtMs,
            slotIndex = info.simSlotIndex,
            subscriptionId = info.subscriptionId,
            iccid = iccid,
            msisdn = msisdn,
            carrierName = carrier,
            status = "active"
        )
    }
}
