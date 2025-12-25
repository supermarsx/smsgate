package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.smsrelay3.data.db.DatabaseProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LogsFragment : Fragment() {
    private var logListener: ((List<String>) -> Unit)? = null
    private var logsText: TextView? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_logs, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        logsText = view.findViewById(R.id.logs_text)
        val listener: (List<String>) -> Unit = { lines ->
            logsText?.text = if (lines.isEmpty()) {
                getString(R.string.logs_placeholder)
            } else {
                lines.joinToString("\n")
            }
        }
        logListener = listener
        LogStore.register(listener)
    }

    override fun onResume() {
        super.onResume()
        loadRecent()
    }

    override fun onDestroyView() {
        logListener?.let { LogStore.unregister(it) }
        logListener = null
        logsText = null
        super.onDestroyView()
    }

    private fun loadRecent() {
        CoroutineScope(Dispatchers.IO).launch {
            val entries = DatabaseProvider.get(requireContext()).localLogDao().loadRecent(200)
            val lines = entries.reversed().map { "[${formatTs(it.tsMs)}] ${it.message}" }
            withContext(Dispatchers.Main) {
                if (!isAdded) return@withContext
                logsText?.text = if (lines.isEmpty()) {
                    getString(R.string.logs_placeholder)
                } else {
                    lines.joinToString("\n")
                }
            }
        }
    }

    private fun formatTs(tsMs: Long): String {
        val formatter = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        return formatter.format(java.util.Date(tsMs))
    }
}
