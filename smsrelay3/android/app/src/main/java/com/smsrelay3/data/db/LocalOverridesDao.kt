package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.LocalOverrides

@Dao
interface LocalOverridesDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(overrides: LocalOverrides)

    @Query("SELECT * FROM local_overrides LIMIT 1")
    suspend fun latest(): LocalOverrides?
}
