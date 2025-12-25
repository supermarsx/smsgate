package com.smsrelay3.reconcile

import android.content.Context
import android.database.Cursor
import android.provider.Telephony

data class ProviderSms(
    val sender: String,
    val body: String,
    val receivedAtMs: Long,
    val subscriptionId: Int?
)

object SmsProviderReader {
    fun readRecent(context: Context, sinceMs: Long, limit: Int): List<ProviderSms> {
        val resolver = context.contentResolver
        val uri = Telephony.Sms.Inbox.CONTENT_URI
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.SUBSCRIPTION_ID
        )
        val selection = "${Telephony.Sms.DATE} >= ?"
        val selectionArgs = arrayOf(sinceMs.toString())
        val sort = "${Telephony.Sms.DATE} DESC LIMIT $limit"
        val results = mutableListOf<ProviderSms>()
        val cursor = resolver.query(uri, projection, selection, selectionArgs, sort) ?: return results
        cursor.use {
            val senderIndex = it.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyIndex = it.getColumnIndex(Telephony.Sms.BODY)
            val dateIndex = it.getColumnIndex(Telephony.Sms.DATE)
            val subIdIndex = it.getColumnIndex(Telephony.Sms.SUBSCRIPTION_ID)
            while (it.moveToNext()) {
                val sender = it.getStringOrNull(senderIndex).orEmpty()
                val body = it.getStringOrNull(bodyIndex).orEmpty()
                val date = it.getLongOrNull(dateIndex) ?: continue
                val subId = it.getIntOrNull(subIdIndex)
                results.add(ProviderSms(sender, body, date, subId))
            }
        }
        return results
    }

    private fun Cursor.getStringOrNull(index: Int): String? {
        return if (index >= 0 && !isNull(index)) getString(index) else null
    }

    private fun Cursor.getLongOrNull(index: Int): Long? {
        return if (index >= 0 && !isNull(index)) getLong(index) else null
    }

    private fun Cursor.getIntOrNull(index: Int): Int? {
        return if (index >= 0 && !isNull(index)) getInt(index) else null
    }
}
