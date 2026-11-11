package com.astronlabs.sahaasra

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * The website ↔ phone channel. Android only connects it to pages from the app's own origin
 * (see MainActivity: addWebMessageListener with APP_ORIGIN), only in the main frame.
 * Every request is checked here: known operation names only, sizes limited, addresses validated.
 * The website sends finished receipt data; this side only talks to the chosen printer.
 */
@SuppressLint("MissingPermission")
class NativeBridge(private val activity: MainActivity) {

    private val main = Handler(Looper.getMainLooper())
    /** Printer work runs in order on one thread (connect, print, disconnect never overlap). */
    private val printerThread = Executors.newSingleThreadExecutor()
    private val workThread = Executors.newSingleThreadExecutor()
    private val adapter: BluetoothAdapter? = (activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
    private val link: PrinterLink? = adapter?.let {
        PrinterLink(activity.applicationContext, it) { address, reason ->
            emit("connection", JSONObject().put("address", address).put("connected", false).put("reason", reason))
        }
    }
    private var proxy: JavaScriptReplyProxy? = null
    private val cancelled = ConcurrentHashMap.newKeySet<String>()

    private var permissionReply: ((Boolean) -> Unit)? = null
    private var enableReply: ((Boolean) -> Unit)? = null

    companion object {
        const val REQ_PERMISSIONS = 41
        const val REQ_ENABLE_BT = 42
        private const val MAX_PRINT_BYTES = 2 * 1024 * 1024
        private const val MAX_FILE_BYTES = 25 * 1024 * 1024
        private val FILE_TYPES = setOf(
            "application/pdf", "image/png", "image/jpeg", "text/csv", "text/plain",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/json",
        )
    }

    /* ───────────── messages from the website ───────────── */

    fun onMessage(data: String?, reply: JavaScriptReplyProxy) {
        proxy = reply
        val msg = try {
            JSONObject(data ?: return)
        } catch (_: Exception) {
            return
        }
        val id = msg.optInt("id", -1)
        if (id < 0) return
        val args = msg.optJSONObject("args") ?: JSONObject()
        val done = { result: Any? -> respond(reply, JSONObject().put("id", id).put("ok", true).put("result", result ?: JSONObject.NULL)) }
        val fail = { e: Throwable ->
            val code = (e as? BridgeError)?.code ?: if (e is SecurityException) "permission" else "error"
            respond(reply, JSONObject().put("id", id).put("ok", false).put("code", code).put("error", e.message ?: "Something went wrong."))
        }
        try {
            when (msg.optString("op")) {
                "info" -> done(info())
                "permissions" -> requestPermissions { granted -> done(JSONObject().put("granted", granted)) }
                "enableBluetooth" -> enableBluetooth { on -> done(JSONObject().put("enabled", on)) }
                "paired" -> done(paired())
                "scan" -> scan(args.optInt("seconds", 12).coerceIn(3, 30), done, fail)
                "stopScan" -> {
                    stopScan()
                    done(null)
                }
                "connect" -> {
                    val address = args.optString("address")
                    val protocol = args.optString("protocol", "auto").takeIf { it in setOf("classic", "le", "auto") } ?: "auto"
                    printerThread.execute {
                        try {
                            val l = requireLink()
                            val used = l.connect(address, protocol)
                            emit("connection", JSONObject().put("address", address).put("connected", true).put("protocol", used))
                            done(JSONObject().put("protocol", used))
                        } catch (e: Throwable) {
                            fail(e)
                        }
                    }
                }
                "disconnect" -> printerThread.execute {
                    link?.close()
                    done(null)
                }
                "status" -> done(
                    JSONObject().put("connected", link?.isConnected() == true).put("address", link?.address ?: JSONObject.NULL).put("protocol", link?.protocol ?: JSONObject.NULL),
                )
                "write" -> write(args, done, fail)
                "cancel" -> {
                    args.optString("jobId").takeIf { it.isNotEmpty() && it.length <= 64 }?.let { cancelled.add(it) }
                    done(null)
                }
                "saveFile" -> workThread.execute {
                    try {
                        done(saveFile(args))
                    } catch (e: Throwable) {
                        fail(e)
                    }
                }
                "shareFile" -> workThread.execute {
                    try {
                        done(shareFile(args))
                    } catch (e: Throwable) {
                        fail(e)
                    }
                }
                "systemPrint" -> main.post {
                    activity.printPage(args.optString("title", "SAHAASRA").take(80)) { emit("print-finished", JSONObject()) }
                    done(JSONObject().put("started", true))
                }
                else -> fail(BridgeError("unknown-op", "Unknown request."))
            }
        } catch (e: Throwable) {
            fail(e)
        }
    }

    private fun respond(reply: JavaScriptReplyProxy, json: JSONObject) {
        main.post {
            try {
                reply.postMessage(json.toString())
            } catch (_: Exception) {
                // The page was closed or reloaded.
            }
        }
    }

    /** Events (connection changes, progress…) go to the page that last talked to the app. */
    fun emit(event: String, data: JSONObject) {
        val p = proxy ?: return
        respond(p, JSONObject().put("event", event).put("data", data))
    }

    private fun requireLink(): PrinterLink {
        if (!hasPermissions()) throw BridgeError("permission", "Allow “Nearby devices” for SAHAASRA.")
        val a = adapter ?: throw BridgeError("no-bluetooth", "This phone has no Bluetooth.")
        if (!a.isEnabled) throw BridgeError("bluetooth-off", "Bluetooth is off.")
        return link!!
    }

    /* ───────────── permissions and Bluetooth on/off ───────────── */

    private fun neededPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    fun hasPermissions() = neededPermissions().all { ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED }

    private fun info() = JSONObject()
        .put("app", "SAHAASRA")
        .put("version", BuildConfig.VERSION_NAME)
        .put("sdk", Build.VERSION.SDK_INT)
        .put("bluetooth", JSONObject().put("supported", adapter != null).put("enabled", adapter?.isEnabled == true))
        .put("permissions", hasPermissions())

    private fun requestPermissions(reply: (Boolean) -> Unit) {
        if (hasPermissions()) return reply(true)
        permissionReply = reply
        main.post { activity.requestPermissions(neededPermissions(), REQ_PERMISSIONS) }
    }

    fun onPermissionsResult() {
        permissionReply?.invoke(hasPermissions())
        permissionReply = null
    }

    private fun enableBluetooth(reply: (Boolean) -> Unit) {
        val a = adapter ?: return reply(false)
        if (a.isEnabled) return reply(true)
        if (!hasPermissions()) return reply(false)
        enableReply = reply
        main.post {
            try {
                @Suppress("DEPRECATION")
                activity.startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_ENABLE_BT)
            } catch (_: Exception) {
                enableReply?.invoke(false)
                enableReply = null
            }
        }
    }

    fun onEnableResult() {
        enableReply?.invoke(adapter?.isEnabled == true)
        enableReply = null
    }

    /* ───────────── devices ───────────── */

    private fun describe(d: BluetoothDevice, printerHint: Boolean = false): JSONObject {
        val name = try {
            d.name
        } catch (_: SecurityException) {
            null
        }
        val type = when (d.type) {
            BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
            BluetoothDevice.DEVICE_TYPE_LE -> "le"
            BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
            else -> "unknown"
        }
        val major = try {
            d.bluetoothClass?.majorDeviceClass
        } catch (_: SecurityException) {
            null
        }
        return JSONObject()
            .put("address", d.address)
            .put("name", name ?: "")
            .put("type", type)
            .put("paired", d.bondState == BluetoothDevice.BOND_BONDED)
            .put("printer", printerHint || major == BluetoothClass.Device.Major.IMAGING)
    }

    private fun paired(): JSONArray {
        val a = adapter ?: return JSONArray()
        if (!hasPermissions()) throw BridgeError("permission", "Allow “Nearby devices” for SAHAASRA.")
        return JSONArray(a.bondedDevices.map { describe(it) })
    }

    private var scanReceiver: BroadcastReceiver? = null
    private var leCallback: ScanCallback? = null
    private val found = ConcurrentHashMap<String, JSONObject>()

    private fun scan(seconds: Int, done: (Any?) -> Unit, fail: (Throwable) -> Unit) {
        val a = adapter ?: return fail(BridgeError("no-bluetooth", "This phone has no Bluetooth."))
        if (!hasPermissions()) return fail(BridgeError("permission", "Allow “Nearby devices” for SAHAASRA."))
        if (!a.isEnabled) return fail(BridgeError("bluetooth-off", "Bluetooth is off."))
        stopScan()
        found.clear()
        val report = { d: BluetoothDevice, printer: Boolean ->
            val j = describe(d, printer)
            val before = found.put(d.address, j)
            if (before == null) emit("device-found", j)
        }
        // Bluetooth Classic discovery.
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                if (intent.action == BluetoothDevice.ACTION_FOUND) {
                    val d: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    d?.let { report(it, false) }
                }
            }
        }
        ContextCompat.registerReceiver(activity, receiver, IntentFilter(BluetoothDevice.ACTION_FOUND), ContextCompat.RECEIVER_NOT_EXPORTED)
        scanReceiver = receiver
        a.startDiscovery()
        // Bluetooth LE scan.
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val uuids = result.scanRecord?.serviceUuids?.map { it.uuid } ?: emptyList()
                report(result.device, uuids.any { it in PrinterLink.PRINTER_SERVICES })
            }
        }
        try {
            a.bluetoothLeScanner?.startScan(cb)
            leCallback = cb
        } catch (_: Exception) {
        }
        main.postDelayed({
            stopScan()
            done(JSONArray(found.values.toList()))
        }, seconds * 1000L)
    }

    fun stopScan() {
        try {
            adapter?.cancelDiscovery()
        } catch (_: Exception) {
        }
        scanReceiver?.let {
            try {
                activity.unregisterReceiver(it)
            } catch (_: Exception) {
            }
        }
        scanReceiver = null
        leCallback?.let {
            try {
                adapter?.bluetoothLeScanner?.stopScan(it)
            } catch (_: Exception) {
            }
        }
        leCallback = null
    }

    /* ───────────── printing ───────────── */

    private fun write(args: JSONObject, done: (Any?) -> Unit, fail: (Throwable) -> Unit) {
        val jobId = args.optString("jobId")
        if (jobId.isEmpty() || jobId.length > 64) return fail(BridgeError("bad-request", "Invalid print job."))
        val bytes = try {
            Base64.decode(args.optString("data"), Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return fail(BridgeError("bad-request", "Invalid receipt data."))
        }
        if (bytes.isEmpty() || bytes.size > MAX_PRINT_BYTES) return fail(BridgeError("too-large", "The receipt is too large to print."))
        val safe = args.optBoolean("safe", false)
        printerThread.execute {
            try {
                if (jobId in cancelled) throw BridgeError("cancelled", "Cancelled")
                val l = requireLink()
                if (!l.isConnected()) throw BridgeError("not-connected", "The printer is not connected.")
                var lastReport = 0L
                l.write(bytes, safe, { jobId in cancelled }) { sent ->
                    val now = System.currentTimeMillis()
                    if (now - lastReport > 150 || sent == bytes.size) {
                        lastReport = now
                        emit("progress", JSONObject().put("jobId", jobId).put("sent", sent).put("total", bytes.size))
                    }
                }
                done(JSONObject().put("bytes", bytes.size))
            } catch (e: Throwable) {
                fail(e)
            } finally {
                cancelled.remove(jobId)
            }
        }
    }

    /* ───────────── files ───────────── */

    private fun fileArgs(args: JSONObject): Triple<String, String, ByteArray> {
        val name = args.optString("name", "download").replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().take(100).ifEmpty { "download" }
        val mime = args.optString("mime").takeIf { it in FILE_TYPES } ?: "application/octet-stream"
        val bytes = Base64.decode(args.optString("data"), Base64.DEFAULT)
        if (bytes.size > MAX_FILE_BYTES) throw BridgeError("too-large", "The file is too large.")
        return Triple(name, mime, bytes)
    }

    /** Saves to the phone's Downloads folder (Android 10+), or offers to share it on older phones. */
    private fun saveFile(args: JSONObject): JSONObject {
        val (name, mime, bytes) = fileArgs(args)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val resolver = activity.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw BridgeError("save-failed", "Could not save the file.")
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw BridgeError("save-failed", "Could not save the file.")
            main.post {
                Toast.makeText(activity, "Saved to Downloads: $name", Toast.LENGTH_LONG).show()
                openFile(uri, mime)
            }
            return JSONObject().put("saved", true).put("location", "Downloads")
        }
        shareBytes(name, mime, bytes, "")
        return JSONObject().put("saved", false).put("location", "the share menu")
    }

    private fun openFile(uri: Uri, mime: String) {
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        } catch (_: Exception) {
            // No app to open it: it is still in Downloads.
        }
    }

    private fun shareFile(args: JSONObject): JSONObject {
        val (name, mime, bytes) = fileArgs(args)
        shareBytes(name, mime, bytes, args.optString("text").take(500))
        return JSONObject().put("shared", true)
    }

    private fun shareBytes(name: String, mime: String, bytes: ByteArray, text: String) {
        val dir = File(activity.cacheDir, "shared").apply { mkdirs() }
        // Old shared files are removed so bills don't pile up on the phone.
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 3600_000L }?.forEach { it.delete() }
        val file = File(dir, name)
        file.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            if (text.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, text)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        main.post { activity.startActivity(Intent.createChooser(send, name)) }
    }

    /* ───────────── system events ───────────── */

    /** Bluetooth switched off/on, and printers dropping out (switched off, out of range). */
    val systemReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            when (intent.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    if (state == BluetoothAdapter.STATE_OFF) {
                        val addr = link?.address
                        printerThread.execute { link?.close() }
                        emit("bluetooth", JSONObject().put("enabled", false))
                        if (addr != null) emit("connection", JSONObject().put("address", addr).put("connected", false).put("reason", "Bluetooth is off"))
                    } else if (state == BluetoothAdapter.STATE_ON) {
                        emit("bluetooth", JSONObject().put("enabled", true))
                    }
                }
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                    val d: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    val l = link ?: return
                    if (d != null && d.address == l.address && l.protocol == "classic") {
                        printerThread.execute { l.close() }
                        emit("connection", JSONObject().put("address", d.address).put("connected", false).put("reason", "Printer disconnected (switched off or out of range)"))
                    }
                }
            }
        }
    }

    fun shutdown() {
        stopScan()
        printerThread.execute { link?.close() }
        printerThread.shutdown()
        workThread.shutdown()
    }
}
