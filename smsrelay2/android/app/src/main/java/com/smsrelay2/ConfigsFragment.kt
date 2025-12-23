package com.smsrelay2

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment

class ConfigsFragment : Fragment() {
    private val changeListener: () -> Unit = changeListener@{
        val fragment = childFragmentManager.findFragmentById(R.id.settings_container)
        if (fragment is SettingsFragment) {
            fragment.refreshSummaries()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_configs, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (childFragmentManager.findFragmentById(R.id.settings_container) == null) {
            childFragmentManager.beginTransaction()
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }
    }

    override fun onStart() {
        super.onStart()
        ConfigEvents.register(changeListener)
    }

    override fun onStop() {
        ConfigEvents.unregister(changeListener)
        super.onStop()
    }
}
