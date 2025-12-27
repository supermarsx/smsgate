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

    data class SimDiff(
        val added: List<SimSnapshot>,
        val removed: List<SimSnapshot>,
        val moved: List<SimSnapshot>
    )

    companion object {
        fun diff(old: List<SimSnapshot>, new: List<SimSnapshot>): SimDiff {
            val oldByIccid = old.associateBy { it.iccid }
            val newByIccid = new.associateBy { it.iccid }

            val added = new.filter { it.iccid != null && it.iccid !in oldByIccid.keys }
            val removed = old.filter { it.iccid != null && it.iccid !in newByIccid.keys }
            val moved = new.filter { snap ->
                val iccid = snap.iccid ?: return@filter false
                val prev = oldByIccid[iccid] ?: return@filter false
                prev.slotIndex != snap.slotIndex || prev.subscriptionId != snap.subscriptionId
            }
            return SimDiff(added, removed, moved)
        }
    }
}
