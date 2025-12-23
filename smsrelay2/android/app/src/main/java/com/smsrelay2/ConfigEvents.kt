package com.smsrelay2

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArrayList

object ConfigEvents {
    private val listeners = CopyOnWriteArrayList<() -> Unit>()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun register(listener: () -> Unit) {
        listeners.add(listener)
    }

    fun unregister(listener: () -> Unit) {
        listeners.remove(listener)
    }

    fun notifyChanged() {
        mainHandler.post {
            listeners.forEach { it() }
        }
    }
}
