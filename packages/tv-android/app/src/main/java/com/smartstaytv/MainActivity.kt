package com.smartstaytv

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
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
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

enum class TvScreenState {
    PAIRING,
    STATE_HOTEL,      // Image 1: Welcome Hotel (Unoccupied)
    STATE_GUEST,      // Image 2: Welcome Guest (Occupied)
    STATE_CHECKOUT    // Image 3: Checkout Complete / Thank You
}

class MainActivity : AppCompatActivity() {

    private val TAG = "SmartStayTV"

    // Primary Containers
    private lateinit var viewPairing: View
    private lateinit var viewMainContainer: View

    // Headers
    private lateinit var headerHotel: RelativeLayout
    private lateinit var headerGuest: RelativeLayout
    private lateinit var headerCheckout: RelativeLayout

    // Header Views - State 1
    private lateinit var tvHotelName: TextView
    private lateinit var tvHotelTagline: TextView
    private lateinit var tvBadgeRoomHotel: TextView
    private lateinit var tvClockHotel: TextView
    private lateinit var tvDateHotel: TextView

    // Header Views - State 2
    private lateinit var tvGuestHotelMini: TextView
    private lateinit var tvGuestWelcomeName: TextView
    private lateinit var tvBadgeRoomGuest: TextView
    private lateinit var tvClockGuest: TextView
    private lateinit var tvDateGuest: TextView

    // Header Views - State 3
    private lateinit var tvCheckoutSub: TextView
    private lateinit var tvClockCheckout: TextView
    private lateinit var tvCheckoutRoomDeparture: TextView

    // Content Containers
    private lateinit var layoutStateHotel: LinearLayout
    private lateinit var layoutStateGuest: LinearLayout
    private lateinit var layoutStateCheckout: LinearLayout

    // State 1 Views
    private lateinit var tvHotelHospitalityDesc: TextView
    private lateinit var tvHotelCheckoutLabel: TextView
    private lateinit var tvHotelFrontDeskPhone: TextView
    private lateinit var ivHotelWifiQr: ImageView
    private lateinit var tvHotelWifiLabel: TextView
    private lateinit var tvHotelAmenitiesList: TextView

    // State 2 Views
    private lateinit var tvResGuestName: TextView
    private lateinit var tvResRoomNum: TextView
    private lateinit var tvResCheckoutVal: TextView
    private lateinit var ivGuestWifiQr: ImageView
    private lateinit var tvGuestWifiLabel: TextView
    private lateinit var tvGuestAmenitiesList: TextView

    // State 3 Views
    private lateinit var tvCheckoutLuggagePhone: TextView
    private lateinit var btnCheckoutReturn: Button

    // Footers
    private lateinit var footerNormal: RelativeLayout
    private lateinit var footerCheckout: RelativeLayout
    private lateinit var tvFooterQuietReception: TextView
    private lateinit var tvFooterWakeHint: TextView
    private lateinit var btnLaunchEntertainment: Button

    // Pairing & Settings Views
    private lateinit var tvPairingCode: TextView
    private lateinit var ivPairingQr: ImageView
    private lateinit var tvPairingStatus: TextView
    private lateinit var btnServerConfig: Button
    private lateinit var btnRetryPairing: Button
    private lateinit var btnFloatingSettings: ImageButton

    // State & Preferences
    private lateinit var prefs: SharedPreferences
    private var currentState: TvScreenState = TvScreenState.STATE_HOTEL
    private var socket: Socket? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private val handler = Handler(Looper.getMainLooper())
    private val clockRunnable = object : Runnable {
        override fun run() {
            updateClocks()
            handler.postDelayed(this, 10000)
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
        registerNetworkCallback()
        initSocketConnection()

        handler.post(clockRunnable)
        handler.postDelayed(heartbeatRunnable, 5000)
    }

    private fun bindViews() {
        viewPairing = findViewById(R.id.view_pairing)
        viewMainContainer = findViewById(R.id.view_main_container)

        // Strict Pairing Guard: On launch, ensure unpaired devices NEVER show hotel rooms
        val isPaired = prefs.getBoolean("is_paired", false)
        if (!isPaired) {
            viewPairing.visibility = View.VISIBLE
            viewMainContainer.visibility = View.GONE
        } else {
            viewPairing.visibility = View.GONE
            viewMainContainer.visibility = View.VISIBLE
        }

        // Headers
        headerHotel = findViewById(R.id.header_hotel)
        headerGuest = findViewById(R.id.header_guest)
        headerCheckout = findViewById(R.id.header_checkout)

        // Header 1
        tvHotelName = findViewById(R.id.tv_hotel_name)
        tvHotelTagline = findViewById(R.id.tv_hotel_tagline)
        tvBadgeRoomHotel = findViewById(R.id.tv_badge_room_hotel)
        tvClockHotel = findViewById(R.id.tv_clock_hotel)
        tvDateHotel = findViewById(R.id.tv_date_hotel)

        // Header 2
        tvGuestHotelMini = findViewById(R.id.tv_guest_hotel_mini)
        tvGuestWelcomeName = findViewById(R.id.tv_guest_welcome_name)
        tvBadgeRoomGuest = findViewById(R.id.tv_badge_room_guest)
        tvClockGuest = findViewById(R.id.tv_clock_guest)
        tvDateGuest = findViewById(R.id.tv_date_guest)

        // Header 3
        tvCheckoutSub = findViewById(R.id.tv_checkout_sub)
        tvClockCheckout = findViewById(R.id.tv_clock_checkout)
        tvCheckoutRoomDeparture = findViewById(R.id.tv_checkout_room_departure)

        // Content
        layoutStateHotel = findViewById(R.id.layout_state_hotel)
        layoutStateGuest = findViewById(R.id.layout_state_guest)
        layoutStateCheckout = findViewById(R.id.layout_state_checkout)

        // State 1 Views
        tvHotelHospitalityDesc = findViewById(R.id.tv_hotel_hospitality_desc)
        tvHotelCheckoutLabel = findViewById(R.id.tv_hotel_checkout_label)
        tvHotelFrontDeskPhone = findViewById(R.id.tv_hotel_front_desk_phone)
        ivHotelWifiQr = findViewById(R.id.iv_hotel_wifi_qr)
        tvHotelWifiLabel = findViewById(R.id.tv_hotel_wifi_label)
        tvHotelAmenitiesList = findViewById(R.id.tv_hotel_amenities_list)

        // State 2 Views
        tvResGuestName = findViewById(R.id.tv_res_guest_name)
        tvResRoomNum = findViewById(R.id.tv_res_room_num)
        tvResCheckoutVal = findViewById(R.id.tv_res_checkout_val)
        ivGuestWifiQr = findViewById(R.id.iv_guest_wifi_qr)
        tvGuestWifiLabel = findViewById(R.id.tv_guest_wifi_label)
        tvGuestAmenitiesList = findViewById(R.id.tv_guest_amenities_list)

        // State 3 Views
        tvCheckoutLuggagePhone = findViewById(R.id.tv_checkout_luggage_phone)
        btnCheckoutReturn = findViewById(R.id.btn_checkout_return)

        // Footers
        footerNormal = findViewById(R.id.footer_normal)
        footerCheckout = findViewById(R.id.footer_checkout)
        tvFooterQuietReception = findViewById(R.id.tv_footer_quiet_reception)
        tvFooterWakeHint = findViewById(R.id.tv_footer_wake_hint)
        btnLaunchEntertainment = findViewById(R.id.btn_launch_entertainment)

        // Pairing & Floating Settings
        tvPairingCode = findViewById(R.id.tv_pairing_code)
        ivPairingQr = findViewById(R.id.iv_pairing_qr)
        tvPairingStatus = findViewById(R.id.tv_pairing_status)
        btnServerConfig = findViewById(R.id.btn_server_config)
        btnRetryPairing = findViewById(R.id.btn_retry_pairing)
        btnFloatingSettings = findViewById(R.id.btn_floating_settings)
    }

    private fun setupListeners() {
        btnLaunchEntertainment.setOnClickListener {
            dismissToTvHome()
        }
        btnCheckoutReturn.setOnClickListener {
            showStateHotel()
        }
        btnServerConfig.setOnClickListener {
            showServerConfigDialog()
        }
        btnRetryPairing.setOnClickListener {
            Toast.makeText(this, "Connecting to server...", Toast.LENGTH_SHORT).show()
            requestPairingCodeFromBackend()
        }
        btnFloatingSettings.setOnClickListener {
            showServerConfigDialog()
        }
        // Allow mobile testers to tap the top hotel headers to open server settings
        headerHotel.setOnClickListener { showServerConfigDialog() }
        headerGuest.setOnClickListener { showServerConfigDialog() }
        headerCheckout.setOnClickListener { showServerConfigDialog() }
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

    private fun registerNetworkCallback() {
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()
            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    runOnUiThread { reportConnectedSsidToBackend() }
                }
                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    runOnUiThread { reportConnectedSsidToBackend() }
                }
                override fun onLost(network: Network) {
                    runOnUiThread { reportConnectedSsidToBackend() }
                }
            }
            cm.registerNetworkCallback(request, networkCallback!!)
        } catch (e: Exception) {
            Log.w(TAG, "NetworkCallback registration error: ${e.message}")
        }
    }

    private fun reportConnectedSsidToBackend() {
        val ssid = getConnectedWifiSsid()
        if (!ssid.isNullOrEmpty()) {
            Log.i(TAG, "Detected connected Wi-Fi SSID: $ssid")
            socket?.emit("device.wifi.reported", JSONObject().apply {
                put("deviceId", getHardwareId())
                put("connectedSsid", ssid)
            })
        }
    }

    private fun getConnectedWifiSsid(): String? {
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && cm != null) {
                val network = cm.activeNetwork
                val capabilities = cm.getNetworkCapabilities(network)
                if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    val transportInfo = capabilities.transportInfo
                    if (transportInfo is WifiInfo) {
                        val ssid = transportInfo.ssid?.replace("\"", "")?.trim()
                        if (!ssid.isNullOrEmpty() && ssid != "<unknown ssid>" && ssid != "0x") {
                            return ssid
                        }
                    }
                }
            }
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val info = wifiManager?.connectionInfo
            val rawSsid = info?.ssid?.replace("\"", "")?.trim()
            if (!rawSsid.isNullOrEmpty() && rawSsid != "<unknown ssid>" && rawSsid != "0x") {
                return rawSsid
            }
        } catch (e: Exception) {
            Log.w(TAG, "Cannot access Wi-Fi SSID: ${e.message}")
        }
        return null
    }

    private fun getBackendBaseUrl(): String {
        val saved = prefs.getString("backend_url", null)
        if (!saved.isNullOrBlank()) {
            return saved.trim().removeSuffix("/")
        }
        return BuildConfig.DEFAULT_BACKEND_URL.trim().removeSuffix("/")
    }

    private fun updateClocks() {
        val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
        val dateFormat = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
        val now = Date()
        val timeStr = timeFormat.format(now)
        val dateStr = dateFormat.format(now)

        tvClockHotel.text = timeStr
        tvDateHotel.text = dateStr
        tvClockGuest.text = timeStr
        tvDateGuest.text = dateStr
        tvClockCheckout.text = timeStr
    }

    private fun loadSavedConfig() {
        val isPaired = prefs.getBoolean("is_paired", false)
        val hotelName = prefs.getString("hotel_name", "risky resto") ?: "risky resto"
        val tagline = prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality."
        val roomNumber = prefs.getString("room_number", "122") ?: "122"
        val wifiSsid = prefs.getString("wifi_ssid", "risky_resto_Guest") ?: "risky_resto_Guest"
        val wifiPass = prefs.getString("wifi_pass", "") ?: ""
        val wifiStatus = prefs.getString("wifi_status", "MATCHED") ?: "MATCHED"
        val guestName = prefs.getString("guest_name", null)
        val checkoutTime = prefs.getString("checkout_time", "11:00") ?: "11:00"
        val conciergePhone = prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884"
        val quietHours = prefs.getString("quiet_hours", "22:00 – 07:00") ?: "22:00 – 07:00"
        val amenities = prefs.getString("amenities_cached", "• Fitness Center (24/7)\n• Valet Parking (Complimentary)\n• 24/7 Room Service (Dial 9)")

        // Populate Static / Shared Views
        tvHotelName.text = hotelName
        tvHotelTagline.text = tagline
        tvGuestHotelMini.text = hotelName.uppercase(Locale.getDefault())
        tvBadgeRoomHotel.text = "ROOM $roomNumber"
        tvBadgeRoomGuest.text = roomNumber
        tvCheckoutRoomDeparture.text = "Room $roomNumber • Departure"
        tvCheckoutSub.text = "We hope you had a pleasant stay at $hotelName."

        tvHotelHospitalityDesc.text = "Welcome to $hotelName. Our property features state-of-the-art guest rooms and 24/7 dedicated reception."
        tvHotelCheckoutLabel.text = "✓ Standard Check-out: $checkoutTime"
        tvHotelFrontDeskPhone.text = "Front Desk Direct: $conciergePhone"
        tvCheckoutLuggagePhone.text = "📞 Need luggage or airport transfer assistance? Reception: $conciergePhone"
        tvFooterQuietReception.text = "Quiet Hours: $quietHours • Reception / Front Desk: $conciergePhone"

        tvHotelAmenitiesList.text = amenities
        tvGuestAmenitiesList.text = amenities

        tvResRoomNum.text = roomNumber
        tvResCheckoutVal.text = "By $checkoutTime"

        renderWifiDetails(wifiSsid, wifiPass, wifiStatus)
        updateClocks()

        if (!isPaired) {
            requestPairingCodeFromBackend()
        } else if (!guestName.isNullOrEmpty()) {
            showStateGuest(guestName, roomNumber)
        } else {
            showStateHotel()
        }
    }

    private fun renderWifiDetails(ssid: String, pass: String, status: String) {
        val isValid = (status == "MATCHED" || status == "ROOM_ZONE") && ssid.isNotEmpty()
        if (isValid) {
            tvHotelWifiLabel.text = "Connect WiFi"
            tvGuestWifiLabel.text = "Connect WiFi"
            val qrString = if (pass.isEmpty()) "WIFI:S:$ssid;;" else "WIFI:S:$ssid;T:WPA;P:$pass;;"
            try {
                val encoder = BarcodeEncoder()
                val bitmap: Bitmap = encoder.encodeBitmap(qrString, BarcodeFormat.QR_CODE, 450, 450)
                ivHotelWifiQr.setImageBitmap(bitmap)
                ivGuestWifiQr.setImageBitmap(bitmap)
            } catch (e: Exception) {
                Log.e(TAG, "QR Code render error: ${e.message}")
            }
        } else {
            ivHotelWifiQr.setImageDrawable(null)
            ivGuestWifiQr.setImageDrawable(null)
            val fallbackLabel = if (status == "CONNECTED_UNMATCHED") "Zone Unregistered" else "Wi-Fi Not Configured"
            tvHotelWifiLabel.text = fallbackLabel
            tvGuestWifiLabel.text = fallbackLabel
        }
    }

    // ─── STATE SWITCHERS (The Exact 3 States from Images 1, 2, 3) ───

    /** STATE 1: WELCOME HOTEL (Unoccupied) — Matches Image 1 */
    private fun showStateHotel() {
        currentState = TvScreenState.STATE_HOTEL
        viewPairing.visibility = View.GONE
        viewMainContainer.visibility = View.VISIBLE

        headerHotel.visibility = View.VISIBLE
        headerGuest.visibility = View.GONE
        headerCheckout.visibility = View.GONE

        layoutStateHotel.visibility = View.VISIBLE
        layoutStateGuest.visibility = View.GONE
        layoutStateCheckout.visibility = View.GONE

        footerNormal.visibility = View.VISIBLE
        footerCheckout.visibility = View.GONE
        tvFooterWakeHint.visibility = View.VISIBLE
        btnLaunchEntertainment.visibility = View.GONE
    }

    /** STATE 2: WELCOME GUEST (Occupied) — Matches Image 2 */
    private fun showStateGuest(guestName: String, roomNumber: String) {
        currentState = TvScreenState.STATE_GUEST
        viewPairing.visibility = View.GONE
        viewMainContainer.visibility = View.VISIBLE

        headerGuest.visibility = View.VISIBLE
        headerHotel.visibility = View.GONE
        headerCheckout.visibility = View.GONE

        tvGuestWelcomeName.text = "Welcome, $guestName!"
        tvResGuestName.text = guestName
        tvResRoomNum.text = roomNumber
        tvBadgeRoomGuest.text = roomNumber

        layoutStateGuest.visibility = View.VISIBLE
        layoutStateHotel.visibility = View.GONE
        layoutStateCheckout.visibility = View.GONE

        footerNormal.visibility = View.VISIBLE
        footerCheckout.visibility = View.GONE
        btnLaunchEntertainment.visibility = View.VISIBLE
        tvFooterWakeHint.visibility = View.GONE
        btnLaunchEntertainment.requestFocus()
    }

    /** STATE 3: CHECKOUT THANK YOU — Matches Image 3 */
    private fun showStateCheckout() {
        currentState = TvScreenState.STATE_CHECKOUT
        viewPairing.visibility = View.GONE
        viewMainContainer.visibility = View.VISIBLE

        headerCheckout.visibility = View.VISIBLE
        headerHotel.visibility = View.GONE
        headerGuest.visibility = View.GONE

        layoutStateCheckout.visibility = View.VISIBLE
        layoutStateHotel.visibility = View.GONE
        layoutStateGuest.visibility = View.GONE

        footerCheckout.visibility = View.VISIBLE
        footerNormal.visibility = View.GONE
        btnCheckoutReturn.requestFocus()
    }

    private fun showPairingScreen(code: String) {
        currentState = TvScreenState.PAIRING
        viewPairing.visibility = View.VISIBLE
        viewMainContainer.visibility = View.GONE

        tvPairingCode.text = code
        try {
            val encoder = BarcodeEncoder()
            val bitmap = encoder.encodeBitmap("smartstaytv://pair?code=$code", BarcodeFormat.QR_CODE, 240, 240)
            ivPairingQr.setImageBitmap(bitmap)
        } catch (e: Exception) {
            Log.e(TAG, "Pairing QR error", e)
        }
    }

    private fun requestPairingCodeFromBackend() {
        val hardwareId = getHardwareId()
        val baseUrl = getBackendBaseUrl()
        val url = "$baseUrl/api/v1/devices/pairing/initiate"

        runOnUiThread {
            currentState = TvScreenState.PAIRING
            viewPairing.visibility = View.VISIBLE
            viewMainContainer.visibility = View.GONE
            tvPairingCode.text = "......"
            tvPairingStatus.text = "● Requesting code from $baseUrl..."
            tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#38BDF8"))
        }

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
                runOnUiThread {
                    tvPairingCode.text = "OFFLINE"
                    tvPairingStatus.text = "❌ Cannot reach server (${e.message ?: "Network error"}). Tap ⚙ Server Settings to configure URL."
                    tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#F87171"))
                    ivPairingQr.setImageDrawable(null)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                try {
                    val respStr = response.body?.string() ?: ""
                    if (!response.isSuccessful) {
                        runOnUiThread {
                            tvPairingCode.text = "ERR ${response.code}"
                            tvPairingStatus.text = "❌ Server error (HTTP ${response.code}). Check database or tap ⚙ Server Settings."
                            tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#F87171"))
                            ivPairingQr.setImageDrawable(null)
                        }
                        return
                    }
                    val root = JSONObject(respStr)
                    val data = root.optJSONObject("data")
                    val code = data?.optString("code")
                    if (code.isNullOrEmpty()) {
                        runOnUiThread {
                            tvPairingCode.text = "ERROR"
                            tvPairingStatus.text = "❌ Invalid server response format. Tap ⚙ Server Settings."
                            tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#F87171"))
                            ivPairingQr.setImageDrawable(null)
                        }
                        return
                    }
                    prefs.edit().putString("pairing_code", code).apply()
                    runOnUiThread {
                        showPairingScreen(code)
                        tvPairingStatus.text = "● Waiting for hotel staff authorization..."
                        tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#34D399"))
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        tvPairingCode.text = "ERROR"
                        tvPairingStatus.text = "❌ Parse error: ${e.message}"
                        tvPairingStatus.setTextColor(android.graphics.Color.parseColor("#F87171"))
                        ivPairingQr.setImageDrawable(null)
                    }
                }
            }
        })
    }

    /**
     * Real-time dynamic payload applicator.
     * Updates everything on screen when backend pushes new settings, Wi-Fi or occupancy.
     */
    private fun applyServerTvPayload(data: JSONObject) {
        try {
            val hotelName = if (data.has("name") && !data.isNull("name")) {
                data.optString("name", "risky resto")
            } else {
                data.optJSONObject("hotel")?.optString("name", "risky resto") ?: "risky resto"
            }
            val roomObj = data.optJSONObject("room")
            val roomNum = roomObj?.optString("number", roomObj.optString("roomNumber", prefs.getString("room_number", "122") ?: "122")) ?: "122"

            val settings = data.optJSONObject("settings")
            val checkout = settings?.optString("checkOutTime", "11:00") ?: "11:00"
            val phone = settings?.optString("receptionPhone", "+91 85559 72884") ?: "+91 85559 72884"
            val qStart = settings?.optString("quietHoursStart", "22:00") ?: "22:00"
            val qEnd = settings?.optString("quietHoursEnd", "07:00") ?: "07:00"
            val quietHours = "$qStart – $qEnd"

            val wifi = data.optJSONObject("wifi")
            val wifiSsid = wifi?.optString("networkName", "") ?: ""
            val wifiPass = wifi?.optString("password", "") ?: ""
            val wifiStatus = wifi?.optString("status", "MATCHED") ?: "MATCHED"

            // Save to prefs
            prefs.edit().apply {
                putString("hotel_name", hotelName)
                putString("room_number", roomNum)
                putString("checkout_time", checkout)
                putString("concierge_phone", phone)
                putString("quiet_hours", quietHours)
                putString("wifi_ssid", wifiSsid)
                putString("wifi_pass", wifiPass)
                putString("wifi_status", wifiStatus)
            }.apply()

            // Update UI
            tvHotelName.text = hotelName
            tvGuestHotelMini.text = hotelName.uppercase(Locale.getDefault())
            tvBadgeRoomHotel.text = "ROOM $roomNum"
            tvBadgeRoomGuest.text = roomNum
            tvResRoomNum.text = roomNum
            tvCheckoutRoomDeparture.text = "Room $roomNum • Departure"
            tvHotelHospitalityDesc.text = "Welcome to $hotelName. Our property features state-of-the-art guest rooms and 24/7 dedicated reception."
            tvHotelCheckoutLabel.text = "✓ Standard Check-out: $checkout"
            tvResCheckoutVal.text = "By $checkout"
            tvHotelFrontDeskPhone.text = "Front Desk Direct: $phone"
            tvCheckoutLuggagePhone.text = "📞 Need luggage or airport transfer assistance? Reception: $phone"
            tvFooterQuietReception.text = "Quiet Hours: $quietHours • Reception / Front Desk: $phone"

            renderWifiDetails(wifiSsid, wifiPass, wifiStatus)

            // Amenities
            val amenitiesArr = data.optJSONArray("amenities")
            if (amenitiesArr != null && amenitiesArr.length() > 0) {
                val sb = StringBuilder()
                for (i in 0 until minOf(amenitiesArr.length(), 4)) {
                    val a = amenitiesArr.optJSONObject(i) ?: continue
                    val name = a.optString("name", "")
                    if (name.isNotEmpty()) sb.append("• ").append(name).append("\n")
                }
                val text = sb.toString().trim()
                if (text.isNotEmpty()) {
                    tvHotelAmenitiesList.text = text
                    tvGuestAmenitiesList.text = text
                    prefs.edit().putString("amenities_cached", text).apply()
                }
            }

            // Guard: Only transition out of pairing screen if device has been paired by hotel staff
            val isPaired = prefs.getBoolean("is_paired", false)
            if (!isPaired) {
                Log.d(TAG, "Device is not yet paired with a room. Remaining on pairing screen.")
                return
            }

            // Occupancy (Guest Check-in state)
            val guest = data.optJSONObject("guest")
            if (guest != null && !guest.optString("name", "").isNullOrEmpty()) {
                val guestName = guest.optString("name", "Guest")
                val guestCheckout = guest.optString("checkoutTime", checkout)
                prefs.edit().putString("guest_name", guestName).putString("checkout_time", guestCheckout).apply()
                showStateGuest(guestName, roomNum)
            } else {
                prefs.edit().remove("guest_name").apply()
                showStateHotel()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error applying server TV payload", e)
        }
    }

    private fun initSocketConnection() {
        try {
            val backendUrl = getBackendBaseUrl()
            val deviceToken = prefs.getString("device_token", null)
            val hardwareId = getHardwareId()

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
                socket?.emit("device.register", JSONObject().apply {
                    put("deviceId", hardwareId)
                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                })
                socket?.emit("device.request_sync", JSONObject().apply {
                    put("deviceId", hardwareId)
                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                })
            }

            // REAL-TIME PAIRING CONFIRMATION
            val onPaired = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val token = data.optString("deviceToken", "")
                        val roomObj = data.optJSONObject("room")
                        val roomNum = roomObj?.optString("roomNumber", "122") ?: "122"
                        prefs.edit()
                            .putBoolean("is_paired", true)
                            .putString("room_number", roomNum)
                            .apply()
                        if (token.isNotEmpty()) {
                            prefs.edit().putString("device_token", token).apply()
                        }
                        runOnUiThread {
                            showStateHotel()
                            val connectedSsid = getConnectedWifiSsid()
                            socket?.emit("device.request_sync", JSONObject().apply {
                                put("deviceId", hardwareId)
                                if (connectedSsid != null) put("connectedSsid", connectedSsid)
                            })
                        }
                    }
                }
            }
            socket?.on("device.paired") { onPaired(it) }
            socket?.on("DEVICE_PAIRED") { onPaired(it) }

            // REAL-TIME GUEST CHECK-IN
            val onGuestCheckin = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val isPaired = prefs.getBoolean("is_paired", false)
                        if (!isPaired) {
                            Log.d(TAG, "Device is not yet paired; ignoring guest.checked_in")
                            return@onGuestCheckin
                        }
                        val myRoom = prefs.getString("room_number", "")
                        val targetRoom = data.optString("roomNumber", "")
                        if (!myRoom.isNullOrEmpty() && targetRoom.isNotEmpty() && myRoom != targetRoom) {
                            Log.d(TAG, "Ignoring check-in: room mismatch ($myRoom vs $targetRoom)")
                            return@onGuestCheckin
                        }

                        val guestObj = data.optJSONObject("guest")
                        val guestName = if (data.has("guestName")) {
                            data.optString("guestName", "Guest")
                        } else {
                            guestObj?.optString("name", guestObj.optString("firstName", "Guest")) ?: "Guest"
                        }
                        val roomNum = data.optString("roomNumber", prefs.getString("room_number", "122") ?: "122")
                        val checkoutTime = data.optString("checkoutTime", "11:00")

                        prefs.edit()
                            .putString("guest_name", guestName)
                            .putString("room_number", roomNum)
                            .putString("checkout_time", checkoutTime)
                            .putBoolean("is_paired", true)
                            .apply()

                        runOnUiThread {
                            showStateGuest(guestName, roomNum)
                            Toast.makeText(this@MainActivity, "Welcome, $guestName!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            socket?.on("guest.checked_in") { onGuestCheckin(it) }
            socket?.on("GUEST_CHECKED_IN") { onGuestCheckin(it) }

            // REAL-TIME GUEST CHECKOUT
            val onGuestCheckout = { args: Array<Any> ->
                val isPaired = prefs.getBoolean("is_paired", false)
                if (!isPaired) {
                    Log.d(TAG, "Device is not yet paired; ignoring checkout")
                    return@onGuestCheckout
                }
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val myRoom = prefs.getString("room_number", "")
                    val targetRoom = data?.optString("roomNumber", "")
                    if (!myRoom.isNullOrEmpty() && !targetRoom.isNullOrEmpty() && myRoom != targetRoom) {
                        Log.d(TAG, "Ignoring checkout: room mismatch ($myRoom vs $targetRoom)")
                        return@onGuestCheckout
                    }
                }
                prefs.edit().remove("guest_name").apply()
                runOnUiThread {
                    showStateCheckout()
                    handler.postDelayed({
                        if (currentState == TvScreenState.STATE_CHECKOUT) {
                            showStateHotel()
                        }
                    }, 8000)
                }
            }
            socket?.on("guest.checked_out") { onGuestCheckout(it) }
            socket?.on("GUEST_CHECKED_OUT") { onGuestCheckout(it) }

            // WI-FI CREDENTIALS UPDATE
            val onWifiUpdated = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val ssid = data.optString("networkName", data.optString("ssid", ""))
                        val pass = data.optString("password", "")
                        val status = data.optString("status", "MATCHED")
                        prefs.edit().putString("wifi_ssid", ssid).putString("wifi_pass", pass).putString("wifi_status", status).apply()
                        runOnUiThread { renderWifiDetails(ssid, pass, status) }
                    }
                }
            }
            socket?.on("wifi.updated") { onWifiUpdated(it) }
            socket?.on("WIFI_UPDATED") { onWifiUpdated(it) }

            // CONTENT / CONFIG UPDATE
            val onRefresh = { args: Array<Any> ->
                val isPaired = prefs.getBoolean("is_paired", false)
                if (!isPaired) {
                    Log.d(TAG, "Device is not yet paired; ignoring refresh")
                    return@onRefresh
                }
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null && (data.has("hotel") || data.has("name") || data.has("settings"))) {
                        runOnUiThread { applyServerTvPayload(data) }
                    } else {
                        val connectedSsid = getConnectedWifiSsid()
                        socket?.emit("device.request_sync", JSONObject().apply {
                            put("deviceId", hardwareId)
                            if (connectedSsid != null) put("connectedSsid", connectedSsid)
                        })
                    }
                } else {
                    val connectedSsid = getConnectedWifiSsid()
                    socket?.emit("device.request_sync", JSONObject().apply {
                        put("deviceId", hardwareId)
                        if (connectedSsid != null) put("connectedSsid", connectedSsid)
                    })
                }
            }
            socket?.on("screen.refresh") { onRefresh(it) }
            socket?.on("content.updated") { onRefresh(it) }
            socket?.on("CONTENT_UPDATED") { onRefresh(it) }
            socket?.on("hotel.settings.updated") { onRefresh(it) }
            socket?.on("hotel.screensaver.updated") { onRefresh(it) }

            // REMOTE DEVICE COMMANDS
            socket?.on("device.command") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val cmd = data?.optString("command", "")
                    val ack = if (args.size > 1) args[args.size - 1] as? io.socket.client.Ack else null
                    if (cmd == "CLEAR_GUEST") {
                        prefs.edit().remove("guest_name").apply()
                        runOnUiThread { showStateHotel() }
                    }
                    ack?.call(JSONObject().apply { put("status", "SUCCESS") })
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket.IO initialization error", e)
        }
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

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_BACK -> {
                if (currentState == TvScreenState.STATE_GUEST || currentState == TvScreenState.STATE_HOTEL) {
                    dismissToTvHome()
                    return true
                }
            }
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS -> {
                showServerConfigDialog()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun dismissToTvHome() {
        try {
            val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(homeIntent)
        } catch (e: Exception) {
            try {
                val leanbackIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(leanbackIntent)
            } catch (ex: Exception) {
                moveTaskToBack(true)
            }
        }
    }

    private fun showServerConfigDialog() {
        val currentUrl = getBackendBaseUrl()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 20, 40, 20)
        }

        val tvStatus = TextView(this).apply {
            val isConn = socket?.connected() == true
            text = "Active Server: $currentUrl\nWebSocket Status: ${if (isConn) "🟢 Connected" else "🔴 Disconnected"}"
            textSize = 12f
            setTextColor(android.graphics.Color.LTGRAY)
            setPadding(0, 0, 0, 16)
        }
        layout.addView(tvStatus)

        val input = android.widget.EditText(this).apply {
            hint = "Enter Backend URL"
            setText(currentUrl)
            setSelection(text.length)
        }
        layout.addView(input)

        // Presets container
        val presetsLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 16, 0, 8)
        }

        val btnRender = Button(this).apply {
            text = "☁️ Render Cloud"
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                input.setText("https://hotel-tv-management.onrender.com")
                input.setSelection(input.text.length)
            }
        }
        presetsLayout.addView(btnRender)

        val btnLocal = Button(this).apply {
            text = "💻 Local PC"
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                input.setText("http://192.168.29.219:4000")
                input.setSelection(input.text.length)
            }
        }
        presetsLayout.addView(btnLocal)
        layout.addView(presetsLayout)

        // Test server connection
        val btnTest = Button(this).apply {
            text = "⚡ Test Server Connection (/health)"
            setOnClickListener {
                val target = input.text.toString().trim().removeSuffix("/") + "/health"
                Toast.makeText(this@MainActivity, "Pinging $target...", Toast.LENGTH_SHORT).show()
                val req = Request.Builder().url(target).get().build()
                httpClient.newCall(req).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "❌ Ping Failed: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                    override fun onResponse(call: Call, response: Response) {
                        val body = response.body?.string() ?: ""
                        runOnUiThread {
                            if (response.isSuccessful) {
                                Toast.makeText(this@MainActivity, "✅ Success! HTTP ${response.code}: $body", Toast.LENGTH_LONG).show()
                            } else {
                                Toast.makeText(this@MainActivity, "⚠️ Server returned HTTP ${response.code}", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                })
            }
        }
        layout.addView(btnTest)

        // Reset & Unpair Button
        val btnUnpair = Button(this).apply {
            text = "🔄 Reset & Unpair (Generate Fresh Code)"
            setOnClickListener {
                prefs.edit()
                    .remove("is_paired")
                    .remove("device_token")
                    .remove("room_number")
                    .remove("guest_name")
                    .remove("pairing_code")
                    .apply()
                socket?.disconnect()
                socket?.off()
                initSocketConnection()
                requestPairingCodeFromBackend()
                Toast.makeText(this@MainActivity, "Device unlinked. Fetching fresh pairing code...", Toast.LENGTH_SHORT).show()
            }
        }
        layout.addView(btnUnpair)

        val btnScreensaver = Button(this).apply {
            text = "⚙ Configure Daydream Screensaver"
            setOnClickListener {
                try {
                    startActivity(Intent(Settings.ACTION_DREAM_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK })
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Open Settings > Device Preferences > Screen saver", Toast.LENGTH_SHORT).show()
                }
            }
        }
        layout.addView(btnScreensaver)

        android.app.AlertDialog.Builder(this)
            .setTitle("SmartStay TV Configuration")
            .setView(layout)
            .setPositiveButton("Save & Reconnect") { _, _ ->
                val newUrl = input.text.toString().trim().removeSuffix("/")
                if (newUrl.isNotEmpty()) {
                    prefs.edit().putString("backend_url", newUrl).apply()
                    socket?.disconnect()
                    socket?.off()
                    initSocketConnection()
                    requestPairingCodeFromBackend()
                    Toast.makeText(this@MainActivity, "Reconnecting to: $newUrl", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Close", null)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(clockRunnable)
        handler.removeCallbacks(heartbeatRunnable)
        if (networkCallback != null) {
            try {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                cm?.unregisterNetworkCallback(networkCallback!!)
            } catch (e: Exception) {}
        }
        socket?.disconnect()
        socket?.off()
    }
}
