package com.smsrelay3

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter

class MainPagerAdapter(activity: FragmentActivity) : FragmentStateAdapter(activity) {
    override fun getItemCount(): Int = 5

    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> StatusFragment()
            1 -> DiagnosticsFragment()
            2 -> LogsFragment()
            3 -> PairingFragment()
            else -> SettingsContainerFragment()
        }
    }
}
