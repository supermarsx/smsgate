package com.smsrelay3.presence

import android.content.Context
import android.os.BatteryManager

object BatteryUtil {
    fun batteryPercent(context: Context): Int {
        val manager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val percent = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        return percent.coerceAtLeast(-1)
    }
}
