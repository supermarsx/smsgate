package com.smsrelay3.reconcile

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.HashUtil
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.OutboundMessageRepository
import com.smsrelay3.data.db.DatabaseProvider

class ReconcileWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val policy = ConfigRepository(applicationContext).latestPolicy()
        if (!policy.reconcileEnabled) {
            ReconcileScheduler.scheduleNext(applicationContext, policy.reconcileIntervalMinutes.toLong())
            return Result.success()
        }
        if (!hasReadSmsPermission()) {
            ReconcileScheduler.scheduleNext(applicationContext, policy.reconcileIntervalMinutes.toLong())
            return Result.success()
        }

        val sinceMs = System.currentTimeMillis() - policy.reconcileWindowMinutes * 60_000L
        val providerMessages = SmsProviderReader.readRecent(
            applicationContext,
            sinceMs,
            policy.reconcileMaxScanCount
        )
        if (providerMessages.isEmpty()) {
            ReconcileScheduler.scheduleNext(applicationContext, policy.reconcileIntervalMinutes.toLong())
            return Result.success()
        }

        val dao = DatabaseProvider.get(applicationContext).outboundMessageDao()
        val repo = OutboundMessageRepository(applicationContext)
        for (sms in providerMessages) {
            val bucket = sms.receivedAtMs / 60_000L
            val fingerprint = HashUtil.sha256(
                "${sms.sender}|${sms.body}|$bucket|${sms.subscriptionId ?: -1}"
            )
            val count = dao.countByHashBetween(fingerprint, sinceMs, System.currentTimeMillis())
            if (count > 0) continue
            repo.enqueueSms(
                sender = sms.sender,
                content = sms.body,
                receivedAtMs = sms.receivedAtMs,
                simSlotIndex = null,
                subscriptionId = sms.subscriptionId,
                iccid = null,
                msisdn = null,
                source = "reconcile"
            )
        }

        com.smsrelay3.runtime.AppRuntime.markReconcile(System.currentTimeMillis())
        ReconcileScheduler.scheduleNext(applicationContext, policy.reconcileIntervalMinutes.toLong())
        return Result.success()
    }

    private fun hasReadSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            applicationContext,
            android.Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }
}
