package com.smsrelay2

import android.content.Context
import android.net.wifi.WifiManager
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit

data class DiscoveryResult(
    val name: String,
    val url: String
)

object LocalServerDiscovery {
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(400, TimeUnit.MILLISECONDS)
        .readTimeout(600, TimeUnit.MILLISECONDS)
        .build()

    fun scan(context: Context, port: Int): List<DiscoveryResult> {
        val ip = getLocalIpv4(context) ?: return emptyList()
        val prefix = ip.substringBeforeLast(".")
        val results = mutableListOf<DiscoveryResult>()
        for (host in 1..254) {
            val candidate = "$prefix.$host"
            val url = "http://$candidate:$port/api/discovery"
            val name = probe(url) ?: continue
            results.add(DiscoveryResult(name, "http://$candidate:$port"))
        }
        return results
    }

    private fun probe(url: String): String? {
        val request = Request.Builder().url(url).get().build()
        return try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val json = JSONObject(body)
                json.optString("codename").ifBlank { null }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getLocalIpv4(context: Context): String? {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val wifiIp = wifi?.connectionInfo?.ipAddress ?: 0
        if (wifiIp != 0) {
            return intToIpv4(wifiIp)
        }
        return try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            interfaces.toList().flatMap { it.inetAddresses.toList() }
                .firstOrNull { !it.isLoopbackAddress && it is Inet4Address }
                ?.hostAddress
        } catch (_: Exception) {
            null
        }
    }

    private fun intToIpv4(ip: Int): String {
        return listOf(
            ip and 0xff,
            ip shr 8 and 0xff,
            ip shr 16 and 0xff,
            ip shr 24 and 0xff
        ).joinToString(".")
    }
}
