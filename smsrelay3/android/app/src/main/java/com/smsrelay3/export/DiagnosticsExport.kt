package com.smsrelay3.export

import android.content.Context
import android.net.Uri
import com.smsrelay3.ConfigStore
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.presence.BatteryUtil
import com.smsrelay3.presence.NetworkUtil
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.security.MessageDigest
import java.util.Locale

object DiagnosticsExport {
    fun buildDiagnosticsJson(context: Context): String {
        val db = DatabaseProvider.get(context)
        val deviceId = DeviceAuthStore.getDeviceId(context)
        val config = ConfigStore.getConfig(context)
        val heartbeat = runBlocking { db.heartbeatDao().latest() }
        val queueDepth = runBlocking { db.outboundMessageDao().countByStatus(OutboundMessageStatus.QUEUED) }
        val simSnapshots = runBlocking { db.simSnapshotDao().loadAll() }

        val json = JSONObject()
        json.put("device_id_hash", deviceId.safeHash())
        json.put("server_host", config.serverUrl.safeHost())
        json.put("queue_depth", queueDepth)
        json.put("network_type", NetworkUtil.networkType(context))
        json.put("battery_percent", BatteryUtil.batteryPercent(context))
        json.put("heartbeat", JSONObject().apply {
            put("last_rtt_ms", heartbeat?.lastRttMs)
            put("last_at_ms", heartbeat?.createdAtMs)
        })
        val sims = JSONArray()
        simSnapshots.forEach { sim ->
            sims.put(JSONObject().apply {
                put("slot_index", sim.slotIndex)
                put("subscription_id", sim.subscriptionId?.toString()?.safeHash())
                put("iccid_hash", sim.iccid.safeHash())
                put("msisdn_hash", sim.msisdn.safeHash())
                put("carrier_name", sim.carrierName)
                put("status", sim.status)
            })
        }
        json.put("sims", sims)
        return json.toString(2)
    }

    fun writeToUri(context: Context, uri: Uri, content: String): Boolean {
        return try {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                OutputStreamWriter(stream).use { writer ->
                    writer.write(content)
                }
            } ?: return false
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun String?.safeHash(): String? {
        if (this.isNullOrBlank()) return null
        return try {
            val digest = MessageDigest.getInstance("SHA-256").digest(this.toByteArray())
            digest.joinToString("") { String.format(Locale.US, "%02x", it) }
        } catch (_: Exception) {
            "***"
        }
    }

    private fun String.safeHost(): String? {
        return try {
            val uri = android.net.Uri.parse(this)
            uri.host
        } catch (_: Exception) {
            null
        }
    }
}
