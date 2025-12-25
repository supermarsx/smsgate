package com.smsrelay3.util

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import com.smsrelay3.ConfigStore
import com.smsrelay3.R

object ThemeManager {
    const val MODE_SYSTEM = "system"
    const val MODE_DARK = "dark"
    const val MODE_LIGHT = "light"

    const val ACCENT_CYAN = "cyan"
    const val ACCENT_INDIGO = "indigo"
    const val ACCENT_MINT = "mint"
    const val ACCENT_AMBER = "amber"
    const val ACCENT_ROSE = "rose"

    fun currentMode(context: Context): String {
        return ConfigStore.getString(context, ConfigStore.KEY_APP_THEME, MODE_SYSTEM)
    }

    fun currentAccent(context: Context): String {
        return ConfigStore.getString(context, ConfigStore.KEY_APP_ACCENT, ACCENT_CYAN)
    }

    fun applyMode(context: Context, mode: String? = null) {
        when (mode ?: currentMode(context)) {
            MODE_DARK -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
            MODE_LIGHT -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
            else -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        }
    }

    fun applyTheme(activity: android.app.Activity, accent: String? = null) {
        val selected = accent ?: currentAccent(activity)
        val themeRes = when (selected) {
            ACCENT_INDIGO -> R.style.AppTheme_AccentIndigo
            ACCENT_MINT -> R.style.AppTheme_AccentMint
            ACCENT_AMBER -> R.style.AppTheme_AccentAmber
            ACCENT_ROSE -> R.style.AppTheme_AccentRose
            else -> R.style.AppTheme_AccentCyan
        }
        activity.setTheme(themeRes)
    }
}
