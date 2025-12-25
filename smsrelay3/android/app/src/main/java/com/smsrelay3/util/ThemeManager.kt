package com.smsrelay3.util

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import com.smsrelay3.ConfigStore

object ThemeManager {
    const val MODE_SYSTEM = "system"
    const val MODE_DARK = "dark"
    const val MODE_LIGHT = "light"

    fun currentMode(context: Context): String {
        return ConfigStore.getString(context, ConfigStore.KEY_APP_THEME, MODE_SYSTEM)
    }

    fun apply(context: Context, mode: String? = null) {
        when (mode ?: currentMode(context)) {
            MODE_DARK -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
            MODE_LIGHT -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
            else -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        }
    }
}
