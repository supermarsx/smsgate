package com.smsrelay2

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class PendingMessage(
    val id: String,
    val number: String,
    val body: String,
    val timestamp: Long
)

object PendingMessageStore {
    private const val FILE_NAME = "pending_sms.json"

    fun create(number: String, body: String, timestamp: Long): PendingMessage {
        return PendingMessage(UUID.randomUUID().toString(), number, body, timestamp)
    }

    @Synchronized
    fun list(context: Context): List<PendingMessage> {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists()) return emptyList()
        return try {
            val text = file.readText()
            val json = JSONArray(text)
            val result = mutableListOf<PendingMessage>()
            for (i in 0 until json.length()) {
                val item = json.getJSONObject(i)
                result.add(
                    PendingMessage(
                        id = item.getString("id"),
                        number = item.getString("number"),
                        body = item.getString("body"),
                        timestamp = item.getLong("timestamp")
                    )
                )
            }
            result
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun add(context: Context, message: PendingMessage) {
        val items = list(context).toMutableList()
        items.add(message)
        write(context, items)
    }

    @Synchronized
    fun remove(context: Context, id: String) {
        val items = list(context).filterNot { it.id == id }
        write(context, items)
    }

    @Synchronized
    fun find(context: Context, id: String): PendingMessage? {
        return list(context).firstOrNull { it.id == id }
    }

    private fun write(context: Context, items: List<PendingMessage>) {
        val file = File(context.filesDir, FILE_NAME)
        val json = JSONArray()
        for (item in items) {
            val obj = JSONObject()
            obj.put("id", item.id)
            obj.put("number", item.number)
            obj.put("body", item.body)
            obj.put("timestamp", item.timestamp)
            json.put(obj)
        }
        file.writeText(json.toString())
    }
}
