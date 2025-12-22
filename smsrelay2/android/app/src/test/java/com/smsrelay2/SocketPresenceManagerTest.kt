package com.smsrelay2

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SocketPresenceManagerTest {
    @Test
    fun buildOptions_setsAuthHeaders() {
        val config = AppConfig(
            serverUrl = "https://example.com",
            apiPath = "/api/push/message",
            httpMethod = "POST",
            remoteConfigUrl = "",
            clientIdHeader = "x-clientid",
            clientIdValue = "DEVICE01",
            authHeader = "Authorization",
            authPrefix = "Bearer ",
            acceptHeader = "Accept",
            acceptValue = "application/json",
            contentTypeHeader = "Content-Type",
            contentTypeValue = "application/json",
            pin = "1234",
            salt = "SALT",
            enableListener = true,
            enableForegroundService = true,
            enableBootReceiver = true,
            enableSocketPresence = true,
            notificationEnabled = true
        )

        val opts = SocketPresenceManager.buildOptions(config, "token123")
        val headers = opts.extraHeaders ?: emptyMap()
        assertEquals(listOf("DEVICE01"), headers["x-clientid"])
        assertEquals(listOf("Bearer token123"), headers["Authorization"])
        assertTrue(headers.containsKey("x-clientid"))
        assertTrue(headers.containsKey("Authorization"))
    }
}
