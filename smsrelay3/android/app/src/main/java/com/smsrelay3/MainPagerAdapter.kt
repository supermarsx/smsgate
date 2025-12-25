package com.smsrelay3

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter

class MainPagerAdapter(activity: FragmentActivity) : FragmentStateAdapter(activity) {
    override fun getItemCount(): Int = 4

    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> StatusFragment()
            1 -> LogsFragment()
            2 -> ControlsFragment()
            else -> ConfigsFragment()
        }
    }
}
