package com.smsrelay3

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList

object LogStore {
    private const val MAX_LINES = 200
    private val formatter = SimpleDateFormat("HH:mm:ss", Locale.US)
    private val lines = CopyOnWriteArrayList<String>()
    private val listeners = CopyOnWriteArrayList<(List<String>) -> Unit>()

    fun append(message: String) {
        val timestamp = formatter.format(Date())
        lines.add("[$timestamp] $message")
        while (lines.size > MAX_LINES) {
            lines.removeAt(0)
        }
        notifyListeners()
    }

    fun snapshot(): List<String> {
        return lines.toList()
    }

    fun clear() {
        lines.clear()
        notifyListeners()
    }

    fun register(listener: (List<String>) -> Unit) {
        listeners.add(listener)
        listener(lines.toList())
    }

    fun unregister(listener: (List<String>) -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyListeners() {
        val snapshot = lines.toList()
        listeners.forEach { it(snapshot) }
    }
}
