package com.smsrelay3.data

import android.content.Context
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.LocalOverrides
import java.util.UUID

class LocalOverridesRepository(private val context: Context) {
    private val db = DatabaseProvider.get(context)

    suspend fun setOverrides(rawJson: String) {
        val entry = LocalOverrides(
            id = UUID.randomUUID().toString(),
            updatedAtMs = System.currentTimeMillis(),
            rawJson = rawJson
        )
        db.localOverridesDao().upsert(entry)
    }

    suspend fun getOverrides(): String? {
        return db.localOverridesDao().latest()?.rawJson
    }
}
