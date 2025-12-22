package com.smsrelay2

import android.os.Bundle
import android.text.InputType
import androidx.preference.EditTextPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat

class SettingsFragment : PreferenceFragmentCompat() {
    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        preferenceManager.preferenceDataStore = SecurePreferenceDataStore(requireContext())
        setPreferencesFromResource(R.xml.preferences, rootKey)
        setSummary(ConfigStore.KEY_SERVER_URL)
        setSummary(ConfigStore.KEY_API_PATH)
        setSummary(ConfigStore.KEY_HTTP_METHOD)
        setSummary(ConfigStore.KEY_REMOTE_CONFIG_URL)
        setSummary(ConfigStore.KEY_CLIENT_ID_HEADER)
        setSummary(ConfigStore.KEY_CLIENT_ID_VALUE)
        setSummary(ConfigStore.KEY_AUTH_HEADER)
        setSummary(ConfigStore.KEY_AUTH_PREFIX)
        setSummary(ConfigStore.KEY_ACCEPT_HEADER)
        setSummary(ConfigStore.KEY_ACCEPT_VALUE)
        setSummary(ConfigStore.KEY_CONTENT_TYPE_HEADER)
        setSummary(ConfigStore.KEY_CONTENT_TYPE_VALUE)
        setSummary(ConfigStore.KEY_PIN, mask = true, passwordInput = true)
        setSummary(ConfigStore.KEY_SALT, mask = true, passwordInput = true)
    }

    private fun setSummary(key: String, mask: Boolean = false, passwordInput: Boolean = false) {
        val pref = findPreference<Preference>(key) as? EditTextPreference ?: return
        val current = pref.text ?: ConfigStore.getString(
            requireContext(),
            key,
            ConfigStore.defaultString(key)
        )
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

    private fun maskValue(value: String): String {
        if (value.length <= 4) return "****"
        return value.take(2) + "****" + value.takeLast(2)
    }
}
