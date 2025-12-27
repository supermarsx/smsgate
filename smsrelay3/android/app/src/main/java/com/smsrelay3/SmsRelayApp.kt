package com.smsrelay3

import android.app.Application
import android.content.pm.ApplicationInfo
import android.os.StrictMode
import com.smsrelay3.util.ThemeManager

class SmsRelayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        enableStrictModeForDebug()
        ThemeManager.applyMode(this)
    }

    private fun enableStrictModeForDebug() {
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (!isDebuggable) return
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectAll()
                .penaltyLog()
                .build()
        )
        StrictMode.setVmPolicy(
            StrictMode.VmPolicy.Builder()
                .detectAll()
                .penaltyLog()
                .build()
        )
    }
}
