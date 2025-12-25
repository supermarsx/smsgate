package com.smsrelay3

import android.os.Bundle
import android.text.InputType
import android.graphics.Color
import android.view.View
import androidx.preference.EditTextPreference
import androidx.preference.ListPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.recyclerview.widget.RecyclerView
import com.smsrelay3.util.LocaleManager
import com.smsrelay3.util.ThemeManager

class SettingsFragment : PreferenceFragmentCompat() {
    private val changeListener: () -> Unit = changeListener@{
        if (!isAdded) return@changeListener
        refreshSummaries()
    }

    override fun onCreateView(
        inflater: android.view.LayoutInflater,
        container: android.view.ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = super.onCreateView(inflater, container, savedInstanceState)
        view?.setBackgroundColor(Color.TRANSPARENT)
        view?.findViewById<RecyclerView>(androidx.preference.R.id.recycler_view)?.apply {
            setPadding(8, 0, 8, 0)
            clipToPadding = false
            isNestedScrollingEnabled = false
            layoutParams = layoutParams?.apply {
                height = android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            }
        }
        return view
    }

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        preferenceManager.preferenceDataStore = SecurePreferenceDataStore(requireContext())
        setPreferencesFromResource(R.xml.preferences, rootKey)
        view?.post { refreshSummaries() } ?: refreshSummaries()
    }

    private fun setSummary(key: String, mask: Boolean = false, passwordInput: Boolean = false) {
        val pref = findPreference<Preference>(key) as? EditTextPreference ?: return
        val current = pref.text ?: ConfigStore.getString(
            requireContext(),
            key,
            ConfigStore.defaultString(key)
        )
        pref.text = current
        pref.summary = if (mask && current.isNotEmpty()) maskValue(current) else current
        if (passwordInput) {
            pref.setOnBindEditTextListener { editText ->
                editText.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
        pref.onPreferenceChangeListener = Preference.OnPreferenceChangeListener { preference, newValue ->
            val value = newValue?.toString() ?: ""
            preference.summary = if (mask && value.isNotEmpty()) maskValue(value) else value
            true
        }
    }

    private fun setListSummary(key: String) {
        val pref = findPreference<Preference>(key) as? ListPreference ?: return
        val current = pref.value ?: ConfigStore.getString(
            requireContext(),
            key,
            ConfigStore.defaultString(key)
        )
        pref.value = current
        val index = pref.findIndexOfValue(current)
        pref.summary = if (index >= 0) pref.entries[index] else current
        pref.onPreferenceChangeListener = Preference.OnPreferenceChangeListener { preference, newValue ->
            val value = newValue?.toString() ?: "system"
            val listPref = preference as ListPreference
            val updatedIndex = listPref.findIndexOfValue(value)
            listPref.summary = if (updatedIndex >= 0) listPref.entries[updatedIndex] else value
            if (key == ConfigStore.KEY_APP_LOCALE) {
                LocaleManager.apply(requireContext(), value)
                activity?.recreate()
            }
            if (key == ConfigStore.KEY_APP_THEME) {
                ThemeManager.applyMode(requireContext(), value)
                activity?.recreate()
            }
            if (key == ConfigStore.KEY_APP_ACCENT) {
                ThemeManager.applyTheme(requireActivity(), value)
                activity?.recreate()
            }
            true
        }
    }

    private fun maskValue(value: String): String {
        if (value.length <= 4) return "****"
        return value.take(2) + "****" + value.takeLast(2)
    }

    override fun onResume() {
        super.onResume()
        refreshSummaries()
        ConfigEvents.register(changeListener)
    }

    override fun onPause() {
        ConfigEvents.unregister(changeListener)
        super.onPause()
    }

    fun refreshSummaries() {
        setListSummary(ConfigStore.KEY_APP_LOCALE)
        setListSummary(ConfigStore.KEY_APP_THEME)
        setListSummary(ConfigStore.KEY_APP_ACCENT)
        setSummary(ConfigStore.KEY_SERVER_URL)
        setSummary(ConfigStore.KEY_API_PATH)
        setSummary(ConfigStore.KEY_HTTP_METHOD)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_URL)
        setSummary(ConfigStore.KEY_DISCOVERY_PORT)
        setSummary(ConfigStore.KEY_CLIENT_ID_HEADER)
        setSummary(ConfigStore.KEY_CLIENT_ID_VALUE)
        setSummary(ConfigStore.KEY_AUTH_HEADER)
        setSummary(ConfigStore.KEY_AUTH_PREFIX)
        setSummary(ConfigStore.KEY_ACCEPT_HEADER)
        setSummary(ConfigStore.KEY_ACCEPT_VALUE)
        setSummary(ConfigStore.KEY_CONTENT_TYPE_HEADER)
        setSummary(ConfigStore.KEY_CONTENT_TYPE_VALUE)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_AUTH_HEADER)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_AUTH_VALUE)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_SIGNATURE_HEADER)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_SIGNATURE_SECRET, mask = true, passwordInput = true)
        setSummary(ConfigStore.KEY_PIN, mask = true, passwordInput = true)
        setSummary(ConfigStore.KEY_SALT, mask = true, passwordInput = true)
    }
}
