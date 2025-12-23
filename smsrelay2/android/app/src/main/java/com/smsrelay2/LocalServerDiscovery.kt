package com.smsrelay2

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.atomic.AtomicInteger
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
        if (!hasLocalNetwork(context)) {
            LogStore.append("Discovery: no local network (wifi/ethernet/vpn) available")
            return emptyList()
        }
        val ip = getLocalIpv4(context) ?: return emptyList()
        val prefix = ip.substringBeforeLast(".")
        val results = Collections.synchronizedList(mutableListOf<DiscoveryResult>())
        val total = 254
        val completed = AtomicInteger(0)
        val pool = Executors.newFixedThreadPool(32)
        val scheduler = Executors.newSingleThreadScheduledExecutor()

        scheduleProgressLogs(scheduler, completed, total, port)

        val tasks = (1..254).map { host ->
            Runnable {
                val candidate = "$prefix.$host"
                val url = "http://$candidate:$port/api/discovery"
                val name = probe(url)
                if (!name.isNullOrBlank()) {
                    results.add(DiscoveryResult(name, "http://$candidate:$port"))
                }
                completed.incrementAndGet()
            }
        }

        tasks.forEach { pool.execute(it) }
        pool.shutdown()
        pool.awaitTermination(2, TimeUnit.MINUTES)
        scheduler.shutdownNow()

        return results.toList()
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

    private fun hasLocalNetwork(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val network = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }

    private fun scheduleProgressLogs(
        scheduler: ScheduledExecutorService,
        completed: AtomicInteger,
        total: Int,
        port: Int
    ) {
        scheduler.scheduleAtFixedRate({
            val done = completed.get()
            LogStore.append("Discovery: scanned $done/$total hosts on port $port")
        }, 15, 15, TimeUnit.SECONDS)
    }
}
