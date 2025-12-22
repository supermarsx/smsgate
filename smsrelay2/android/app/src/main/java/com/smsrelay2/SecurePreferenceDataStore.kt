package com.smsrelay2

import android.content.Context
import androidx.preference.PreferenceDataStore

class SecurePreferenceDataStore(private val context: Context) : PreferenceDataStore() {
    override fun putString(key: String?, value: String?) {
        if (key == null || value == null) return
        ConfigStore.setString(context, key, value)
    }

    override fun getString(key: String?, defValue: String?): String? {
        if (key == null || defValue == null) return defValue
        return ConfigStore.getString(context, key, defValue)
    }

    override fun putBoolean(key: String?, value: Boolean) {
        if (key == null) return
        ConfigStore.setBoolean(context, key, value)
    }

    override fun getBoolean(key: String?, defValue: Boolean): Boolean {
        if (key == null) return defValue
        val prefsValue = ConfigStore.getConfig(context)
        return when (key) {
            ConfigStore.KEY_ENABLE_LISTENER -> prefsValue.enableListener
            ConfigStore.KEY_ENABLE_FOREGROUND -> prefsValue.enableForegroundService
            ConfigStore.KEY_ENABLE_BOOT -> prefsValue.enableBootReceiver
            ConfigStore.KEY_ENABLE_SOCKET -> prefsValue.enableSocketPresence
            ConfigStore.KEY_NOTIFICATION_ENABLED -> prefsValue.notificationEnabled
            else -> defValue
        }
    }
}
