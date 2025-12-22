package com.smsrelay2

import androidx.test.core.app.ApplicationProvider
import androidx.work.Data
import androidx.work.testing.TestListenableWorkerBuilder
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.WebSocketListener
import okhttp3.WebSocket
import okhttp3.Response
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SmsUploadWorkerTest {
    @Test
    fun upload_sendsExpectedPayloadAndHeaders() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val server = MockWebServer()
        val smsReceived = arrayListOf<JSONObject>()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onMessage(webSocket: WebSocket, text: String) {
                        val json = JSONObject(text)
                        when (json.optString("type")) {
                            "auth" -> Unit
                            "sms" -> {
                                smsReceived.add(json)
                                webSocket.send("""{"type":"smsAck"}""")
                            }
                        }
                    }
                }
            )
        )
        server.start()

        val baseUrl = server.url("/").toString().trimEnd('/')
        ConfigStore.setString(context, ConfigStore.KEY_SERVER_URL, baseUrl)
        ConfigStore.setString(context, ConfigStore.KEY_API_PATH, "/api/push/message")
        ConfigStore.setString(context, ConfigStore.KEY_HTTP_METHOD, "POST")
        ConfigStore.setString(context, ConfigStore.KEY_CLIENT_ID_HEADER, "x-clientid")
        ConfigStore.setString(context, ConfigStore.KEY_CLIENT_ID_VALUE, "DEVICE01")
        ConfigStore.setString(context, ConfigStore.KEY_AUTH_HEADER, "Authorization")
        ConfigStore.setString(context, ConfigStore.KEY_AUTH_PREFIX, "Bearer ")
        ConfigStore.setString(context, ConfigStore.KEY_ACCEPT_HEADER, "Accept")
        ConfigStore.setString(context, ConfigStore.KEY_ACCEPT_VALUE, "application/json")
        ConfigStore.setString(context, ConfigStore.KEY_CONTENT_TYPE_HEADER, "Content-Type")
        ConfigStore.setString(context, ConfigStore.KEY_CONTENT_TYPE_VALUE, "application/json")
        ConfigStore.setString(context, ConfigStore.KEY_PIN, "1234")
        ConfigStore.setString(context, ConfigStore.KEY_SALT, "SALT")

        val pending = PendingMessageStore.create("+123456789", "hello", 1700000000000L)
        PendingMessageStore.add(context, pending)

        val input = Data.Builder()
            .putString(SmsUploadWorker.KEY_MESSAGE_ID, pending.id)
            .putString(SmsUploadWorker.KEY_FROM, "+123456789")
            .putString(SmsUploadWorker.KEY_BODY, "hello")
            .putLong(SmsUploadWorker.KEY_TIMESTAMP, 1700000000000L)
            .build()

        val worker = TestListenableWorkerBuilder<SmsUploadWorker>(context)
            .setInputData(input)
            .build()

        val result = worker.doWork()
        assertEquals(androidx.work.ListenableWorker.Result.success()::class, result::class)

        val request: RecordedRequest = server.takeRequest()
        assertEquals("/ws", request.path)
        assertEquals(1, smsReceived.size)
        val payload = smsReceived[0].getJSONObject("payload")
        assertEquals("+123456789", payload.getString("number"))
        assertEquals("hello", payload.getString("message"))
        assertEquals(1700000000000L, payload.getLong("receivedAtEpochMs"))
        assertTrue(PendingMessageStore.list(context).isEmpty())
        server.shutdown()
    }
}
