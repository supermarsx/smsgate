package com.smsrelay3.retention

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.LogStore
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider

class PruneWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val policy = ConfigRepository(applicationContext).latestPolicy()
        val db = DatabaseProvider.get(applicationContext)
        val now = System.currentTimeMillis()

        val ackedCutoff = now - policy.retentionAckedHours * 60L * 60L * 1000L
        val heartbeatCutoff = now - policy.retentionHeartbeatHours * 60L * 60L * 1000L
        val simCutoff = now - policy.retentionSimDays * 24L * 60L * 60L * 1000L
        val logCutoff = now - policy.retentionLogDays * 24L * 60L * 60L * 1000L
        val smsRawCutoff = now - policy.retentionSmsRawHours * 60L * 60L * 1000L

        db.outboundMessageDao().deleteByStatusOlderThan(OutboundMessageStatus.ACKED, ackedCutoff)
        db.heartbeatDao().prune(heartbeatCutoff)
        db.simSnapshotDao().prune(simCutoff)
        db.localLogDao().prune(logCutoff)
        db.smsRawStoreDao().prune(smsRawCutoff)

        LogStore.append("info", "retention", "Prune: completed")
        PruneScheduler.scheduleNext(applicationContext, 6L)
        return Result.success()
    }
}
