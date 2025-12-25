package com.smsrelay3.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.smsrelay3.data.entity.ConfigState

@Dao
interface ConfigStateDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(state: ConfigState)

    @Query("SELECT * FROM config_state ORDER BY version DESC LIMIT 1")
    suspend fun latest(): ConfigState?
}
