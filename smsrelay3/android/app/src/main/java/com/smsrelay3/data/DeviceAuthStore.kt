package com.smsrelay3.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object DeviceAuthStore {
    private const val PREFS_NAME = "smsrelay3_device_auth"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_DEVICE_TOKEN = "device_token"

    private fun prefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            context.getSharedPreferences("${PREFS_NAME}_fallback", Context.MODE_PRIVATE)
        }
    }

    fun getDeviceId(context: Context): String? {
        return prefs(context).getString(KEY_DEVICE_ID, null)
    }

    fun getDeviceToken(context: Context): String? {
        return prefs(context).getString(KEY_DEVICE_TOKEN, null)
    }

    fun setDeviceId(context: Context, value: String) {
        prefs(context).edit().putString(KEY_DEVICE_ID, value).apply()
    }

    fun setDeviceToken(context: Context, value: String) {
        prefs(context).edit().putString(KEY_DEVICE_TOKEN, value).apply()
    }
}
