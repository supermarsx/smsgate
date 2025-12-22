package com.smsrelay2

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import android.os.Build
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SmsUploadWorker(appContext: Context, workerParams: WorkerParameters) :
    Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val config = ConfigStore.getConfig(applicationContext)
        val from = inputData.getString(KEY_FROM) ?: return Result.failure()
        val body = inputData.getString(KEY_BODY) ?: return Result.failure()
        val timestamp = inputData.getLong(KEY_TIMESTAMP, System.currentTimeMillis())

        val date = formatDate(timestamp)
        val token = HashUtil.sha512(config.pin + config.salt)
        ConfigStore.setString(applicationContext, ConfigStore.KEY_TOKEN, token)
        val json = JSONObject()
        json.put("number", from)
        json.put("date", date)
        json.put("message", body)
        json.put("receivedAtEpochMs", timestamp)
        json.put("deviceManufacturer", Build.MANUFACTURER)
        json.put("deviceModel", Build.MODEL)
        json.put("deviceSdkInt", Build.VERSION.SDK_INT)

        val mediaType = config.contentTypeValue.toMediaType()
        val requestBody = json.toString().toRequestBody(mediaType)
        val request = Request.Builder()
            .url(config.serverUrl + config.apiPath)
            .method(config.httpMethod, requestBody)
            .addHeader(config.acceptHeader, config.acceptValue)
            .addHeader(config.contentTypeHeader, config.contentTypeValue)
            .addHeader(config.clientIdHeader, config.clientIdValue)
            .addHeader(config.authHeader, config.authPrefix + token)
            .addHeader("X-Device-Manufacturer", Build.MANUFACTURER)
            .addHeader("X-Device-Model", Build.MODEL)
            .addHeader("X-Device-Sdk", Build.VERSION.SDK_INT.toString())
            .build()

        return try {
            HttpClient.instance.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success() else Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun formatDate(timestamp: Long): String {
        val formatter = SimpleDateFormat("HH:mm:ss dd/MM/yyyy", Locale.US)
        return formatter.format(Date(timestamp))
    }

    companion object {
        const val KEY_FROM = "from"
        const val KEY_BODY = "body"
        const val KEY_TIMESTAMP = "timestamp"
    }
}
