package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.LocalLogEntry

@Dao
interface LocalLogEntryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entry: LocalLogEntry)

    @Query("SELECT * FROM local_log_entries ORDER BY tsMs DESC LIMIT :limit")
    suspend fun loadRecent(limit: Int): List<LocalLogEntry>

    @Query("SELECT * FROM local_log_entries WHERE level = :level ORDER BY tsMs DESC LIMIT :limit")
    suspend fun loadRecentByLevel(level: String, limit: Int): List<LocalLogEntry>

    @Query("DELETE FROM local_log_entries WHERE tsMs < :olderThanMs")
    suspend fun prune(olderThanMs: Long): Int
}
