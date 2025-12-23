package com.smsrelay2

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment

class LogsFragment : Fragment() {
    private var logListener: ((List<String>) -> Unit)? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_logs, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val logsText = view.findViewById<TextView>(R.id.logs_text)
        val listener: (List<String>) -> Unit = { lines ->
            logsText.text = if (lines.isEmpty()) {
                getString(R.string.logs_placeholder)
            } else {
                lines.joinToString("\n")
            }
        }
        logListener = listener
        LogStore.register(listener)
    }

    override fun onDestroyView() {
        logListener?.let { LogStore.unregister(it) }
        logListener = null
        super.onDestroyView()
    }
}
