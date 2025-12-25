package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.smsrelay3.data.entity.OutboundMessage

@Dao
interface OutboundMessageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: OutboundMessage)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<OutboundMessage>)

    @Update
    suspend fun update(message: OutboundMessage)

    @Query("SELECT * FROM outbound_messages WHERE status = :status ORDER BY createdAtMs ASC LIMIT :limit")
    suspend fun loadByStatus(status: String, limit: Int): List<OutboundMessage>

    @Query("SELECT COUNT(*) FROM outbound_messages WHERE status = :status")
    suspend fun countByStatus(status: String): Int

    @Query("SELECT COUNT(*) FROM outbound_messages WHERE contentHash = :hash AND smsReceivedAtMs BETWEEN :fromMs AND :toMs")
    suspend fun countByHashBetween(hash: String, fromMs: Long, toMs: Long): Int

    @Query("DELETE FROM outbound_messages WHERE status = :status AND createdAtMs < :olderThanMs")
    suspend fun deleteByStatusOlderThan(status: String, olderThanMs: Long): Int

    @Query("SELECT MAX(lastAttemptAtMs) FROM outbound_messages WHERE status = :status")
    suspend fun latestAttemptForStatus(status: String): Long?
}
