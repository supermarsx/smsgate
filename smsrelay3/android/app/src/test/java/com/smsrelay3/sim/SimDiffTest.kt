package com.smsrelay3.sim

import com.smsrelay3.data.entity.SimSnapshot
import org.junit.Assert.assertEquals
import org.junit.Test

class SimDiffTest {
    @Test
    fun `diff detects added and removed sims by iccid`() {
        val old = listOf(
            snapshot("a", slot = 0),
            snapshot("b", slot = 1)
        )
        val newer = listOf(
            snapshot("b", slot = 0), // moved slot
            snapshot("c", slot = 1)  // new
        )
        val diff = SimInventoryRepository.diff(old, newer)
        assertEquals(listOf("c"), diff.added.map { it.iccid })
        assertEquals(listOf("a"), diff.removed.map { it.iccid })
        assertEquals(listOf("b"), diff.moved.map { it.iccid })
    }

    private fun snapshot(iccid: String, slot: Int) = SimSnapshot(
        id = "id-$iccid",
        capturedAtMs = 0L,
        slotIndex = slot,
        subscriptionId = slot,
        iccid = iccid,
        msisdn = "msisdn-$iccid",
        carrierName = "carrier-$iccid",
        status = "active"
    )
}
