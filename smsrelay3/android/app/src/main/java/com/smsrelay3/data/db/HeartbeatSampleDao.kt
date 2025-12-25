package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.HeartbeatSample

@Dao
interface HeartbeatSampleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(sample: HeartbeatSample)

    @Query("SELECT * FROM heartbeat_samples ORDER BY createdAtMs DESC LIMIT 1")
    suspend fun latest(): HeartbeatSample?

    @Query("DELETE FROM heartbeat_samples WHERE createdAtMs < :olderThanMs")
    suspend fun prune(olderThanMs: Long): Int
}
