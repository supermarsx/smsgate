package com.smsrelay3.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

object PermissionGate {
    val requiredPermissions: List<String> = listOf(
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
    )

    val optionalPermissions: List<String> = listOfNotNull(
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.CAMERA,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.POST_NOTIFICATIONS
        } else {
            null
        }
    )

    fun hasPermission(context: Context, permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    fun allRequiredGranted(context: Context): Boolean {
        return requiredPermissions.all { hasPermission(context, it) }
    }

    fun allOptionalGranted(context: Context): Boolean {
        return optionalPermissions.all { hasPermission(context, it) }
    }

    fun allGranted(context: Context): Boolean {
        return allRequiredGranted(context) && allOptionalGranted(context)
    }
}
