package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.export.LogExport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.concurrent.thread

class LogsFragment : Fragment() {
    private var logListener: ((List<String>) -> Unit)? = null
    private var logsText: TextView? = null
    private var filter: String = "all"
    private var exportButton: Button? = null
    private var clearButton: Button? = null
    private var filterAll: Button? = null
    private var filterErrors: Button? = null

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
        exportButton = view.findViewById(R.id.logs_export)
        clearButton = view.findViewById(R.id.logs_clear)
        filterAll = view.findViewById(R.id.logs_filter_all)
        filterErrors = view.findViewById(R.id.logs_filter_errors)

        filterAll?.setOnClickListener {
            filter = "all"
            loadRecent()
        }
        filterErrors?.setOnClickListener {
            filter = "error"
            loadRecent()
        }
        exportButton?.setOnClickListener {
            exportLauncher.launch("smsrelay3-logs.txt")
        }
        clearButton?.setOnClickListener {
            clearLogs()
        }

        val listener: (List<String>) -> Unit = { lines ->
            if (lines.isNotEmpty()) {
                loadRecent()
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
        exportButton = null
        clearButton = null
        filterAll = null
        filterErrors = null
        super.onDestroyView()
    }

    private fun loadRecent() {
        CoroutineScope(Dispatchers.IO).launch {
            val dao = DatabaseProvider.get(requireContext()).localLogDao()
            val entries = if (filter == "error") {
                dao.loadRecentByLevel("error", 200)
            } else {
                dao.loadRecent(200)
            }
            val lines = entries.map { "[${formatTs(it.tsMs)}] ${it.message}" }
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

    private fun clearLogs() {
        CoroutineScope(Dispatchers.IO).launch {
            DatabaseProvider.get(requireContext()).localLogDao().clearAll()
            LogStore.clear()
            withContext(Dispatchers.Main) {
                if (!isAdded) return@withContext
                logsText?.text = getString(R.string.logs_placeholder)
                android.widget.Toast.makeText(
                    requireContext(),
                    getString(R.string.toast_cleared),
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private val exportLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("text/plain")
    ) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = LogExport.buildExport(requireContext(), filter)
            val success = LogExport.writeToUri(requireContext(), uri, content)
            requireActivity().runOnUiThread {
                android.widget.Toast.makeText(
                    requireContext(),
                    if (success) getString(R.string.toast_export_logs_done) else getString(R.string.toast_export_logs_failed),
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }
}
