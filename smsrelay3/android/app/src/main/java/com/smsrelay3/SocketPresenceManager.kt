package com.smsrelay3

import android.content.Context
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.runtime.AppRuntime
import com.smsrelay3.config.ConfigRepository
import kotlinx.coroutines.runBlocking
import android.os.Handler
import android.os.Looper
import kotlin.math.pow

object SocketPresenceManager {
    private var socket: WebSocket? = null
    private val handler = Handler(Looper.getMainLooper())
    @Volatile
    private var reconnectAttempts: Int = 0

    fun connect(context: Context) {
        if (socket != null) return
        val config = ConfigStore.getConfig(context)
        if (config.serverUrl.isBlank()) {
            LogStore.append("error", "presence", "Socket presence: missing server URL")
            return
        }
        val deviceToken = DeviceAuthStore.getDeviceToken(context)
        if (deviceToken.isNullOrBlank()) {
            LogStore.append("error", "presence", "Socket presence: missing device token")
            return
        }
        ConfigStore.setString(context, ConfigStore.KEY_TOKEN, deviceToken)
        val wsUrl = buildWebSocketUrl(config.serverUrl)
        try {
            val request = Request.Builder().url(wsUrl).build()
            socket = HttpClient.get(context).newWebSocket(
                request,
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        webSocket.send(buildAuthMessage(config, deviceToken))
                        AppRuntime.setWsState("connected")
                        reconnectAttempts = 0
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        LogStore.append("error", "presence", "Socket presence: failed (${t.javaClass.simpleName})")
                        socket = null
                        AppRuntime.setWsState("offline")
                        scheduleReconnect(context)
                    }

                    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                        socket = null
                        AppRuntime.setWsState("offline")
                        scheduleReconnect(context)
                    }
                }
            )
        } catch (ex: IllegalArgumentException) {
            LogStore.append("error", "presence", "Socket presence: invalid server URL")
            socket = null
            AppRuntime.setWsState("offline")
        }
    }

    fun disconnect() {
        socket?.close(1000, "client disconnect")
        socket = null
        AppRuntime.setWsState("disconnected")
        handler.removeCallbacksAndMessages(null)
        reconnectAttempts = 0
    }

    fun buildAuthMessage(config: AppConfig, tokenOverride: String? = null): String {
        val token = tokenOverride ?: ""
        return """{"type":"auth","token":"$token","clientId":"${config.clientIdValue}"}"""
    }

    fun buildWebSocketUrl(serverUrl: String): String {
        val normalized = if (serverUrl.endsWith("/")) serverUrl.dropLast(1) else serverUrl
        if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
            return "$normalized/ws"
        }
        val protocol = if (normalized.startsWith("https://")) "wss://" else "ws://"
        val host = normalized.removePrefix("https://").removePrefix("http://")
        return "$protocol$host/ws"
    }

    private fun scheduleReconnect(context: Context) {
        if (!ConfigStore.getConfig(context).enableSocketPresence) return
        val policy = runBlocking { ConfigRepository(context).latestPolicy() }
        val base = policy.wsReconnectBaseMs.coerceAtLeast(500L)
        val max = policy.wsReconnectMaxMs.coerceAtLeast(base)
        val delay = (base * 2.0.pow(reconnectAttempts.toDouble())).toLong().coerceAtMost(max)
        reconnectAttempts += 1
        handler.postDelayed({ connect(context) }, delay)
    }
}
