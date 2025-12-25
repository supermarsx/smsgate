package com.smsrelay3.util

import android.content.Context
import android.content.res.Configuration
import com.smsrelay3.ConfigStore
import java.util.Locale

object LocaleManager {
    fun wrap(context: Context): Context {
        val tag = ConfigStore.getString(context, ConfigStore.KEY_APP_LOCALE, "system")
        if (tag.isBlank() || tag == "system") return context
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        return context.createConfigurationContext(config)
    }

    fun apply(context: Context, tag: String) {
        ConfigStore.setString(context, ConfigStore.KEY_APP_LOCALE, tag)
    }
}
