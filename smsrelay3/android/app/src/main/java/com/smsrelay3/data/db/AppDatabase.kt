package com.smsrelay3.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.smsrelay3.data.entity.ConfigState
import com.smsrelay3.data.entity.HeartbeatSample
import com.smsrelay3.data.entity.LocalLogEntry
import com.smsrelay3.data.entity.LocalOverrides
import com.smsrelay3.data.entity.OutboundMessage
import com.smsrelay3.data.entity.SimSnapshot
import com.smsrelay3.data.entity.SmsRawStore

@Database(
    entities = [
        OutboundMessage::class,
        SmsRawStore::class,
        HeartbeatSample::class,
        SimSnapshot::class,
        ConfigState::class,
        LocalOverrides::class,
        LocalLogEntry::class
    ],
    version = 2
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun outboundMessageDao(): OutboundMessageDao
    abstract fun smsRawStoreDao(): SmsRawStoreDao
    abstract fun heartbeatDao(): HeartbeatSampleDao
    abstract fun simSnapshotDao(): SimSnapshotDao
    abstract fun configStateDao(): ConfigStateDao
    abstract fun localOverridesDao(): LocalOverridesDao
    abstract fun localLogDao(): LocalLogEntryDao
}
