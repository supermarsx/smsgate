package com.smsrelay3.data

import android.content.Context
import com.smsrelay3.HashUtil
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.SimSnapshot

class SimInventoryRepository(private val context: Context) {
    private val db = DatabaseProvider.get(context)

    suspend fun saveSnapshots(items: List<SimSnapshot>) {
        if (items.isEmpty()) return
        db.simSnapshotDao().insertAll(items)
    }

    suspend fun computeSummaryHash(): String {
        val items = db.simSnapshotDao().loadAll()
        if (items.isEmpty()) return ""
        val raw = items.sortedBy { it.slotIndex }
            .joinToString("|") { item ->
                listOf(
                    item.slotIndex,
                    item.subscriptionId ?: -1,
                    item.iccid ?: "",
                    item.msisdn ?: "",
                    item.carrierName ?: "",
                    item.status
                ).joinToString(",")
            }
        return HashUtil.sha256(raw)
    }
}
