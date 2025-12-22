package com.smsrelay2

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SocketPresenceManagerTest {
    @Test
    fun buildAuthMessage_containsTokenAndClientId() {
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

        val message = SocketPresenceManager.buildAuthMessage(config, "token123")
        assertTrue(message.contains("\"token\":\"token123\""))
        assertTrue(message.contains("\"clientId\":\"DEVICE01\""))
    }

    @Test
    fun buildWebSocketUrl_convertsProtocol() {
        assertEquals("wss://example.com/ws", SocketPresenceManager.buildWebSocketUrl("https://example.com"))
        assertEquals("ws://example.com/ws", SocketPresenceManager.buildWebSocketUrl("http://example.com"))
    }
}
