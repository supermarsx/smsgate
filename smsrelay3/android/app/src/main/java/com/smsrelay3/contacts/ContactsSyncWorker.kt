package com.smsrelay3.contacts

import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.LogStore
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.DeviceAuthStore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class ContactsSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val policy = ConfigRepository(applicationContext).latestPolicy()
        if (!policy.contactsSyncEnabled) {
            ContactsSyncScheduler.scheduleNext(applicationContext, policy.contactsSyncIntervalS)
            return Result.success()
        }
        if (!hasPermission()) {
            ContactsSyncScheduler.scheduleNext(applicationContext, policy.contactsSyncIntervalS)
            return Result.success()
        }
        val baseUrl = ConfigStore.getConfig(applicationContext).serverUrl.trim().trimEnd('/')
        val deviceToken = DeviceAuthStore.getDeviceToken(applicationContext)
        val deviceId = DeviceAuthStore.getDeviceId(applicationContext)
        if (baseUrl.isBlank() || deviceToken.isNullOrBlank() || deviceId.isNullOrBlank()) {
            LogStore.append("error", "contacts", "Contacts: missing credentials or server URL")
            ContactsSyncScheduler.scheduleNext(applicationContext, policy.contactsSyncIntervalS)
            return Result.retry()
        }

        val contacts = readContacts(applicationContext)
        val hash = hashContacts(contacts)
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastHash = prefs.getString(KEY_LAST_HASH, null)
        if (hash == lastHash) {
            ContactsSyncScheduler.scheduleNext(applicationContext, policy.contactsSyncIntervalS)
            return Result.success()
        }

        val payload = JSONObject()
        payload.put("device_id", deviceId)
        val arr = JSONArray()
        contacts.forEach { entry ->
            val obj = JSONObject()
            obj.put("number", entry.number)
            obj.put("name", entry.name)
            arr.put(obj)
        }
        payload.put("contacts", arr)
        val body = payload.toString().toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/device/contacts")
            .addHeader("Authorization", "Bearer $deviceToken")
            .post(body)
            .build()

        val success = try {
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
        if (success) {
            prefs.edit().putString(KEY_LAST_HASH, hash).apply()
            LogStore.append("info", "contacts", "Contacts: sync applied")
        } else {
            LogStore.append("error", "contacts", "Contacts: sync failed")
        }
        ContactsSyncScheduler.scheduleNext(applicationContext, policy.contactsSyncIntervalS)
        return if (success) Result.success() else Result.retry()
    }

    private fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            applicationContext,
            android.Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun readContacts(context: Context): List<ContactEntry> {
        val resolver = context.contentResolver
        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
        )
        val results = mutableListOf<ContactEntry>()
        val cursor = resolver.query(uri, projection, null, null, null) ?: return results
        cursor.use {
            val numIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            while (it.moveToNext()) {
                val number = it.getString(numIndex)?.trim().orEmpty()
                val name = it.getString(nameIndex)?.trim().orEmpty()
                if (number.isNotBlank()) {
                    results.add(ContactEntry(number, name))
                }
            }
        }
        return results
    }

    private fun hashContacts(contacts: List<ContactEntry>): String {
        val raw = contacts.sortedBy { it.number }.joinToString("|") { "${it.number}:${it.name}" }
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(raw.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder()
        for (b in bytes) sb.append(String.format("%02x", b))
        return sb.toString()
    }

    data class ContactEntry(val number: String, val name: String)

    companion object {
        private const val PREFS_NAME = "smsrelay3_contacts_sync"
        private const val KEY_LAST_HASH = "last_hash"
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
