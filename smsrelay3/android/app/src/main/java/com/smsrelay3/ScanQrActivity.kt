package com.smsrelay3

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ScanQrActivity : AppCompatActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var cameraExecutor: ExecutorService
    private val isHandled = AtomicBoolean(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        com.smsrelay3.util.ThemeManager.applyMode(this)
        com.smsrelay3.util.ThemeManager.applyTheme(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_scan_qr)
        previewView = findViewById(R.id.qr_preview)
        val errorText = findViewById<android.widget.TextView>(R.id.qr_error)
        if (!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY)) {
            errorText.text = getString(R.string.scan_error_no_camera)
            errorText.visibility = android.view.View.VISIBLE
            return
        }
        cameraExecutor = Executors.newSingleThreadExecutor()
        startCamera(errorText)
    }

    override fun onDestroy() {
        cameraExecutor.shutdown()
        super.onDestroy()
    }

    private fun startCamera(errorText: android.widget.TextView) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = androidx.camera.core.Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(cameraExecutor, QrAnalyzer { text ->
                    if (isHandled.compareAndSet(false, true)) {
                        val data = android.content.Intent().putExtra(EXTRA_QR_TEXT, text)
                        setResult(RESULT_OK, data)
                        finish()
                    }
                })
                val selector = CameraSelector.DEFAULT_BACK_CAMERA
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, selector, preview, analysis)
            } catch (_: Exception) {
                errorText.text = getString(R.string.scan_error_start_failed)
                errorText.visibility = android.view.View.VISIBLE
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private class QrAnalyzer(
        private val onResult: (String) -> Unit
    ) : ImageAnalysis.Analyzer {
        private val scanner = BarcodeScanning.getClient()

        override fun analyze(imageProxy: ImageProxy) {
            val mediaImage = imageProxy.image
            if (mediaImage == null) {
                imageProxy.close()
                return
            }
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            scanner.process(image)
                .addOnSuccessListener { barcodes ->
                    val text = barcodes.firstOrNull()?.rawValue
                    if (!text.isNullOrBlank()) {
                        onResult(text)
                    }
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        }
    }

    companion object {
        const val EXTRA_QR_TEXT = "qr_text"
    }
}
