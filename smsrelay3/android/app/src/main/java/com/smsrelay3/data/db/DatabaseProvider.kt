package com.smsrelay3.data.db

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object DatabaseProvider {
    @Volatile
    private var instance: AppDatabase? = null

    fun get(context: Context): AppDatabase {
        return instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "smsrelay3.db"
            ).addMigrations(MIGRATION_1_2).build().also { instance = it }
        }
    }

    private val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_messages(status)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_outbound_hash_time ON outbound_messages(contentHash, smsReceivedAtMs)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_level ON local_log_entries(level)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_ts ON local_log_entries(tsMs)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_heartbeat_ts ON heartbeat_samples(createdAtMs)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_sim_ts ON sim_snapshots(capturedAtMs)")
        }
    }
}
