package com.smsrelay3

import android.content.Context
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.LocalLogEntry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

object LogStore {
    private const val MAX_LINES = 200
    private val formatter = SimpleDateFormat("HH:mm:ss", Locale.US)
    private val lines = CopyOnWriteArrayList<String>()
    private val listeners = CopyOnWriteArrayList<(List<String>) -> Unit>()
    @Volatile
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun append(message: String) {
        append("info", "app", message)
    }

    fun append(level: String, category: String, message: String) {
        val timestamp = formatter.format(Date())
        lines.add("[$timestamp] $message")
        while (lines.size > MAX_LINES) {
            lines.removeAt(0)
        }
        persist(level, category, message)
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

    private fun persist(level: String, category: String, message: String) {
        val context = appContext ?: return
        CoroutineScope(Dispatchers.IO).launch {
            val entry = LocalLogEntry(
                id = UUID.randomUUID().toString(),
                tsMs = System.currentTimeMillis(),
                level = level,
                category = category,
                message = message,
                detailsJson = null
            )
            DatabaseProvider.get(context).localLogDao().insert(entry)
        }
    }
}
