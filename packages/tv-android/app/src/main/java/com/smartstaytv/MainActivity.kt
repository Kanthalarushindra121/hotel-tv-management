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
    private var tvCheckoutStep1: TextView? = null
    private var tvCheckoutStep2: TextView? = null
    private var tvCheckoutStep3: TextView? = null

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

    // Screensaver Dynamic Views
    private var layoutBadgeRoomHotel: View? = null
    private var layoutBadgeRoomGuest: View? = null
    private var cardHotelAmenities: View? = null
    private var cardGuestAmenities: View? = null

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
        tvCheckoutStep1 = findViewById(R.id.tv_checkout_step_1)
        tvCheckoutStep2 = findViewById(R.id.tv_checkout_step_2)
        tvCheckoutStep3 = findViewById(R.id.tv_checkout_step_3)

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

        // Dynamic Screensaver Elements
        layoutBadgeRoomHotel = findViewById(R.id.layout_badge_room_hotel)
        layoutBadgeRoomGuest = findViewById(R.id.layout_badge_room_guest)
        cardHotelAmenities = findViewById(R.id.card_hotel_amenities)
        cardGuestAmenities = findViewById(R.id.card_guest_amenities)
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

    private fun applyScreensaverVisibility() {
        val showClock = prefs.getBoolean("ss_show_clock", true)
        val showDate = prefs.getBoolean("ss_show_date", true)
        val showRoom = prefs.getBoolean("ss_show_room", true)
        val showHotelLogo = prefs.getBoolean("ss_show_hotel_logo", true)
        val showFacilities = prefs.getBoolean("ss_show_facilities", true)

        tvClockHotel.visibility = if (showClock) View.VISIBLE else View.GONE
        tvClockGuest.visibility = if (showClock) View.VISIBLE else View.GONE
        tvClockCheckout.visibility = if (showClock) View.VISIBLE else View.GONE

        tvDateHotel.visibility = if (showDate) View.VISIBLE else View.GONE
        tvDateGuest.visibility = if (showDate) View.VISIBLE else View.GONE

        layoutBadgeRoomHotel?.visibility = if (showRoom) View.VISIBLE else View.GONE
        layoutBadgeRoomGuest?.visibility = if (showRoom) View.VISIBLE else View.GONE

        tvHotelName.visibility = if (showHotelLogo) View.VISIBLE else View.INVISIBLE
        tvGuestHotelMini.visibility = if (showHotelLogo) View.VISIBLE else View.GONE

        cardHotelAmenities?.visibility = if (showFacilities) View.VISIBLE else View.INVISIBLE
        cardGuestAmenities?.visibility = if (showFacilities) View.VISIBLE else View.INVISIBLE
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

        applyScreensaverVisibility()

        // AUTOMATIC CHECKOUT DISPLAY LOGIC
        try {
            val isPaired = prefs.getBoolean("is_paired", false)
            val guestName = prefs.getString("guest_name", null)
            val checkoutTs = prefs.getLong("guest_checkout_ts", 0L)
            val alreadyTriggered = prefs.getBoolean("checkout_screen_triggered", false)

            if (isPaired && !guestName.isNullOrEmpty() && checkoutTs > 0L && !alreadyTriggered) {
                val stayType = prefs.getString("stay_type", "FIXED") ?: "FIXED"
                val advMinutes = when (stayType.uppercase(Locale.getDefault())) {
                    "HOURLY" -> prefs.getInt("checkout_adv_hourly", 20)
                    "CUSTOM" -> prefs.getInt("checkout_adv_custom", 120)
                    else -> prefs.getInt("checkout_adv_fixed", 120)
                }
                val triggerAt = checkoutTs - (advMinutes * 60 * 1000L)
                val nowTime = System.currentTimeMillis()
                // Trigger when time arrives and not past 24 hours of checkout
                if (nowTime >= triggerAt && nowTime < checkoutTs + (24 * 3600 * 1000L)) {
                    prefs.edit().putBoolean("checkout_screen_triggered", true).apply()
                    if (currentState != TvScreenState.STATE_CHECKOUT) {
                        Log.d(TAG, "Automatic advance checkout screen triggered ($stayType, $advMinutes mins before)")
                        showStateCheckout()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating automatic checkout trigger", e)
        }
    }

    private fun loadSavedConfig() {
        val isPaired = prefs.getBoolean("is_paired", false)
        val hotelName = prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad"
        val tagline = prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality."
        val roomNumber = prefs.getString("room_number", "") ?: ""
        val wifiSsid = prefs.getString("wifi_ssid", "") ?: ""
        val wifiPass = prefs.getString("wifi_pass", "") ?: ""
        val wifiStatus = prefs.getString("wifi_status", "MATCHED") ?: "MATCHED"
        val guestName = prefs.getString("guest_name", null)
        val checkoutTime = prefs.getString("checkout_time", "11:00 AM") ?: "11:00 AM"
        val conciergePhone = prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884"
        val quietHours = prefs.getString("quiet_hours", "22:00 – 07:00") ?: "22:00 – 07:00"
        val amenities = prefs.getString("amenities_cached", "• Fitness Center (24/7)\n• Valet Parking (Complimentary)\n• 24/7 Room Service (Dial 9)")

        // Populate Static / Shared Views
        tvHotelName.text = hotelName
        tvHotelTagline.text = tagline
        tvGuestHotelMini.text = hotelName.uppercase(Locale.getDefault())
        tvBadgeRoomHotel.text = if (roomNumber.isNotEmpty()) "ROOM $roomNumber" else "ROOM --"
        tvBadgeRoomGuest.text = if (roomNumber.isNotEmpty()) roomNumber else "--"
        tvCheckoutRoomDeparture.text = if (roomNumber.isNotEmpty()) "Room $roomNumber • Departure" else "Room Departure"
        tvCheckoutSub.text = "We hope you had a pleasant stay at $hotelName."

        tvHotelHospitalityDesc.text = "Welcome to $hotelName. Our property features state-of-the-art guest rooms and 24/7 dedicated reception."
        tvHotelCheckoutLabel.text = "✓ Standard Check-out: $checkoutTime"
        tvHotelFrontDeskPhone.text = "Front Desk Direct: $conciergePhone"
        tvCheckoutLuggagePhone.text = "📞 Need luggage or airport transfer assistance? Reception: $conciergePhone"
        tvFooterQuietReception.text = "Quiet Hours: $quietHours • Reception / Front Desk: $conciergePhone"

        tvHotelAmenitiesList.text = amenities
        tvGuestAmenitiesList.text = amenities

        tvResRoomNum.text = if (roomNumber.isNotEmpty()) roomNumber else "--"
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

        val hotelName = prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad"
        val currentRoom = prefs.getString("room_number", "") ?: ""
        if (currentRoom.isNotEmpty()) {
            tvBadgeRoomHotel.text = "ROOM $currentRoom"
        }

        val defSubtitle = prefs.getString("default_welcome_subtitle", "") ?: ""
        if (defSubtitle.isNotEmpty()) {
            tvHotelTagline.text = defSubtitle
        }

        layoutStateHotel.visibility = View.VISIBLE
        layoutStateGuest.visibility = View.GONE
        layoutStateCheckout.visibility = View.GONE

        footerNormal.visibility = View.VISIBLE
        footerCheckout.visibility = View.GONE
        tvFooterWakeHint.visibility = View.VISIBLE
        btnLaunchEntertainment.visibility = View.GONE

        applyScreensaverVisibility()
    }

    /** STATE 2: WELCOME GUEST (Occupied) — Matches Image 2 */
    private fun showStateGuest(guestName: String, roomNumber: String) {
        currentState = TvScreenState.STATE_GUEST
        viewPairing.visibility = View.GONE
        viewMainContainer.visibility = View.VISIBLE

        headerGuest.visibility = View.VISIBLE
        headerHotel.visibility = View.GONE
        headerCheckout.visibility = View.GONE

        val template = prefs.getString("guest_welcome_title", "Welcome, {guestName}!") ?: "Welcome, {guestName}!"
        val showGuestName = prefs.getBoolean("ss_show_guest_name", true)
        val welcomeTitle = if (showGuestName) {
            template.replace("{guestName}", guestName)
        } else {
            template.replace(", {guestName}!", "!").replace(", {guestName}", "").replace("{guestName}", "").trim()
        }

        tvGuestWelcomeName.text = welcomeTitle
        tvResGuestName.text = if (showGuestName) guestName else "Guest"
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

        applyScreensaverVisibility()
    }

    /** STATE 3: CHECKOUT THANK YOU — Matches Image 3 */
    private fun showStateCheckout() {
        currentState = TvScreenState.STATE_CHECKOUT
        viewPairing.visibility = View.GONE
        viewMainContainer.visibility = View.VISIBLE

        headerCheckout.visibility = View.VISIBLE
        headerHotel.visibility = View.GONE
        headerGuest.visibility = View.GONE

        val currentRoom = prefs.getString("room_number", "") ?: ""
        if (currentRoom.isNotEmpty()) {
            tvCheckoutRoomDeparture.text = "Room $currentRoom • Departure"
        }

        layoutStateCheckout.visibility = View.VISIBLE
        layoutStateHotel.visibility = View.GONE
        layoutStateGuest.visibility = View.GONE

        footerCheckout.visibility = View.VISIBLE
        footerNormal.visibility = View.GONE
        btnCheckoutReturn.requestFocus()

        applyScreensaverVisibility()
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
                data.optString("name", prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad")
            } else {
                data.optJSONObject("hotel")?.optString("name", prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad")
                    ?: (prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad")
            }
            val tagline = if (data.has("tagline") && !data.isNull("tagline")) {
                data.optString("tagline")
            } else if (data.has("description") && !data.isNull("description")) {
                data.optString("description")
            } else {
                data.optJSONObject("hotel")?.optString("description", prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality.")
                    ?: (prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality.")
            }
            val roomObj = data.optJSONObject("room")
            val roomNum = if (data.has("roomNumber") && !data.isNull("roomNumber") && data.optString("roomNumber").isNotEmpty()) {
                data.optString("roomNumber")
            } else if (roomObj != null) {
                val r1 = roomObj.optString("roomNumber", "")
                if (r1.isNotEmpty()) r1 else roomObj.optString("number", prefs.getString("room_number", "") ?: "")
            } else {
                prefs.getString("room_number", "") ?: ""
            }

            val settings = data.optJSONObject("settings")
            val checkout = settings?.optString("checkOutTime", data.optString("checkoutTime", prefs.getString("checkout_time", "11:00 AM") ?: "11:00 AM")) ?: "11:00 AM"
            val phone = if (data.has("phone") && !data.isNull("phone")) {
                data.optString("phone")
            } else if (data.has("conciergePhone") && !data.isNull("conciergePhone")) {
                data.optString("conciergePhone")
            } else if (settings != null) {
                val p1 = settings.optString("phone", "")
                if (p1.isNotEmpty()) p1 else settings.optString("receptionPhone", prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884")
            } else {
                prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884"
            }
            val qStart = settings?.optString("quietHoursStart", "22:00") ?: "22:00"
            val qEnd = settings?.optString("quietHoursEnd", "07:00") ?: "07:00"
            val quietHours = "$qStart – $qEnd"

            val wifi = data.optJSONObject("wifi")
            val wifiSsid = if (wifi != null) {
                val s = wifi.optString("networkName", "")
                if (s.isNotEmpty()) s else wifi.optString("ssid", prefs.getString("wifi_ssid", "") ?: "")
            } else {
                prefs.getString("wifi_ssid", "") ?: ""
            }
            val wifiPass = wifi?.optString("password", prefs.getString("wifi_pass", "") ?: "") ?: (prefs.getString("wifi_pass", "") ?: "")
            val wifiStatus = wifi?.optString("status", prefs.getString("wifi_status", "MATCHED") ?: "MATCHED") ?: "MATCHED"

            // Save to prefs
            prefs.edit().apply {
                putString("hotel_name", hotelName)
                putString("hotel_tagline", tagline)
                if (roomNum.isNotEmpty()) putString("room_number", roomNum)
                putString("checkout_time", checkout)
                putString("concierge_phone", phone)
                putString("quiet_hours", quietHours)
                putString("wifi_ssid", wifiSsid)
                putString("wifi_pass", wifiPass)
                putString("wifi_status", wifiStatus)
            }.apply()

            // Update UI
            tvHotelName.text = hotelName
            tvHotelTagline.text = tagline
            tvGuestHotelMini.text = hotelName.uppercase(Locale.getDefault())
            if (roomNum.isNotEmpty()) {
                tvBadgeRoomHotel.text = "ROOM $roomNum"
                tvBadgeRoomGuest.text = roomNum
                tvResRoomNum.text = roomNum
                tvCheckoutRoomDeparture.text = "Room $roomNum • Departure"
            }
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
                for (i in 0 until minOf(amenitiesArr.length(), 6)) {
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

            // House Rules / Departure steps
            val stepsArr = data.optJSONArray("checkoutSteps") ?: data.optJSONArray("houseRules")
            if (stepsArr != null && stepsArr.length() > 0) {
                val s1 = stepsArr.optString(0, "")
                val s2 = if (stepsArr.length() > 1) stepsArr.optString(1, "") else ""
                val s3 = if (stepsArr.length() > 2) stepsArr.optString(2, "") else ""
                if (s1.isNotEmpty()) tvCheckoutStep1?.text = s1
                if (s2.isNotEmpty()) tvCheckoutStep2?.text = s2
                if (s3.isNotEmpty()) tvCheckoutStep3?.text = s3
            }

            // Checkout Advance Duration Settings
            if (settings != null) {
                val advHourly = settings.optInt("checkoutAdvanceHourlyMinutes", 20)
                val advFixed = settings.optInt("checkoutAdvanceFixedMinutes", 120)
                val advCustom = settings.optInt("checkoutAdvanceCustomMinutes", 120)
                prefs.edit().apply {
                    putInt("checkout_adv_hourly", advHourly)
                    putInt("checkout_adv_fixed", advFixed)
                    putInt("checkout_adv_custom", advCustom)
                }.apply()
            }

            // Screensaver Appearance Config
            val screensaver = data.optJSONObject("screensaver")
            if (screensaver != null) {
                val showClock = screensaver.optBoolean("showClock", true)
                val showDate = screensaver.optBoolean("showDate", true)
                val showRoom = screensaver.optBoolean("showRoomNumber", true)
                val showGuestName = screensaver.optBoolean("showGuestName", true)
                val showHotelLogo = screensaver.optBoolean("showHotelLogo", true)
                val showFacilities = screensaver.optBoolean("showFacilities", true)
                val gTitle = screensaver.optString("guestWelcomeTitle", "Welcome, {guestName}!")
                val gSubtitle = screensaver.optString("guestWelcomeSubtitle", "We hope you enjoy your comfortable stay with us.")
                val gPromo = screensaver.optString("guestPromoText", "Dial 9 for 24/7 Concierge and In-Room Dining.")
                val dTitle = screensaver.optString("defaultWelcomeTitle", "Welcome to {hotelName}")
                val dSubtitle = screensaver.optString("defaultWelcomeSubtitle", "Experience world-class luxury and personalized hospitality.")
                val dPromo = screensaver.optString("defaultPromoText", "High-speed Wi-Fi & 24/7 guest support available.")

                prefs.edit().apply {
                    putBoolean("ss_show_clock", showClock)
                    putBoolean("ss_show_date", showDate)
                    putBoolean("ss_show_room", showRoom)
                    putBoolean("ss_show_guest_name", showGuestName)
                    putBoolean("ss_show_hotel_logo", showHotelLogo)
                    putBoolean("ss_show_facilities", showFacilities)
                    putString("guest_welcome_title", gTitle)
                    putString("guest_welcome_subtitle", gSubtitle)
                    putString("guest_promo_text", gPromo)
                    putString("default_welcome_title", dTitle)
                    putString("default_welcome_subtitle", dSubtitle)
                    putString("default_promo_text", dPromo)
                }.apply()

                if (dSubtitle.isNotEmpty()) {
                    tvHotelTagline.text = dSubtitle
                    prefs.edit().putString("hotel_tagline", dSubtitle).apply()
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
                val bookingId = guest.optString("bookingId", "")
                val stayType = guest.optString("stayType", "FIXED")
                val checkOutTs = guest.optLong("checkOutTimestamp", 0L)
                val lastBookingId = prefs.getString("guest_booking_id", "")
                if (bookingId.isNotEmpty() && bookingId != lastBookingId) {
                    prefs.edit().putBoolean("checkout_screen_triggered", false).putString("guest_booking_id", bookingId).apply()
                }
                prefs.edit().apply {
                    putString("guest_name", guestName)
                    putString("checkout_time", guestCheckout)
                    putString("stay_type", stayType)
                    if (checkOutTs > 0L) putLong("guest_checkout_ts", checkOutTs)
                }.apply()
                showStateGuest(guestName, roomNum)
            } else {
                prefs.edit().remove("guest_name").remove("guest_booking_id").remove("guest_checkout_ts").putBoolean("checkout_screen_triggered", false).apply()
                showStateHotel()
            }
            applyScreensaverVisibility()
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
                .setAuth(mapOf(
                    "deviceId" to hardwareId,
                    "hardwareId" to hardwareId,
                    "deviceToken" to (deviceToken ?: "")
                ))
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
            fun onPaired(args: Array<Any>) {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val token = data.optString("deviceToken", "")
                        val roomObj = data.optJSONObject("room")
                        val roomNum = if (data.has("roomNumber") && !data.isNull("roomNumber") && data.optString("roomNumber").isNotEmpty()) {
                            data.optString("roomNumber")
                        } else if (roomObj != null) {
                            val r1 = roomObj.optString("roomNumber", "")
                            if (r1.isNotEmpty()) r1 else roomObj.optString("number", "")
                        } else {
                            ""
                        }
                        prefs.edit().apply {
                            putBoolean("is_paired", true)
                            if (roomNum.isNotEmpty()) putString("room_number", roomNum)
                            if (token.isNotEmpty()) putString("device_token", token)
                        }.apply()

                        runOnUiThread {
                            if (roomNum.isNotEmpty()) {
                                tvBadgeRoomHotel.text = "ROOM $roomNum"
                                tvBadgeRoomGuest.text = roomNum
                                tvResRoomNum.text = roomNum
                                tvCheckoutRoomDeparture.text = "Room $roomNum • Departure"
                            }
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
            fun onGuestCheckin(args: Array<Any>) {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val isPaired = prefs.getBoolean("is_paired", false)
                        if (!isPaired) {
                            Log.d(TAG, "Device is not yet paired; ignoring guest.checked_in")
                            return
                        }
                        val myRoom = prefs.getString("room_number", "")
                        val targetRoom = data.optString("roomNumber", "")
                        if (!myRoom.isNullOrEmpty() && targetRoom.isNotEmpty() && myRoom != targetRoom) {
                            Log.d(TAG, "Ignoring check-in: room mismatch ($myRoom vs $targetRoom)")
                            return
                        }

                        val guestObj = data.optJSONObject("guest")
                        val guestName = if (data.has("guestName")) {
                            data.optString("guestName", "Guest")
                        } else if (guestObj != null) {
                            val n1 = guestObj.optString("name", "")
                            if (n1.isNotEmpty()) n1 else guestObj.optString("firstName", "Guest")
                        } else {
                            "Guest"
                        }
                        val roomNum = if (data.has("roomNumber") && !data.isNull("roomNumber") && data.optString("roomNumber").isNotEmpty()) {
                            data.optString("roomNumber")
                        } else {
                            prefs.getString("room_number", "") ?: ""
                        }
                        val checkoutTime = data.optString("checkoutTime", "11:00")
                        val bookingObj = data.optJSONObject("booking")
                        val bookingId = bookingObj?.optString("id", "") ?: ""
                        val stayType = bookingObj?.optString("stayType", "FIXED") ?: "FIXED"
                        val checkOutTs = bookingObj?.optLong("checkOutTimestamp", 0L) ?: 0L

                        prefs.edit().apply {
                            putString("guest_name", guestName)
                            if (roomNum.isNotEmpty()) putString("room_number", roomNum)
                            putString("checkout_time", checkoutTime)
                            putString("stay_type", stayType)
                            if (checkOutTs > 0L) putLong("guest_checkout_ts", checkOutTs)
                            if (bookingId.isNotEmpty()) putString("guest_booking_id", bookingId)
                            putBoolean("checkout_screen_triggered", false)
                            putBoolean("is_paired", true)
                        }.apply()

                        runOnUiThread {
                            val displayRoom = if (roomNum.isNotEmpty()) roomNum else (prefs.getString("room_number", "--") ?: "--")
                            showStateGuest(guestName, displayRoom)
                            Toast.makeText(this@MainActivity, "Welcome, $guestName!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            socket?.on("guest.checked_in") { onGuestCheckin(it) }
            socket?.on("GUEST_CHECKED_IN") { onGuestCheckin(it) }

            // REAL-TIME CHECKOUT REMINDER
            fun onCheckoutReminder(args: Array<Any>) {
                val isPaired = prefs.getBoolean("is_paired", false)
                if (!isPaired) return
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val myRoom = prefs.getString("room_number", "")
                    val targetRoom = data?.optString("roomNumber", "")
                    if (!myRoom.isNullOrEmpty() && !targetRoom.isNullOrEmpty() && myRoom != targetRoom) {
                        return
                    }
                }
                prefs.edit().putBoolean("checkout_screen_triggered", true).apply()
                runOnUiThread {
                    showStateCheckout()
                    Toast.makeText(this@MainActivity, "Checkout reminder received", Toast.LENGTH_LONG).show()
                }
            }
            socket?.on("checkout.reminder") { onCheckoutReminder(it) }
            socket?.on("CHECKOUT_REMINDER") { onCheckoutReminder(it) }
            socket?.on("guest.checkout_reminder") { onCheckoutReminder(it) }

            // REAL-TIME GUEST CHECKOUT
            fun onGuestCheckout(args: Array<Any>) {
                val isPaired = prefs.getBoolean("is_paired", false)
                if (!isPaired) {
                    Log.d(TAG, "Device is not yet paired; ignoring checkout")
                    return
                }
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val myRoom = prefs.getString("room_number", "")
                    val targetRoom = data?.optString("roomNumber", "")
                    if (!myRoom.isNullOrEmpty() && !targetRoom.isNullOrEmpty() && myRoom != targetRoom) {
                        Log.d(TAG, "Ignoring checkout: room mismatch ($myRoom vs $targetRoom)")
                        return
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
            fun onWifiUpdated(args: Array<Any>) {
                if (args.isNotEmpty()) {
                    val raw = args[0] as? JSONObject
                    if (raw != null) {
                        val data = if (raw.has("wifi")) raw.optJSONObject("wifi") ?: raw else raw
                        val ssid = if (data.has("networkName") && data.optString("networkName").isNotEmpty()) {
                            data.optString("networkName")
                        } else {
                            data.optString("ssid", "")
                        }
                        val pass = data.optString("password", "")
                        val status = data.optString("status", "MATCHED")
                        prefs.edit().putString("wifi_ssid", ssid).putString("wifi_pass", pass).putString("wifi_status", status).apply()
                        runOnUiThread { renderWifiDetails(ssid, pass, status) }
                    }
                }
            }
            socket?.on("wifi.updated") { onWifiUpdated(it) }
            socket?.on("WIFI_UPDATED") { onWifiUpdated(it) }

            // DEVICE REVOCATION / DELETION
            fun onDeviceRevoked(args: Array<Any>) {
                Log.d(TAG, "Device unlinked/deleted from hotel")
                prefs.edit()
                    .putBoolean("is_paired", false)
                    .remove("device_token")
                    .remove("room_number")
                    .remove("guest_name")
                    .apply()
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Display unlinked. Please pair again.", Toast.LENGTH_LONG).show()
                    requestPairingCodeFromBackend()
                }
            }
            socket?.on("device.revoked") { onDeviceRevoked(it) }
            socket?.on("DEVICE_REVOKED") { onDeviceRevoked(it) }

            // CONTENT / CONFIG UPDATE
            fun onRefresh(args: Array<Any>) {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val action = data?.optString("action", "") ?: ""
                    if (action == "DELETED") {
                        onDeviceRevoked(args)
                        return
                    } else if (action == "UNASSIGNED") {
                        prefs.edit().remove("room_number").remove("guest_name").apply()
                        runOnUiThread {
                            tvBadgeRoomHotel.text = "ROOM --"
                            tvBadgeRoomGuest.text = "--"
                            tvResRoomNum.text = "--"
                            tvCheckoutRoomDeparture.text = "Room Departure"
                            Toast.makeText(this@MainActivity, "Display unassigned from room", Toast.LENGTH_SHORT).show()
                        }
                        return
                    }
                }
                val isPaired = prefs.getBoolean("is_paired", false)
                if (!isPaired) {
                    Log.d(TAG, "Device is not yet paired; ignoring refresh")
                    return
                }
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null && (data.has("hotel") || data.has("name") || data.has("settings") || data.has("wifi") || data.has("amenities"))) {
                        runOnUiThread { applyServerTvPayload(data) }
                    }
                }
                val connectedSsid = getConnectedWifiSsid()
                socket?.emit("device.request_sync", JSONObject().apply {
                    put("deviceId", hardwareId)
                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                })
            }
            socket?.on("screen.refresh") { onRefresh(it) }
            socket?.on("content.updated") { onRefresh(it) }
            socket?.on("CONTENT_UPDATED") { onRefresh(it) }
            socket?.on("hotel.settings.updated") { onRefresh(it) }
            socket?.on("hotel.screensaver.updated") { onRefresh(it) }

            // REMOTE DEVICE COMMANDS WITH VISUAL EXECUTION & ACK
            socket?.on("device.command") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val cmd = data?.optString("command", "")
                    val payload = data?.optJSONObject("payload")
                    val ack = if (args.size > 1) args[args.size - 1] as? io.socket.client.Ack else null

                    Log.i(TAG, "📥 Executing remote command: $cmd with payload: $payload")

                    runOnUiThread {
                        when (cmd) {
                            "SEND_MESSAGE", "MESSAGE", "ALERT" -> {
                                val msgText = if (payload != null && payload.has("message") && payload.optString("message").isNotEmpty()) {
                                    payload.optString("message")
                                } else if (payload != null && payload.has("text") && payload.optString("text").isNotEmpty()) {
                                    payload.optString("text")
                                } else if (data != null && data.has("message") && data.optString("message").isNotEmpty()) {
                                    data.optString("message")
                                } else {
                                    ""
                                }
                                val msgTitle = payload?.optString("title", "Message from Front Desk") ?: "Message from Front Desk"
                                if (msgText.isNotEmpty()) {
                                    showOnScreenAlert(msgTitle, msgText)
                                }
                            }
                            "REFRESH_SCREEN", "REBOOT" -> {
                                val connectedSsid = getConnectedWifiSsid()
                                socket?.emit("device.request_sync", JSONObject().apply {
                                    put("deviceId", hardwareId)
                                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                                    })
                                Toast.makeText(this@MainActivity, "🔄 Display refreshed by Front Desk", Toast.LENGTH_SHORT).show()
                            }
                            "UPDATE_ROOM" -> {
                                val newRoom = if (payload != null) {
                                    val r1 = payload.optString("roomNumber", "")
                                    if (r1.isNotEmpty()) r1 else payload.optString("number", "")
                                } else {
                                    ""
                                }
                                if (newRoom.isNotEmpty()) {
                                    prefs.edit().putString("room_number", newRoom).apply()
                                    tvBadgeRoomHotel.text = "ROOM $newRoom"
                                    tvBadgeRoomGuest.text = newRoom
                                    tvResRoomNum.text = newRoom
                                    tvCheckoutRoomDeparture.text = "Room $newRoom • Departure"
                                    Toast.makeText(this@MainActivity, "Room updated to $newRoom", Toast.LENGTH_SHORT).show()
                                }
                            }
                            "REFRESH_WIFI" -> {
                                val wifiObj = payload?.optJSONObject("wifi")
                                if (wifiObj != null) {
                                    val ssid = wifiObj.optString("networkName", wifiObj.optString("ssid", ""))
                                    val pass = wifiObj.optString("password", "")
                                    val status = wifiObj.optString("status", "MATCHED")
                                    prefs.edit().putString("wifi_ssid", ssid).putString("wifi_pass", pass).putString("wifi_status", status).apply()
                                    renderWifiDetails(ssid, pass, status)
                                }
                                reportConnectedSsidToBackend()
                                val connectedSsid = getConnectedWifiSsid()
                                socket?.emit("device.request_sync", JSONObject().apply {
                                    put("deviceId", hardwareId)
                                    if (connectedSsid != null) put("connectedSsid", connectedSsid)
                                })
                                Toast.makeText(this@MainActivity, "Wi-Fi credentials & QR code refreshed", Toast.LENGTH_SHORT).show()
                            }
                            "CHECKOUT_REMINDER", "CHECKOUT_NOTIFY" -> {
                                showStateCheckout()
                                Toast.makeText(this@MainActivity, "Checkout reminder received", Toast.LENGTH_LONG).show()
                            }
                            "CLEAR_GUEST" -> {
                                prefs.edit().remove("guest_name").apply()
                                showStateHotel()
                                Toast.makeText(this@MainActivity, "Guest checked out", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }

                    ack?.call(JSONObject().apply {
                        put("status", "SUCCESS")
                        put("command", cmd)
                        put("receivedAt", System.currentTimeMillis())
                    })
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket.IO initialization error", e)
        }
    }

    private fun sendHeartbeat() {
        if (socket?.connected() == true) {
            val hwId = getHardwareId()
            val payload = JSONObject().apply {
                put("hardwareId", hwId)
                put("deviceId", hwId)
                put("screenState", currentState.name)
                put("appVersion", "1.0.0")
                val ssid = getConnectedWifiSsid()
                if (ssid != null) put("connectedSsid", ssid)
            }
            socket?.emit("device.heartbeat", payload)
        }
    }

    private fun showOnScreenAlert(title: String, message: String) {
        try {
            val alertLayout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(50, 40, 50, 40)
                setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            }

            val tvTitle = TextView(this).apply {
                text = "🔔 $title"
                textSize = 20f
                setTextColor(android.graphics.Color.parseColor("#38BDF8"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                setPadding(0, 0, 0, 16)
            }
            alertLayout.addView(tvTitle)

            val tvMessage = TextView(this).apply {
                text = message
                textSize = 16f
                setTextColor(android.graphics.Color.WHITE)
                setLineSpacing(1.3f, 1.2f)
                setPadding(0, 0, 0, 24)
            }
            alertLayout.addView(tvMessage)

            val dialog = android.app.AlertDialog.Builder(this)
                .setView(alertLayout)
                .setPositiveButton("Dismiss (OK)", null)
                .create()

            dialog.show()

            // Auto-dismiss after 20 seconds so display is not blocked permanently
            handler.postDelayed({
                try {
                    if (dialog.isShowing) dialog.dismiss()
                } catch (e: Exception) {}
            }, 20000)

            Toast.makeText(this, "$title: $message", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Log.e(TAG, "Error displaying alert: ${e.message}")
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
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
