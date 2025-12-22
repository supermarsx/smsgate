package com.smsrelay2

import android.content.Context
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

object SocketPresenceManager {
    private var socket: WebSocket? = null

    fun connect(context: Context) {
        if (socket != null) return
        val config = ConfigStore.getConfig(context)
        val token = HashUtil.sha512(config.pin + config.salt)
        ConfigStore.setString(context, ConfigStore.KEY_TOKEN, token)
        val wsUrl = buildWebSocketUrl(config.serverUrl)
        val request = Request.Builder().url(wsUrl).build()
        socket = HttpClient.instance.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    webSocket.send(buildAuthMessage(config, token))
                }
            }
        )
    }

    fun disconnect() {
        socket?.close(1000, "client disconnect")
        socket = null
    }

    fun buildAuthMessage(config: AppConfig, tokenOverride: String? = null): String {
        val token = tokenOverride ?: HashUtil.sha512(config.pin + config.salt)
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
}
