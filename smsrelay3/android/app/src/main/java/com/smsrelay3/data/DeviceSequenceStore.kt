package com.smsrelay3.data

import android.content.Context

object DeviceSequenceStore {
    private const val PREFS_NAME = "smsrelay3_seq"
    private const val KEY_SEQ = "device_seq"

    @Synchronized
    fun nextSeq(context: Context): Long {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val next = prefs.getLong(KEY_SEQ, 0L) + 1L
        prefs.edit().putLong(KEY_SEQ, next).apply()
        return next
    }
}
