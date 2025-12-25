package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.SmsRawStore

@Dao
interface SmsRawStoreDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(store: SmsRawStore)

    @Query("DELETE FROM sms_raw_store WHERE capturedAtMs < :olderThanMs")
    suspend fun prune(olderThanMs: Long): Int
}
