package com.smsrelay2

import android.content.Context
import io.socket.client.IO
import io.socket.client.Socket
import java.net.URISyntaxException

object SocketPresenceManager {
    private var socket: Socket? = null

    fun connect(context: Context) {
        if (socket?.connected() == true) return
        val config = ConfigStore.getConfig(context)
        val token = HashUtil.sha512(config.pin + config.salt)
        ConfigStore.setString(context, ConfigStore.KEY_TOKEN, token)
        val opts = buildOptions(config, token)
        try {
            socket = IO.socket(config.serverUrl, opts)
            socket?.connect()
        } catch (_: URISyntaxException) {
            socket = null
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }

    fun buildOptions(config: AppConfig, tokenOverride: String? = null): IO.Options {
        val token = tokenOverride ?: HashUtil.sha512(config.pin + config.salt)
        val headers = mapOf(
            config.clientIdHeader to listOf(config.clientIdValue),
            config.authHeader to listOf(config.authPrefix + token)
        )
        val opts = IO.Options()
        opts.extraHeaders = headers
        return opts
    }
}
