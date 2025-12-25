package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class ConfigsFragment : Fragment() {
    private val changeListener: () -> Unit = changeListener@{
        val fragment = childFragmentManager.findFragmentById(R.id.settings_container)
        if (fragment is SettingsFragment) {
            fragment.refreshSummaries()
        }
    }
    private var refreshLayout: SwipeRefreshLayout? = null
    private var loaded = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_configs, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        refreshLayout = view.findViewById<SwipeRefreshLayout>(R.id.configs_refresh)
        refreshLayout?.setOnRefreshListener {
            changeListener()
            refreshLayout?.isRefreshing = false
        }
        if (!loaded && childFragmentManager.findFragmentById(R.id.settings_container) == null) {
            loaded = true
            refreshLayout?.isRefreshing = true
            view.post {
                childFragmentManager.beginTransaction()
                    .replace(R.id.settings_container, SettingsFragment())
                    .commit()
                refreshLayout?.isRefreshing = false
            }
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

    override fun onDestroyView() {
        refreshLayout = null
        super.onDestroyView()
    }
}
