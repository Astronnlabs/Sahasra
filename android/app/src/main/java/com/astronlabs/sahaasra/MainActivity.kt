package com.astronlabs.sahaasra

import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * SAHAASRA for Android: the SAHAASRA website (https://app.sahaasra.in) in a secure WebView, plus
 * what a website can't do on a phone — Bluetooth receipt printers (Classic SPP and BLE), saving
 * files to Downloads, sharing bills, and Android's print dialog.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var bridge: NativeBridge
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    companion object {
        private const val REQ_FILE = 51
        private val APP_HOST = Uri.parse(BuildConfig.APP_URL).host!!

        /** Hosts that open inside the app: SAHAASRA itself and PayU's payment pages for plan purchases. */
        private fun opensInApp(host: String) = host == APP_HOST || host == "payu.in" || host.endsWith(".payu.in") || host.endsWith(".payubiz.in")

        private val OFFLINE_PAGE = """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#171522;text-align:center;padding:24px;box-sizing:border-box}
            a{display:inline-block;margin-top:16px;background:#6D3DE8;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600}</style></head>
            <body><div><h2>No internet connection</h2><p>SAHAASRA needs the internet to open. Receipts already prepared can still print once it is back.</p>
            <a href="${BuildConfig.APP_URL}">Try again</a></div></body></html>
        """.trimIndent()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applyInsets(root)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString SahaasraApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)

        bridge = NativeBridge(this)
        // The bridge exists only for pages from the app's own origin, and only in the main frame.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "SahaasraNative", setOf(BuildConfig.APP_ORIGIN)) { _, message, sourceOrigin, isMainFrame, reply ->
                if (isMainFrame && sourceOrigin.toString().trimEnd('/') == BuildConfig.APP_ORIGIN) bridge.onMessage(message.data, reply)
            }
        } else {
            Toast.makeText(this, "Update “Android System WebView” from the Play Store to use Bluetooth printers.", Toast.LENGTH_LONG).show()
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && opensInApp(url.host ?: "")) return false
                openOutside(url)
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }

            // The app needs no camera, microphone or location.
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) = callback.invoke(origin, false, false)
        }
        // Real web downloads (e.g. the Windows printer helper) open in the browser; bills and
        // exports are handed over by the website through the bridge instead.
        web.setDownloadListener { url, _, _, _, _ ->
            if (url.startsWith("https://")) openOutside(Uri.parse(url))
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        }
        // System broadcasts only (Bluetooth on/off, printer dropped out); other apps can't send these.
        ContextCompat.registerReceiver(this, bridge.systemReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(BuildConfig.APP_URL)
    }

    /** Keeps the page clear of the status bar, navigation bar and keyboard (edge-to-edge on Android 15). */
    private fun applyInsets(root: View) {
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            )
        } else if (Build.VERSION.SDK_INT >= 23) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
    }

    private fun openOutside(url: Uri) {
        try {
            val intent = if (url.scheme == "intent") Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME).apply {
                // Never let a link start a component of this app or an unexported one.
                component = null
                selector = null
                addCategory(Intent.CATEGORY_BROWSABLE)
            } else Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE)
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "No app found to open this link.", Toast.LENGTH_SHORT).show()
        }
    }

    /** Android's print dialog for the current page (the website shows only the bill when printing). */
    fun printPage(title: String, onFinished: () -> Unit) {
        val manager = getSystemService(Context.PRINT_SERVICE) as PrintManager
        val inner = web.createPrintDocumentAdapter(title)
        val adapter = object : PrintDocumentAdapter() {
            override fun onStart() = inner.onStart()
            override fun onLayout(old: PrintAttributes?, new: PrintAttributes, cancel: CancellationSignal?, cb: LayoutResultCallback, extras: Bundle?) =
                inner.onLayout(old, new, cancel, cb, extras)
            override fun onWrite(pages: Array<out PageRange>, dest: ParcelFileDescriptor, cancel: CancellationSignal?, cb: WriteResultCallback) =
                inner.onWrite(pages, dest, cancel, cb)
            override fun onFinish() {
                inner.onFinish()
                onFinished()
            }
        }
        manager.print(title, adapter, PrintAttributes.Builder().build())
    }

    private fun goBack() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    @Deprecated("Android 12 and older")
    override fun onBackPressed() {
        goBack()
    }

    @Deprecated("Uses the platform request codes")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_FILE -> {
                fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
                fileCallback = null
            }
            NativeBridge.REQ_ENABLE_BT -> bridge.onEnableResult()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NativeBridge.REQ_PERMISSIONS) bridge.onPermissionsResult()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(bridge.systemReceiver)
        } catch (_: Exception) {
        }
        bridge.shutdown()
        web.destroy()
        super.onDestroy()
    }
}
