package com.smsrelay3.util

import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

data class SimInfo(
    val slotIndex: Int?,
    val subscriptionId: Int?,
    val iccid: String?,
    val msisdn: String?
)

object SimInfoResolver {
    fun resolve(context: Context, subscriptionId: Int?): SimInfo {
        if (!hasPermission(context)) {
            return SimInfo(null, subscriptionId, null, null)
        }
        val manager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
        val info = manager?.activeSubscriptionInfoList
            ?.firstOrNull { it.subscriptionId == subscriptionId }
        return SimInfo(
            slotIndex = info?.simSlotIndex,
            subscriptionId = subscriptionId,
            iccid = safeIccid(info),
            msisdn = safeNumber(info)
        )
    }

    private fun hasPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun safeIccid(info: SubscriptionInfo?): String? {
        return try {
            info?.iccId
        } catch (_: SecurityException) {
            null
        }
    }

    private fun safeNumber(info: SubscriptionInfo?): String? {
        return try {
            info?.number
        } catch (_: SecurityException) {
            null
        }
    }
}
