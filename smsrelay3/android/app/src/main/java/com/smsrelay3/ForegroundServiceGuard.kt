package com.smsrelay3

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

object ForegroundServiceGuard {
    fun canStartForegroundService(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun start(context: Context, intent: Intent): Boolean {
        if (!canStartForegroundService(context)) return false
        ContextCompat.startForegroundService(context, intent)
        return true
    }
}
