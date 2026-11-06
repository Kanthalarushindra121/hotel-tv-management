package com.smartstaytv

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import io.socket.client.IO
import io.socket.client.Socket
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

enum class TvScreenState {
    PAIRING,
    DEFAULT_MODE,
    GUEST_ACTIVE,
    CHECKOUT_DAY,
    SCREENSAVER
}

class MainActivity : AppCompatActivity() {

    private val TAG = "SmartStayTV"

    // Views
    private lateinit var viewGuestActive: View
    private lateinit var viewDefaultMode: View
    private lateinit var viewPairing: View
    private lateinit var viewCheckoutDay: View
    private lateinit var viewScreensaver: View

    // Text & Image views
    private lateinit var tvGuestHotelName: TextView
    private lateinit var tvGuestWelcomeName: TextView
    private lateinit var tvGuestClock: TextView
    private lateinit var tvGuestRoomBadge: TextView
    private lateinit var tvResCheckoutTime: TextView
    private lateinit var tvResConcierge: TextView
    private lateinit var tvGuestWifiSsid: TextView
    private lateinit var ivGuestWifiQr: ImageView
    private lateinit var tvAmenitiesList: TextView
    private lateinit var tvQuietHoursFooter: TextView
    private lateinit var btnLaunchEntertainment: Button

    private lateinit var tvDefaultHotelTitle: TextView
    private lateinit var tvDefaultTagline: TextView
    private lateinit var tvDefaultWifiName: TextView
    private lateinit var ivDefaultWifiQr: ImageView
    private lateinit var tvDefaultRoomLabel: TextView

    private lateinit var tvPairingCode: TextView
    private lateinit var ivPairingQr: ImageView
    private lateinit var tvPairingStatus: TextView

    private lateinit var tvCheckoutTimeHeadline: TextView
    private lateinit var tvScreensaverTime: TextView
    private lateinit var tvScreensaverHotel: TextView

    // State & Preferences
    private lateinit var prefs: SharedPreferences
    private var currentState: TvScreenState = TvScreenState.DEFAULT_MODE
    private var socket: Socket? = null
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private val handler = Handler(Looper.getMainLooper())
    private val clockRunnable = object : Runnable {
        override fun run() {
            updateClock()
            handler.postDelayed(this, 30000)
        }
    }

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            sendHeartbeat()
            handler.postDelayed(this, 30000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("smartstay_tv_prefs", Context.MODE_PRIVATE)

        bindViews()
        setupListeners()
        loadSavedConfig()
        initSocketConnection()

        // Start Clock & Heartbeat
        handler.post(clockRunnable)
        handler.postDelayed(heartbeatRunnable, 5000)
    }

    private fun bindViews() {
        viewGuestActive = findViewById(R.id.view_guest_active)
        viewDefaultMode = findViewById(R.id.view_default_mode)
        viewPairing = findViewById(R.id.view_pairing)
        viewCheckoutDay = findViewById(R.id.view_checkout_day)
        viewScreensaver = findViewById(R.id.view_screensaver)

        // Guest Active
        tvGuestHotelName = findViewById(R.id.tv_guest_hotel_name)
        tvGuestWelcomeName = findViewById(R.id.tv_guest_welcome_name)
        tvGuestClock = findViewById(R.id.tv_guest_clock)
        tvGuestRoomBadge = findViewById(R.id.tv_guest_room_badge)
        tvResCheckoutTime = findViewById(R.id.tv_res_checkout_time)
        tvResConcierge = findViewById(R.id.tv_res_concierge)
        tvGuestWifiSsid = findViewById(R.id.tv_guest_wifi_ssid)
        ivGuestWifiQr = findViewById(R.id.iv_guest_wifi_qr)
        tvAmenitiesList = findViewById(R.id.tv_amenities_list)
        tvQuietHoursFooter = findViewById(R.id.tv_quiet_hours_footer)
        btnLaunchEntertainment = findViewById(R.id.btn_launch_entertainment)

        // Default Mode
        tvDefaultHotelTitle = findViewById(R.id.tv_default_hotel_title)
        tvDefaultTagline = findViewById(R.id.tv_default_tagline)
        tvDefaultWifiName = findViewById(R.id.tv_default_wifi_name)
        ivDefaultWifiQr = findViewById(R.id.iv_default_wifi_qr)
        tvDefaultRoomLabel = findViewById(R.id.tv_default_room_label)

        // Pairing
        tvPairingCode = findViewById(R.id.tv_pairing_code)
        ivPairingQr = findViewById(R.id.iv_pairing_qr)
        tvPairingStatus = findViewById(R.id.tv_pairing_status)

        // Checkout & Screensaver
        tvCheckoutTimeHeadline = findViewById(R.id.tv_checkout_time_headline)
        tvScreensaverTime = findViewById(R.id.tv_screensaver_time)
        tvScreensaverHotel = findViewById(R.id.tv_screensaver_hotel)
    }

    private fun setupListeners() {
        btnLaunchEntertainment.setOnClickListener {
            launchEntertainmentApps()
        }
        btnLaunchEntertainment.requestFocus()
    }

    private fun getHardwareId(): String {
        var id = prefs.getString("hardware_id", null)
        if (id == null) {
            val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            id = if (!androidId.isNullOrEmpty() && androidId != "9774d56d682e549c") {
                "TV_${androidId.uppercase()}"
            } else {
                "TV_${UUID.randomUUID().toString().substring(0, 8).uppercase()}"
            }
            prefs.edit().putString("hardware_id", id).apply()
        }
        return id
    }

    /**
     * Reads the connected Wi-Fi SSID where Android permission allows.
     * Note: On Android 10+ (API 29+), ACCESS_FINE_LOCATION must be granted.
     * If restricted or on Ethernet LAN, returns null and backend gracefully falls back.
     */
    private fun getConnectedWifiSsid(): String? {
        return try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val info = wifiManager?.connectionInfo
            val rawSsid = info?.ssid?.replace("\"", "")?.trim()
            if (!rawSsid.isNullOrEmpty() && rawSsid != "<unknown ssid>" && rawSsid != "0x") {
                rawSsid
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Cannot access Wi-Fi SSID: ${e.message}")
            null
        }
    }

    private fun getBackendBaseUrl(): String {
        return prefs.getString("backend_url", "http://10.0.2.2:4000") ?: "http://10.0.2.2:4000"
    }

    private fun updateAmenitiesDisplay(amenitiesArray: org.json.JSONArray?) {
        if (amenitiesArray == null || amenitiesArray.length() == 0) return
        val sb = StringBuilder()
        for (i in 0 until amenitiesArray.length()) {
            val a = amenitiesArray.optJSONObject(i) ?: continue
            if (a.optBoolean("isActive", true)) {
                val name = a.optString("customName", a.optString("name", ""))
                if (name.isNotEmpty()) {
                    sb.append("• ").append(name).append("\n")
                }
            }
        }
        val text = sb.toString().trim()
        if (text.isNotEmpty()) {
            tvAmenitiesList.text = text
            prefs.edit().putString("amenities_cached", text).apply()
        }
    }

    private fun loadSavedConfig() {
        val isPaired = prefs.getBoolean("is_paired", false)
        val hotelName = prefs.getString("hotel_name", "SmartStay Hotel") ?: "SmartStay Hotel"
        val roomNumber = prefs.getString("room_number", "101") ?: "101"
        val wifiSsid = prefs.getString("wifi_ssid", "SmartStay_Guest") ?: "SmartStay_Guest"
        val wifiPass = prefs.getString("wifi_pass", "") ?: ""
        val guestName = prefs.getString("guest_name", null)
        val checkoutTime = prefs.getString("checkout_time", "11:00 AM") ?: "11:00 AM"
        val conciergePhone = prefs.getString("concierge_phone", "+91 40 2335 0101") ?: "+91 40 2335 0101"
        val cachedAmenities = prefs.getString("amenities_cached", null)

        tvGuestHotelName.text = hotelName.uppercase(Locale.getDefault())
        tvDefaultHotelTitle.text = hotelName
        tvScreensaverHotel.text = "$hotelName • Room $roomNumber"
        tvGuestRoomBadge.text = "ROOM $roomNumber"
        tvDefaultRoomLabel.text = "Room $roomNumber"
        tvResCheckoutTime.text = "By $checkoutTime"
        tvCheckoutTimeHeadline.text = "Checkout Today by $checkoutTime"
        tvResConcierge.text = conciergePhone

        if (!cachedAmenities.isNullOrEmpty()) {
            tvAmenitiesList.text = cachedAmenities
        }

        tvGuestWifiSsid.text = wifiSsid
        tvDefaultWifiName.text = wifiSsid

        generateWifiQr(wifiSsid, wifiPass)

        if (!isPaired) {
            // Request 6-digit pairing code from backend
            requestPairingCodeFromBackend()
        } else if (guestName != null) {
            showGuestActive(guestName, roomNumber)
        } else {
            showDefaultMode()
        }
    }

    private fun requestPairingCodeFromBackend() {
        val hardwareId = getHardwareId()
        val url = "${getBackendBaseUrl()}/api/v1/devices/pairing/initiate"

        val json = JSONObject().apply {
            put("deviceId", hardwareId)
            val info = JSONObject().apply {
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("brand", Build.BRAND)
                put("osVersion", "Android ${Build.VERSION.RELEASE}")
                put("appVersion", "1.0.0")
            }
            put("deviceInfo", info)
        }

        val body = json.toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(url).post(body).build()

        httpClient.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Backend unreachable for pairing initiate, using cached/fallback code: ${e.message}")
                val fallbackCode = prefs.getString("pairing_code", generateRandomPairingCode()) ?: "482193"
                runOnUiThread {
                    showPairingScreen(fallbackCode)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                try {
                    val respStr = response.body?.string() ?: ""
                    val root = JSONObject(respStr)
                    val data = root.optJSONObject("data")
                    val code = data?.optString("code") ?: generateRandomPairingCode()
                    prefs.edit().putString("pairing_code", code).apply()

                    runOnUiThread {
                        showPairingScreen(code)
                    }
                } catch (e: Exception) {
                    val fallbackCode = prefs.getString("pairing_code", generateRandomPairingCode()) ?: "482193"
                    runOnUiThread {
                        showPairingScreen(fallbackCode)
                    }
                }
            }
        })
    }

    private fun generateRandomPairingCode(): String {
        return (100000..999999).random().toString()
    }

    private fun generateWifiQr(ssid: String, pass: String) {
        val qrString = if (pass.isEmpty()) {
            "WIFI:S:$ssid;;"
        } else {
            "WIFI:S:$ssid;T:WPA;P:$pass;;"
        }

        try {
            val barcodeEncoder = BarcodeEncoder()
            val bitmap: Bitmap = barcodeEncoder.encodeBitmap(qrString, BarcodeFormat.QR_CODE, 300, 300)
            ivGuestWifiQr.setImageBitmap(bitmap)
            ivDefaultWifiQr.setImageBitmap(bitmap)
        } catch (e: Exception) {
            Log.e(TAG, "Error generating Wi-Fi QR", e)
        }
    }

    private fun updateClock() {
        val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
        val currentTime = timeFormat.format(Date())
        tvGuestClock.text = currentTime
        tvScreensaverTime.text = currentTime
    }

    private fun showPairingScreen(code: String) {
        currentState = TvScreenState.PAIRING
        viewPairing.visibility = View.VISIBLE
        viewGuestActive.visibility = View.GONE
        viewDefaultMode.visibility = View.GONE
        viewCheckoutDay.visibility = View.GONE
        viewScreensaver.visibility = View.GONE

        tvPairingCode.text = code
        try {
            val barcodeEncoder = BarcodeEncoder()
            val bitmap = barcodeEncoder.encodeBitmap("smartstaytv://pair?code=$code", BarcodeFormat.QR_CODE, 240, 240)
            ivPairingQr.setImageBitmap(bitmap)
        } catch (e: Exception) {
            Log.e(TAG, "Pairing QR error", e)
        }
    }

    private fun showGuestActive(guestName: String, roomNumber: String) {
        currentState = TvScreenState.GUEST_ACTIVE
        viewGuestActive.visibility = View.VISIBLE
        viewDefaultMode.visibility = View.GONE
        viewPairing.visibility = View.GONE
        viewCheckoutDay.visibility = View.GONE
        viewScreensaver.visibility = View.GONE

        tvGuestWelcomeName.text = "Welcome, $guestName!"
        tvGuestRoomBadge.text = "ROOM $roomNumber"
        btnLaunchEntertainment.requestFocus()
    }

    private fun showDefaultMode() {
        currentState = TvScreenState.DEFAULT_MODE
        viewDefaultMode.visibility = View.VISIBLE
        viewGuestActive.visibility = View.GONE
        viewPairing.visibility = View.GONE
        viewCheckoutDay.visibility = View.GONE
        viewScreensaver.visibility = View.GONE
    }

    private fun showCheckoutDay(checkoutTime: String) {
        currentState = TvScreenState.CHECKOUT_DAY
        viewCheckoutDay.visibility = View.VISIBLE
        viewGuestActive.visibility = View.GONE
        viewDefaultMode.visibility = View.GONE
        viewPairing.visibility = View.GONE
        viewScreensaver.visibility = View.GONE

        tvCheckoutTimeHeadline.text = "Checkout Today by $checkoutTime"
    }

    private fun showScreensaver() {
        currentState = TvScreenState.SCREENSAVER
        viewScreensaver.visibility = View.VISIBLE
        viewGuestActive.visibility = View.GONE
        viewDefaultMode.visibility = View.GONE
        viewPairing.visibility = View.GONE
        viewCheckoutDay.visibility = View.GONE
    }

    private fun sendHeartbeat() {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("hardwareId", getHardwareId())
                put("screenState", currentState.name)
                put("appVersion", "1.0.0")
                val ssid = getConnectedWifiSsid()
                if (ssid != null) put("connectedSsid", ssid)
            }
            socket?.emit("device.heartbeat", payload)
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Realtime Socket.IO Connection & Event Handlers
    // ═══════════════════════════════════════════════════════════
    private fun initSocketConnection() {
        try {
            val backendUrl = getBackendBaseUrl()
            val deviceToken = prefs.getString("device_token", null)
            val hardwareId = getHardwareId()

            val authJson = JSONObject().apply {
                put("deviceId", hardwareId)
                if (deviceToken != null) put("deviceToken", deviceToken)
            }

            val options = IO.Options.builder()
                .setReconnection(true)
                .setReconnectionAttempts(Int.MAX_VALUE)
                .setReconnectionDelay(2000)
                .setTimeout(10000)
                .setAuth(mapOf("deviceId" to hardwareId, "deviceToken" to (deviceToken ?: "")))
                .build()

            socket = IO.socket(backendUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "✅ Connected to SmartStay TV Backend Socket.IO")
                val connectedSsid = getConnectedWifiSsid()
                val regPayload = JSONObject().apply {
                    put("deviceId", hardwareId)
                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                }
                socket?.emit("device.register", regPayload)
            }

            // Listen for DEVICE PAIRED event
            val onDevicePaired = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val token = data.optString("deviceToken", "")
                        val room = data.optJSONObject("room")
                        val hotel = data.optJSONObject("hotel")
                        val roomNum = room?.optString("roomNumber", "101") ?: "101"
                        val hotelName = hotel?.optString("name", "SmartStay Hotel") ?: "SmartStay Hotel"

                        prefs.edit()
                            .putBoolean("is_paired", true)
                            .putString("device_token", token)
                            .putString("room_number", roomNum)
                            .putString("hotel_name", hotelName)
                            .apply()

                        runOnUiThread {
                            tvGuestHotelName.text = hotelName.uppercase(Locale.getDefault())
                            tvDefaultHotelTitle.text = hotelName
                            tvDefaultRoomLabel.text = "Room $roomNum"
                            tvGuestRoomBadge.text = "ROOM $roomNum"
                            showDefaultMode()
                            Toast.makeText(this@MainActivity, "Connected to $hotelName - Room $roomNum!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            socket?.on("device.paired") { onDevicePaired(it) }
            socket?.on("DEVICE_PAIRED") { onDevicePaired(it) }

            // GUEST CHECKED IN
            val onGuestCheckin = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val guestName = data.optString("guestName", "Guest")
                        val roomNum = data.optString("roomNumber", prefs.getString("room_number", "101") ?: "101")
                        val checkoutTime = data.optString("checkoutTime", "11:00 AM")

                        prefs.edit()
                            .putString("guest_name", guestName)
                            .putString("room_number", roomNum)
                            .putBoolean("is_paired", true)
                            .apply()

                        runOnUiThread {
                            showGuestActive(guestName, roomNum)
                            Toast.makeText(this@MainActivity, "Welcome, $guestName!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            socket?.on("guest.checked_in") { onGuestCheckin(it) }
            socket?.on("GUEST_CHECKED_IN") { onGuestCheckin(it) }

            // GUEST CHECKED OUT
            val onGuestCheckout = { _: Array<Any> ->
                prefs.edit().remove("guest_name").apply()
                runOnUiThread {
                    showDefaultMode()
                    Toast.makeText(this@MainActivity, "Room reset to Default Mode", Toast.LENGTH_SHORT).show()
                }
            }
            socket?.on("guest.checked_out") { onGuestCheckout(it) }
            socket?.on("GUEST_CHECKED_OUT") { onGuestCheckout(it) }

            // WI-FI CREDENTIALS UPDATED
            val onWifiUpdated = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val ssid = data.optString("networkName", data.optString("ssid", "SmartStay_Guest"))
                        val pass = data.optString("password", "")
                        val status = data.optString("status", "MATCHED")

                        prefs.edit().putString("wifi_ssid", ssid).putString("wifi_pass", pass).apply()
                        runOnUiThread {
                            if (status == "NOT_FOUND") {
                                tvGuestWifiSsid.text = "Wi-Fi not configured"
                                tvDefaultWifiName.text = "Wi-Fi not configured"
                            } else {
                                tvGuestWifiSsid.text = ssid
                                tvDefaultWifiName.text = ssid
                                generateWifiQr(ssid, pass)
                            }
                        }
                    }
                }
            }
            socket?.on("wifi.updated") { onWifiUpdated(it) }
            socket?.on("WIFI_UPDATED") { onWifiUpdated(it) }

            // SCREEN REFRESH / CONTENT UPDATED
            val onRefresh = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data?.optString("action") == "UNPAIRED") {
                        prefs.edit().putBoolean("is_paired", false).apply()
                        runOnUiThread {
                            requestPairingCodeFromBackend()
                        }
                    }
                }
            }
            socket?.on("screen.refresh") { onRefresh(it) }
            socket?.on("content.updated") { onRefresh(it) }

            // HOTEL SETTINGS / AMENITIES / PROFILE REAL-TIME UPDATES
            val onSettingsUpdated = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val type = data.optString("type")
                        if (type == "amenities") {
                            val arr = data.optJSONArray("data")
                            runOnUiThread { updateAmenitiesDisplay(arr) }
                        } else if (type == "hotel") {
                            val hData = data.optJSONObject("data")
                            val hName = hData?.optString("name")
                            val phone = hData?.optString("phone")
                            if (!hName.isNullOrEmpty()) {
                                prefs.edit().putString("hotel_name", hName).apply()
                                runOnUiThread {
                                    tvGuestHotelName.text = hName.uppercase(Locale.getDefault())
                                    tvDefaultHotelTitle.text = hName
                                }
                            }
                            if (!phone.isNullOrEmpty()) {
                                prefs.edit().putString("concierge_phone", phone).apply()
                                runOnUiThread {
                                    tvResConcierge.text = phone
                                }
                            }
                        } else if (type == "settings") {
                            val sData = data.optJSONObject("data")
                            val checkout = sData?.optString("checkOutTime")
                            val qStart = sData?.optString("quietHoursStart", "10:00 PM")
                            val qEnd = sData?.optString("quietHoursEnd", "7:00 AM")
                            if (!checkout.isNullOrEmpty()) {
                                prefs.edit().putString("checkout_time", checkout).apply()
                                runOnUiThread {
                                    tvResCheckoutTime.text = "By $checkout"
                                    tvCheckoutTimeHeadline.text = "Checkout Today by $checkout"
                                }
                            }
                            runOnUiThread {
                                val phone = prefs.getString("concierge_phone", "+91 40 2335 0101")
                                tvQuietHoursFooter.text = "Quiet Hours: $qStart – $qEnd • Front Desk: $phone"
                            }
                        }
                    }
                }
            }
            socket?.on("hotel.settings.updated") { onSettingsUpdated(it) }
            socket?.on("HOTEL_SETTINGS_UPDATED") { onSettingsUpdated(it) }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket.IO initialization error", e)
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Remote Control / D-Pad Remote Handling
    // ═══════════════════════════════════════════════════════════
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Wake up from screensaver on any key
        if (currentState == TvScreenState.SCREENSAVER) {
            val guestName = prefs.getString("guest_name", null)
            val roomNum = prefs.getString("room_number", "101") ?: "101"
            if (guestName != null) {
                showGuestActive(guestName, roomNum)
            } else {
                showDefaultMode()
            }
            return true
        }

        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                if (currentState == TvScreenState.GUEST_ACTIVE) {
                    launchEntertainmentApps()
                    return true
                }
            }
            KeyEvent.KEYCODE_MENU -> {
                if (currentState == TvScreenState.PAIRING) {
                    showDefaultMode()
                } else {
                    requestPairingCodeFromBackend()
                }
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun launchEntertainmentApps() {
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Smart TV Home Apps Ready", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(clockRunnable)
        handler.removeCallbacks(heartbeatRunnable)
        socket?.disconnect()
        socket?.off()
    }
}
