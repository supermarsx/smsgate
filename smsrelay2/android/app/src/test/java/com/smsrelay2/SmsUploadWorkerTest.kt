package com.smsrelay2

import androidx.test.core.app.ApplicationProvider
import androidx.work.Data
import androidx.work.testing.TestListenableWorkerBuilder
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
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
        server.enqueue(MockResponse().setResponseCode(200))
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

        val input = Data.Builder()
            .putString(SmsUploadWorker.KEY_FROM, "+123456789")
            .putString(SmsUploadWorker.KEY_BODY, "hello")
            .putLong(SmsUploadWorker.KEY_TIMESTAMP, 1700000000000L)
            .build()

        val worker = TestListenableWorkerBuilder<SmsUploadWorker>(context)
            .setInputData(input)
            .build()

        val result = worker.doWork()
        assertEquals(androidx.work.ListenableWorker.Result.success()::class, result::class)

        val request = server.takeRequest()
        assertEquals("/api/push/message", request.path)
        assertEquals("DEVICE01", request.getHeader("x-clientid"))
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"number\":\"+123456789\""))
        assertTrue(body.contains("\"message\":\"hello\""))
        assertTrue(body.contains("\"receivedAtEpochMs\":1700000000000"))
        server.shutdown()
    }
}
