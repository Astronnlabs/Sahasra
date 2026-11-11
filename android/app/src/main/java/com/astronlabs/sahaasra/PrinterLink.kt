package com.astronlabs.sahaasra

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** A failure the website can explain to the user (code + plain message). */
class BridgeError(val code: String, message: String) : Exception(message)

/**
 * One connection to a receipt printer: Bluetooth Classic (SPP / RFCOMM) or Bluetooth Low Energy
 * (GATT). Only one printer is connected at a time; connecting to another closes the first.
 * A printer is reported as connected only after the socket / GATT link is actually open.
 */
@SuppressLint("MissingPermission")
class PrinterLink(private val context: Context, private val adapter: BluetoothAdapter, private val onDisconnected: (address: String, reason: String) -> Unit) {

    companion object {
        /** Serial Port Profile — what Bluetooth Classic thermal printers speak. */
        val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        /** Printing services of common BLE thermal printers (checked first). */
        val PRINTER_SERVICES: List<UUID> = listOf(
            "000018f0-0000-1000-8000-00805f9b34fb",
            "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
            "49535343-fe7d-4ae5-8fa9-9fafd205e455",
            "0000ff00-0000-1000-8000-00805f9b34fb",
            "0000ffe0-0000-1000-8000-00805f9b34fb",
            "0000fee7-0000-1000-8000-00805f9b34fb",
            "0000ffb0-0000-1000-8000-00805f9b34fb",
            "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
        ).map(UUID::fromString)

        /** Standard services that are never the printing channel. */
        private val GENERIC = setOf(0x1800, 0x1801, 0x180A, 0x180F)
    }

    @Volatile var address: String? = null
        private set
    @Volatile var protocol: String? = null
        private set

    private var socket: BluetoothSocket? = null
    private var out: OutputStream? = null

    private var gatt: BluetoothGatt? = null
    private var characteristic: BluetoothGattCharacteristic? = null
    @Volatile private var mtu = 23
    @Volatile private var bleReady: CountDownLatch? = null
    @Volatile private var bleError: String? = null
    @Volatile private var writeDone: CountDownLatch? = null
    @Volatile private var writeStatus = BluetoothGatt.GATT_SUCCESS
    @Volatile private var closing = false

    fun isConnected(): Boolean = when (protocol) {
        "classic" -> socket?.isConnected == true && out != null
        "le" -> gatt != null && characteristic != null
        else -> false
    }

    /** Connects (or keeps the existing connection). Returns the protocol used. Blocking. */
    @Synchronized
    fun connect(addr: String, wanted: String): String {
        if (!BluetoothAdapter.checkBluetoothAddress(addr)) throw BridgeError("bad-request", "Invalid printer address.")
        if (!adapter.isEnabled) throw BridgeError("bluetooth-off", "Bluetooth is off.")
        if (isConnected() && address == addr && (wanted == "auto" || wanted == protocol)) return protocol!!
        close()
        val device = adapter.getRemoteDevice(addr)
        try {
            adapter.cancelDiscovery()
        } catch (_: SecurityException) {
        }
        val type = device.type
        val order = when (wanted) {
            "classic" -> listOf("classic")
            "le" -> listOf("le")
            else -> if (type == BluetoothDevice.DEVICE_TYPE_LE) listOf("le") else listOf("classic", "le")
        }
        var last: BridgeError? = null
        for (p in order) {
            try {
                if (p == "classic") connectClassic(device) else connectLe(device)
                address = addr
                protocol = p
                return p
            } catch (e: BridgeError) {
                last = e
                close()
            }
        }
        throw last ?: BridgeError("connect-failed", "Could not connect to the printer.")
    }

    private fun connectClassic(device: BluetoothDevice) {
        // Several ways, because cheap printers differ: secure, insecure, then the fixed RFCOMM channel 1.
        val attempts: List<() -> BluetoothSocket> = listOf(
            { device.createRfcommSocketToServiceRecord(SPP) },
            { device.createInsecureRfcommSocketToServiceRecord(SPP) },
            {
                device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket
            },
        )
        var lastError: Exception? = null
        for (make in attempts) {
            var s: BluetoothSocket? = null
            try {
                s = make()
                s.connect()
                socket = s
                out = s.outputStream
                return
            } catch (e: Exception) {
                lastError = e
                try {
                    s?.close()
                } catch (_: IOException) {
                }
            }
        }
        throw BridgeError(
            "connect-failed",
            "Could not connect over Bluetooth Classic. Check the printer is on, nearby and not connected to another phone." +
                (lastError?.message?.let { " ($it)" } ?: ""),
        )
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                val waiting = bleReady
                if (waiting != null && waiting.count > 0) {
                    bleError = "The printer refused the Bluetooth LE connection (status $status)."
                    waiting.countDown()
                } else if (!closing && gatt === g) {
                    val addr = address
                    characteristic = null
                    try {
                        g.close()
                    } catch (_: Exception) {
                    }
                    gatt = null
                    protocol = null
                    address = null
                    writeDone?.countDown()
                    if (addr != null) onDisconnected(addr, "Printer disconnected (switched off or out of range)")
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val c = findWritable(g)
            if (c == null) {
                bleError = "This device has no Bluetooth LE printing service. It may be a Bluetooth Classic printer."
                bleReady?.countDown()
                return
            }
            characteristic = c
            // Bigger packets print faster; printers that refuse keep the default.
            if (!g.requestMtu(512)) bleReady?.countDown()
        }

        override fun onMtuChanged(g: BluetoothGatt, newMtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) mtu = newMtu
            bleReady?.countDown()
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            writeStatus = status
            writeDone?.countDown()
        }
    }

    private fun writable(c: BluetoothGattCharacteristic) =
        c.properties and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0

    private fun findWritable(g: BluetoothGatt): BluetoothGattCharacteristic? {
        for (id in PRINTER_SERVICES) {
            g.getService(id)?.characteristics?.firstOrNull(::writable)?.let { return it }
        }
        // Unknown printer: the first writable characteristic outside the standard services.
        for (s in g.services) {
            val short = (s.uuid.mostSignificantBits ushr 32).toInt()
            if (s.uuid.toString().endsWith("-0000-1000-8000-00805f9b34fb") && short in GENERIC) continue
            s.characteristics.firstOrNull(::writable)?.let { return it }
        }
        return null
    }

    private fun connectLe(device: BluetoothDevice) {
        val ready = CountDownLatch(1)
        bleReady = ready
        bleError = null
        mtu = 23
        closing = false
        val g = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, callback)
        } ?: throw BridgeError("connect-failed", "Bluetooth LE is not available.")
        gatt = g
        if (!ready.await(20, TimeUnit.SECONDS)) {
            bleReady = null
            throw BridgeError("connect-failed", "The printer did not answer. Check it is switched on and nearby.")
        }
        bleReady = null
        bleError?.let { throw BridgeError("connect-failed", it) }
        if (characteristic == null) throw BridgeError("connect-failed", "No printing service found.")
    }

    /**
     * Sends ESC/POS data. Stops between pieces when [cancelled] says so.
     * [safe] uses smaller, acknowledged pieces for printers that drop data.
     */
    fun write(data: ByteArray, safe: Boolean, cancelled: () -> Boolean, progress: (Int) -> Unit) {
        if (!isConnected()) throw BridgeError("not-connected", "The printer is not connected.")
        if (protocol == "classic") writeClassic(data, safe, cancelled, progress) else writeLe(data, safe, cancelled, progress)
    }

    private fun writeClassic(data: ByteArray, safe: Boolean, cancelled: () -> Boolean, progress: (Int) -> Unit) {
        val stream = out ?: throw BridgeError("not-connected", "The printer is not connected.")
        val chunk = if (safe) 128 else 512
        var i = 0
        try {
            while (i < data.size) {
                if (cancelled()) throw BridgeError("cancelled", "Cancelled")
                val n = minOf(chunk, data.size - i)
                stream.write(data, i, n)
                stream.flush()
                i += n
                progress(i)
                // RFCOMM has flow control, but small printers still like a short breather.
                Thread.sleep(if (safe) 25 else 4)
            }
        } catch (e: IOException) {
            val addr = address
            close()
            if (addr != null) onDisconnected(addr, "Printer disconnected while printing")
            throw BridgeError("write-failed", "The printer disconnected while printing. Check it is on and nearby, then print again.")
        }
    }

    @Suppress("DEPRECATION")
    private fun writeLe(data: ByteArray, safe: Boolean, cancelled: () -> Boolean, progress: (Int) -> Unit) {
        val g = gatt ?: throw BridgeError("not-connected", "The printer is not connected.")
        val c = characteristic ?: throw BridgeError("not-connected", "The printer is not connected.")
        val noResponse = !safe && c.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
        val type = if (noResponse) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        val chunk = if (safe) 20 else (mtu - 3).coerceIn(20, 509)
        var i = 0
        while (i < data.size) {
            if (cancelled()) throw BridgeError("cancelled", "Cancelled")
            if (gatt == null) throw BridgeError("write-failed", "The printer disconnected while printing.")
            val piece = data.copyOfRange(i, minOf(i + chunk, data.size))
            val done = CountDownLatch(1)
            writeDone = done
            writeStatus = BluetoothGatt.GATT_SUCCESS
            var tries = 0
            while (true) {
                val queued = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    g.writeCharacteristic(c, piece, type) == BluetoothStatusCodes.SUCCESS
                } else {
                    c.writeType = type
                    c.value = piece
                    g.writeCharacteristic(c)
                }
                if (queued) break
                // The Bluetooth stack is busy with the previous piece: wait a moment.
                if (++tries > 200) throw BridgeError("write-failed", "The printer stopped accepting data.")
                Thread.sleep(10)
            }
            if (!done.await(5, TimeUnit.SECONDS)) throw BridgeError("write-failed", "The printer stopped answering while printing.")
            if (writeStatus != BluetoothGatt.GATT_SUCCESS) throw BridgeError("write-failed", "The printer rejected the data (status $writeStatus).")
            i += piece.size
            progress(i)
        }
    }

    @Synchronized
    fun close() {
        closing = true
        try {
            out?.close()
        } catch (_: IOException) {
        }
        try {
            socket?.close()
        } catch (_: IOException) {
        }
        out = null
        socket = null
        gatt?.let {
            try {
                it.disconnect()
                it.close()
            } catch (_: Exception) {
            }
        }
        gatt = null
        characteristic = null
        writeDone?.countDown()
        address = null
        protocol = null
        closing = false
    }
}
