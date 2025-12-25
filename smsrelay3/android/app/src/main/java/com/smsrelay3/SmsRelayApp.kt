package com.smsrelay3

import android.app.Application
import com.smsrelay3.util.ThemeManager

class SmsRelayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ThemeManager.apply(this)
    }
}
