package com.smsrelay3

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import android.os.Build
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class SmsUploadWorker(appContext: Context, workerParams: WorkerParameters) :
    Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val config = ConfigStore.getConfig(applicationContext)
        val messageId = inputData.getString(KEY_MESSAGE_ID)
        val pending = messageId?.let { PendingMessageStore.find(applicationContext, it) }
        val from = pending?.number ?: inputData.getString(KEY_FROM) ?: return Result.failure()
        val body = pending?.body ?: inputData.getString(KEY_BODY) ?: return Result.failure()
        val timestamp = pending?.timestamp ?: inputData.getLong(KEY_TIMESTAMP, System.currentTimeMillis())

        val date = formatDate(timestamp)
        val token = HashUtil.sha512(config.pin + config.salt)
        ConfigStore.setString(applicationContext, ConfigStore.KEY_TOKEN, token)
        val json = JSONObject()
        json.put("number", from)
        json.put("date", date)
        json.put("message", body)
        json.put("receivedAtEpochMs", timestamp)
        json.put("deviceManufacturer", Build.MANUFACTURER)
        json.put("deviceModel", Build.MODEL)
        json.put("deviceSdkInt", Build.VERSION.SDK_INT)

        val authMessage = SocketPresenceManager.buildAuthMessage(config, token)
        val smsMessage = JSONObject()
        smsMessage.put("type", "sms")
        smsMessage.put("payload", json)

        return sendViaWebSocket(config, authMessage, smsMessage.toString(), messageId)
    }

    private fun formatDate(timestamp: Long): String {
        val formatter = SimpleDateFormat("HH:mm:ss dd/MM/yyyy", Locale.US)
        return formatter.format(Date(timestamp))
    }

    private fun sendViaWebSocket(
        config: AppConfig,
        authMessage: String,
        smsMessage: String,
        messageId: String?
    ): Result {
        val latch = CountDownLatch(1)
        val success = AtomicBoolean(false)
        val wsUrl = SocketPresenceManager.buildWebSocketUrl(config.serverUrl)
        val request = Request.Builder().url(wsUrl).build()

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(authMessage)
                webSocket.send(smsMessage)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val json = JSONObject(text)
                if (json.optString("type") == "smsAck") {
                    success.set(true)
                    webSocket.close(1000, "ok")
                    latch.countDown()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                latch.countDown()
            }
        }

        HttpClient.instance.newWebSocket(request, listener)
        val completed = latch.await(5, TimeUnit.SECONDS)
        return if (completed && success.get()) {
            if (messageId != null) {
                PendingMessageStore.remove(applicationContext, messageId)
            }
            Result.success()
        } else {
            Result.retry()
        }
    }

    companion object {
        const val KEY_MESSAGE_ID = "message_id"
        const val KEY_FROM = "from"
        const val KEY_BODY = "body"
        const val KEY_TIMESTAMP = "timestamp"
    }
}
