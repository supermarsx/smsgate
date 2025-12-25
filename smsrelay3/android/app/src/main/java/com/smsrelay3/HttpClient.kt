package com.smsrelay3

import android.content.Context
import com.smsrelay3.config.ConfigRepository
import kotlinx.coroutines.runBlocking
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.net.URI

object HttpClient {
    @Volatile
    private var cachedPins: List<String> = emptyList()
    @Volatile
    private var client: OkHttpClient = OkHttpClient()

    fun get(context: Context): OkHttpClient {
        val policy = runBlocking { ConfigRepository(context).latestPolicy() }
        val pins = if (policy.tlsPinningEnabled) policy.tlsPins else emptyList()
        if (pins == cachedPins) {
            return client
        }
        val builder = OkHttpClient.Builder()
        val host = serverHost(context)
        if (host != null && pins.isNotEmpty()) {
            val pinnerBuilder = CertificatePinner.Builder()
            pins.forEach { pin ->
                pinnerBuilder.add(host, pin)
            }
            builder.certificatePinner(pinnerBuilder.build())
        }
        client = builder.build()
        cachedPins = pins
        return client
    }

    private fun serverHost(context: Context): String? {
        val url = ConfigStore.getConfig(context).serverUrl
        return try {
            val host = URI(url).host
            host?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
}
