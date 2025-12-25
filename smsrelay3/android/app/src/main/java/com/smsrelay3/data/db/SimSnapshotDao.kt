package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.SimSnapshot

@Dao
interface SimSnapshotDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<SimSnapshot>)

    @Query("SELECT * FROM sim_snapshots ORDER BY capturedAtMs DESC")
    suspend fun loadAll(): List<SimSnapshot>

    @Query("DELETE FROM sim_snapshots WHERE capturedAtMs < :olderThanMs")
    suspend fun prune(olderThanMs: Long): Int
}
