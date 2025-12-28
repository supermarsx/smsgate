package com.smsrelay3.config

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.smsrelay3.ConfigEvents
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.LogStore
import com.smsrelay3.ServiceModeController
import com.smsrelay3.config.ConfigRuntime
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.runtime.AppRuntime
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.ConfigState
import com.smsrelay3.SocketPresenceManager
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import kotlin.math.pow
import kotlinx.coroutines.runBlocking

object ConfigWebSocketManager {
    private var socket: WebSocket? = null
    private val handler = Handler(Looper.getMainLooper())
    @Volatile
    private var reconnectAttempts: Int = 0

    fun connect(context: Context) {
        if (socket != null) return
        val serverUrl = ConfigStore.getConfig(context).serverUrl.trim()
        if (serverUrl.isBlank()) {
            LogStore.append("error", "config", "Config WS: missing server URL")
            return
        }
        val deviceToken = DeviceAuthStore.getDeviceToken(context)
        if (deviceToken.isNullOrBlank()) {
            LogStore.append("error", "config", "Config WS: missing device token")
            return
        }
        val wsUrl = SocketPresenceManager.buildWebSocketUrl(serverUrl)
        val request = okhttp3.Request.Builder().url(wsUrl).build()
        socket = HttpClient.get(context).newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    val payload = JSONObject()
                    payload.put("type", "DEVICE_SUBSCRIBE_CONFIG")
                    payload.put("device_token", deviceToken)
                    webSocket.send(payload.toString())
                    LogStore.append("info", "config", "Config WS: subscribed")
                    AppRuntime.setWsState("connected")
                    reconnectAttempts = 0
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(context, text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    LogStore.append("error", "config", "Config WS: failed (${t.javaClass.simpleName})")
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
    }

    fun disconnect() {
        socket?.close(1000, "client disconnect")
        socket = null
        handler.removeCallbacksAndMessages(null)
        reconnectAttempts = 0
        AppRuntime.setWsState("disconnected")
    }

    private fun handleMessage(context: Context, text: String) {
        try {
            val json = JSONObject(text)
            val type = json.optString("type")
            if (type != "CONFIG_UPDATE") return
            val configObj = json.optJSONObject("config")
                ?: json.optJSONObject("policy")
                ?: json.optJSONObject("config_snapshot")
            val configString = configObj?.toString().orEmpty()
            if (configString.isBlank()) return
            val version = json.optLong("version", System.currentTimeMillis())
            val state = ConfigState(
                version = version,
                etag = null,
                lastAppliedAtMs = System.currentTimeMillis(),
                rawJson = configString
            )
            kotlinx.coroutines.runBlocking {
                DatabaseProvider.get(context).configStateDao().upsert(state)
                ConfigRuntime.apply(context)
            }
            LogStore.append("info", "config", "Config WS: applied v$version")
            ConfigEvents.notifyChanged()
            ServiceModeController.apply(context)
        } catch (_: Exception) {
            LogStore.append("error", "config", "Config WS: invalid payload")
        }
    }

    private fun scheduleReconnect(context: Context) {
        val policy = runBlocking { ConfigRepository(context).latestPolicy() }
        val base = policy.wsReconnectBaseMs.coerceAtLeast(500L)
        val max = policy.wsReconnectMaxMs.coerceAtLeast(base)
        val delay = (base * 2.0.pow(reconnectAttempts.toDouble())).toLong().coerceAtMost(max)
        reconnectAttempts += 1
        handler.postDelayed({ connect(context) }, delay)
    }
}
