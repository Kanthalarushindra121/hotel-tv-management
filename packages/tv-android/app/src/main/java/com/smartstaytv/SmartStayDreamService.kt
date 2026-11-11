package com.smartstaytv

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.dreams.DreamService
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * SmartStay TV Native System Screensaver (Daydream Service)
 *
 * Implements Android TV system screensaver integration:
 * - Automatically activates on system idle
 * - Renders the EXACT 3 screensaver states:
 *   1. Welcome Hotel Name (Image 1: Unoccupied)
 *   2. Welcome Customer Name (Image 2: Occupied)
 *   3. Checkout Thank You (Image 3: Departure Checklist)
 * - Has full Real-time Socket.IO sync so when a guest checks in or out,
 *   the screensaver updates DYNAMICALLY IN REAL TIME without opening the app!
 */
class SmartStayDreamService : DreamService() {

    companion object {
        private const val TAG = "SmartStayDream"
    }

    private lateinit var prefs: SharedPreferences
    private val handler = Handler(Looper.getMainLooper())
    private var socket: Socket? = null

    // Primary Containers
    private var viewPairing: View? = null
    private var viewMainContainer: View? = null

    // Headers
    private var headerHotel: RelativeLayout? = null
    private var headerGuest: RelativeLayout? = null
    private var headerCheckout: RelativeLayout? = null

    // Header Views - State 1
    private var tvHotelName: TextView? = null
    private var tvHotelTagline: TextView? = null
    private var tvBadgeRoomHotel: TextView? = null
    private var tvClockHotel: TextView? = null
    private var tvDateHotel: TextView? = null

    // Header Views - State 2
    private var tvGuestHotelMini: TextView? = null
    private var tvGuestWelcomeName: TextView? = null
    private var tvBadgeRoomGuest: TextView? = null
    private var tvClockGuest: TextView? = null
    private var tvDateGuest: TextView? = null

    // Header Views - State 3
    private var tvCheckoutSub: TextView? = null
    private var tvClockCheckout: TextView? = null
    private var tvCheckoutRoomDeparture: TextView? = null

    // Content Containers
    private var layoutStateHotel: LinearLayout? = null
    private var layoutStateGuest: LinearLayout? = null
    private var layoutStateCheckout: LinearLayout? = null

    // State 1 Views
    private var tvHotelHospitalityDesc: TextView? = null
    private var tvHotelCheckoutLabel: TextView? = null
    private var tvHotelFrontDeskPhone: TextView? = null
    private var ivHotelWifiQr: ImageView? = null
    private var tvHotelWifiLabel: TextView? = null
    private var tvHotelAmenitiesList: TextView? = null

    // State 2 Views
    private var tvResGuestName: TextView? = null
    private var tvResRoomNum: TextView? = null
    private var tvResCheckoutVal: TextView? = null
    private var ivGuestWifiQr: ImageView? = null
    private var tvGuestWifiLabel: TextView? = null
    private var tvGuestAmenitiesList: TextView? = null

    // State 3 Views
    private var tvCheckoutLuggagePhone: TextView? = null
    private var btnCheckoutReturn: Button? = null

    // Footers
    private var footerNormal: RelativeLayout? = null
    private var footerCheckout: RelativeLayout? = null
    private var tvFooterQuietReception: TextView? = null
    private var tvFooterWakeHint: TextView? = null
    private var btnLaunchEntertainment: Button? = null

    // Screensaver Dynamic Views
    private var layoutBadgeRoomHotel: View? = null
    private var layoutBadgeRoomGuest: View? = null
    private var cardHotelAmenities: View? = null
    private var cardGuestAmenities: View? = null

    private var currentScreensaverState: TvScreenState = TvScreenState.STATE_HOTEL

    private val timeRunnable = object : Runnable {
        override fun run() {
            updateClocks()
            handler.postDelayed(this, 10000)
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false // Any button press on remote wakes the TV immediately
        isFullscreen = true

        try {
            setContentView(R.layout.activity_main)
            prefs = getSharedPreferences("smartstay_tv_prefs", Context.MODE_PRIVATE)

            bindViews()
            renderScreensaverState()
            handler.post(timeRunnable)

            // Connect Realtime Socket.IO so screensaver updates dynamically
            initRealtimeSync()
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing screensaver: ${e.message}", e)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        handler.removeCallbacks(timeRunnable)
        socket?.disconnect()
        socket?.off()
    }

    private fun bindViews() {
        viewPairing = findViewById(R.id.view_pairing)
        viewMainContainer = findViewById(R.id.view_main_container)

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

        // Dynamic Screensaver Elements
        layoutBadgeRoomHotel = findViewById(R.id.layout_badge_room_hotel)
        layoutBadgeRoomGuest = findViewById(R.id.layout_badge_room_guest)
        cardHotelAmenities = findViewById(R.id.card_hotel_amenities)
        cardGuestAmenities = findViewById(R.id.card_guest_amenities)
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

    private fun applyScreensaverVisibility() {
        val showClock = prefs.getBoolean("ss_show_clock", true)
        val showDate = prefs.getBoolean("ss_show_date", true)
        val showRoom = prefs.getBoolean("ss_show_room", true)
        val showHotelLogo = prefs.getBoolean("ss_show_hotel_logo", true)
        val showFacilities = prefs.getBoolean("ss_show_facilities", true)

        tvClockHotel?.visibility = if (showClock) View.VISIBLE else View.GONE
        tvClockGuest?.visibility = if (showClock) View.VISIBLE else View.GONE
        tvClockCheckout?.visibility = if (showClock) View.VISIBLE else View.GONE

        tvDateHotel?.visibility = if (showDate) View.VISIBLE else View.GONE
        tvDateGuest?.visibility = if (showDate) View.VISIBLE else View.GONE

        layoutBadgeRoomHotel?.visibility = if (showRoom) View.VISIBLE else View.GONE
        layoutBadgeRoomGuest?.visibility = if (showRoom) View.VISIBLE else View.GONE

        tvHotelName?.visibility = if (showHotelLogo) View.VISIBLE else View.INVISIBLE
        tvGuestHotelMini?.visibility = if (showHotelLogo) View.VISIBLE else View.GONE

        cardHotelAmenities?.visibility = if (showFacilities) View.VISIBLE else View.INVISIBLE
        cardGuestAmenities?.visibility = if (showFacilities) View.VISIBLE else View.INVISIBLE
    }

    private fun updateClocks() {
        val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
        val dateFormat = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
        val now = Date()
        val timeStr = timeFormat.format(now)
        val dateStr = dateFormat.format(now)

        tvClockHotel?.text = timeStr
        tvDateHotel?.text = dateStr
        tvClockGuest?.text = timeStr
        tvDateGuest?.text = dateStr
        tvClockCheckout?.text = timeStr

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
                if (nowTime >= triggerAt && nowTime < checkoutTs + (24 * 3600 * 1000L)) {
                    prefs.edit().putBoolean("checkout_screen_triggered", true).apply()
                    if (currentScreensaverState != TvScreenState.STATE_CHECKOUT) {
                        Log.d(TAG, "Automatic advance checkout screen triggered in screensaver ($stayType, $advMinutes mins before)")
                        showStateCheckout()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating checkout in screensaver", e)
        }
    }

    private fun renderScreensaverState() {
        val hotelName = prefs.getString("hotel_name", "Grand Palace Hyderabad") ?: "Grand Palace Hyderabad"
        val tagline = prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality."
        val roomNumber = prefs.getString("room_number", "") ?: ""
        val guestName = prefs.getString("guest_name", null)
        val checkoutTime = prefs.getString("checkout_time", "11:00 AM") ?: "11:00 AM"
        val conciergePhone = prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884"
        val quietHours = prefs.getString("quiet_hours", "22:00 – 07:00") ?: "22:00 – 07:00"
        val wifiSsid = prefs.getString("wifi_ssid", "") ?: ""
        val wifiPass = prefs.getString("wifi_pass", "") ?: ""
        val wifiStatus = prefs.getString("wifi_status", "MATCHED") ?: "MATCHED"
        val amenities = prefs.getString("amenities_cached", "• Fitness Center (24/7)\n• Valet Parking (Complimentary)\n• 24/7 Room Service (Dial 9)")

        tvHotelName?.text = hotelName
        tvHotelTagline?.text = tagline
        tvGuestHotelMini?.text = hotelName.uppercase(Locale.getDefault())
        tvBadgeRoomHotel?.text = if (roomNumber.isNotEmpty()) "ROOM $roomNumber" else "ROOM --"
        tvBadgeRoomGuest?.text = if (roomNumber.isNotEmpty()) roomNumber else "--"
        tvCheckoutRoomDeparture?.text = if (roomNumber.isNotEmpty()) "Room $roomNumber • Departure" else "Room Departure"
        tvCheckoutSub?.text = "We hope you had a pleasant stay at $hotelName."

        tvHotelHospitalityDesc?.text = "Welcome to $hotelName. Our property features state-of-the-art guest rooms and 24/7 dedicated reception."
        tvHotelCheckoutLabel?.text = "✓ Standard Check-out: $checkoutTime"
        tvHotelFrontDeskPhone?.text = "Front Desk Direct: $conciergePhone"
        tvCheckoutLuggagePhone?.text = "📞 Need luggage or airport transfer assistance? Reception: $conciergePhone"
        tvFooterQuietReception?.text = "Quiet Hours: $quietHours • Reception / Front Desk: $conciergePhone"

        tvHotelAmenitiesList?.text = amenities
        tvGuestAmenitiesList?.text = amenities

        tvResRoomNum?.text = roomNumber
        tvResCheckoutVal?.text = "By $checkoutTime"

        renderWifiDetails(wifiSsid, wifiPass, wifiStatus)
        updateClocks()

        if (!guestName.isNullOrEmpty()) {
            showStateGuest(guestName, roomNumber)
        } else {
            showStateHotel()
        }
    }

    private fun renderWifiDetails(ssid: String, pass: String, status: String) {
        val isValid = (status == "MATCHED" || status == "ROOM_ZONE") && ssid.isNotEmpty()
        if (isValid) {
            tvHotelWifiLabel?.text = "Connect WiFi"
            tvGuestWifiLabel?.text = "Connect WiFi"
            val qrString = if (pass.isEmpty()) "WIFI:T:nopass;S:$ssid;;" else "WIFI:T:WPA;S:$ssid;P:$pass;;"
            try {
                val encoder = BarcodeEncoder()
                val bitmap: Bitmap = encoder.encodeBitmap(qrString, BarcodeFormat.QR_CODE, 450, 450)
                ivHotelWifiQr?.setImageBitmap(bitmap)
                ivGuestWifiQr?.setImageBitmap(bitmap)
            } catch (e: Exception) {
                Log.e(TAG, "QR Code render error: ${e.message}")
            }
        } else {
            ivHotelWifiQr?.setImageDrawable(null)
            ivGuestWifiQr?.setImageDrawable(null)
            val fallbackLabel = if (status == "CONNECTED_UNMATCHED") "Zone Unregistered" else "Wi-Fi Not Configured"
            tvHotelWifiLabel?.text = fallbackLabel
            tvGuestWifiLabel?.text = fallbackLabel
        }
    }

    private fun showStateHotel() {
        currentScreensaverState = TvScreenState.STATE_HOTEL
        viewPairing?.visibility = View.GONE
        viewMainContainer?.visibility = View.VISIBLE

        headerHotel?.visibility = View.VISIBLE
        headerGuest?.visibility = View.GONE
        headerCheckout?.visibility = View.GONE

        val defSubtitle = prefs.getString("default_welcome_subtitle", "") ?: ""
        if (defSubtitle.isNotEmpty()) {
            tvHotelTagline?.text = defSubtitle
        }

        layoutStateHotel?.visibility = View.VISIBLE
        layoutStateGuest?.visibility = View.GONE
        layoutStateCheckout?.visibility = View.GONE

        footerNormal?.visibility = View.VISIBLE
        footerCheckout?.visibility = View.GONE
        tvFooterWakeHint?.visibility = View.VISIBLE
        btnLaunchEntertainment?.visibility = View.GONE

        applyScreensaverVisibility()
    }

    private fun showStateGuest(guestName: String, roomNumber: String) {
        currentScreensaverState = TvScreenState.STATE_GUEST
        viewPairing?.visibility = View.GONE
        viewMainContainer?.visibility = View.VISIBLE

        headerGuest?.visibility = View.VISIBLE
        headerHotel?.visibility = View.GONE
        headerCheckout?.visibility = View.GONE

        val template = prefs.getString("guest_welcome_title", "Welcome, {guestName}!") ?: "Welcome, {guestName}!"
        val showGuestName = prefs.getBoolean("ss_show_guest_name", true)
        val welcomeTitle = if (showGuestName) {
            template.replace("{guestName}", guestName)
        } else {
            template.replace(", {guestName}!", "!").replace(", {guestName}", "").replace("{guestName}", "").trim()
        }

        tvGuestWelcomeName?.text = welcomeTitle
        tvResGuestName?.text = if (showGuestName) guestName else "Guest"
        tvResRoomNum?.text = roomNumber
        tvBadgeRoomGuest?.text = roomNumber

        layoutStateGuest?.visibility = View.VISIBLE
        layoutStateHotel?.visibility = View.GONE
        layoutStateCheckout?.visibility = View.GONE

        footerNormal?.visibility = View.VISIBLE
        footerCheckout?.visibility = View.GONE
        btnLaunchEntertainment?.visibility = View.VISIBLE
        tvFooterWakeHint?.visibility = View.GONE

        applyScreensaverVisibility()
    }

    private fun showStateCheckout() {
        currentScreensaverState = TvScreenState.STATE_CHECKOUT
        viewPairing?.visibility = View.GONE
        viewMainContainer?.visibility = View.VISIBLE

        headerCheckout?.visibility = View.VISIBLE
        headerHotel?.visibility = View.GONE
        headerGuest?.visibility = View.GONE

        val currentRoom = prefs.getString("room_number", "") ?: ""
        if (currentRoom.isNotEmpty()) {
            tvCheckoutRoomDeparture?.text = "Room $currentRoom • Departure"
        }

        layoutStateCheckout?.visibility = View.VISIBLE
        layoutStateHotel?.visibility = View.GONE
        layoutStateGuest?.visibility = View.GONE

        footerCheckout?.visibility = View.VISIBLE
        footerNormal?.visibility = View.GONE

        applyScreensaverVisibility()
    }
        currentScreensaverState = TvScreenState.STATE_CHECKOUT
        viewPairing?.visibility = View.GONE
        viewMainContainer?.visibility = View.VISIBLE

        headerCheckout?.visibility = View.VISIBLE
        headerHotel?.visibility = View.GONE
        headerGuest?.visibility = View.GONE

        layoutStateCheckout?.visibility = View.VISIBLE
        layoutStateHotel?.visibility = View.GONE
        layoutStateGuest?.visibility = View.GONE

        footerCheckout?.visibility = View.VISIBLE
        footerNormal?.visibility = View.GONE
    }

    /**
     * Connects directly to Socket.IO in the Daydream service
     * so that check-ins and checkouts update DYNAMICALLY while the screensaver is showing!
     */
    private fun initRealtimeSync() {
        try {
            val saved = prefs.getString("backend_url", null)
            val backendUrl = if (!saved.isNullOrBlank()) {
                saved.trim().removeSuffix("/")
            } else {
                BuildConfig.DEFAULT_BACKEND_URL.trim().removeSuffix("/")
            }
            val hardwareId = getHardwareId()
            val deviceToken = prefs.getString("device_token", null)

            val options = IO.Options.builder()
                .setReconnection(true)
                .setReconnectionAttempts(Int.MAX_VALUE)
                .setReconnectionDelay(2000)
                .setTimeout(10000)
                .setAuth(mapOf("deviceId" to hardwareId, "deviceToken" to (deviceToken ?: "")))
                .build()

            socket = IO.socket(backendUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Screensaver connected to Socket.IO")
                socket?.emit("device.register", JSONObject().apply { put("deviceId", hardwareId) })
                socket?.emit("device.request_sync", JSONObject().apply { put("deviceId", hardwareId) })
            }

            // REAL-TIME PAIRING
            val onPaired = { _: Array<Any> ->
                prefs.edit().putBoolean("is_paired", true).apply()
                socket?.emit("device.request_sync", JSONObject().apply { put("deviceId", hardwareId) })
            }
            socket?.on("device.paired") { onPaired(it) }
            socket?.on("DEVICE_PAIRED") { onPaired(it) }

            // GUEST CHECKED IN -> Instantly update screensaver to Welcome Guest (Image 2)
            val onCheckin = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
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
                        }.apply()

                        handler.post {
                            tvResCheckoutVal?.text = "By $checkoutTime"
                            val displayRoom = if (roomNum.isNotEmpty()) roomNum else (prefs.getString("room_number", "--") ?: "--")
                            showStateGuest(guestName, displayRoom)
                        }
                    }
                }
            }
            socket?.on("guest.checked_in") { onCheckin(it) }
            socket?.on("GUEST_CHECKED_IN") { onCheckin(it) }

            // REAL-TIME CHECKOUT REMINDER
            val onCheckoutReminder = { _: Array<Any> ->
                prefs.edit().putBoolean("checkout_screen_triggered", true).apply()
                handler.post {
                    showStateCheckout()
                }
            }
            socket?.on("checkout.reminder") { onCheckoutReminder(it) }
            socket?.on("CHECKOUT_REMINDER") { onCheckoutReminder(it) }
            socket?.on("guest.checkout_reminder") { onCheckoutReminder(it) }

            // GUEST CHECKED OUT -> Instantly show Checkout Thank You (Image 3), then return to Image 1
            val onCheckout = { _: Array<Any> ->
                prefs.edit().remove("guest_name").remove("guest_booking_id").remove("guest_checkout_ts").putBoolean("checkout_screen_triggered", false).apply()
                handler.post {
                    showStateCheckout()
                    handler.postDelayed({
                        if (currentScreensaverState == TvScreenState.STATE_CHECKOUT) {
                            showStateHotel()
                        }
                    }, 8000)
                }
            }
            socket?.on("guest.checked_out") { onCheckout(it) }
            socket?.on("GUEST_CHECKED_OUT") { onCheckout(it) }

            // WI-FI CREDENTIALS UPDATE
            val onWifiUpdated = { args: Array<Any> ->
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
                        handler.post { renderWifiDetails(ssid, pass, status) }
                    }
                }
            }
            socket?.on("wifi.updated") { onWifiUpdated(it) }
            socket?.on("WIFI_UPDATED") { onWifiUpdated(it) }

            // CONTENT / SETTINGS REFRESH
            val onContentUpdated = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null && (data.has("hotel") || data.has("name") || data.has("settings") || data.has("wifi") || data.has("amenities"))) {
                        handler.post { applyServerPayload(data) }
                    }
                }
                socket?.emit("device.request_sync", JSONObject().apply { put("deviceId", hardwareId) })
            }
            socket?.on("content.updated") { onContentUpdated(it) }
            socket?.on("CONTENT_UPDATED") { onContentUpdated(it) }
            socket?.on("screen.refresh") { onContentUpdated(it) }
            socket?.on("hotel.settings.updated") { onContentUpdated(it) }
            socket?.on("hotel.screensaver.updated") { onContentUpdated(it) }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket init error in screensaver: ${e.message}")
        }
    }

    private fun applyServerPayload(data: JSONObject) {
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

            tvHotelName?.text = hotelName
            tvHotelTagline?.text = tagline
            tvGuestHotelMini?.text = hotelName.uppercase(Locale.getDefault())
            if (roomNum.isNotEmpty()) {
                tvBadgeRoomHotel?.text = "ROOM $roomNum"
                tvBadgeRoomGuest?.text = roomNum
                tvResRoomNum?.text = roomNum
                tvCheckoutRoomDeparture?.text = "Room $roomNum • Departure"
            }
            tvHotelHospitalityDesc?.text = "Welcome to $hotelName. Our property features state-of-the-art guest rooms and 24/7 dedicated reception."
            tvCheckoutSub?.text = "We hope you had a pleasant stay at $hotelName."
            tvHotelCheckoutLabel?.text = "✓ Standard Check-out: $checkout"
            tvResCheckoutVal?.text = "By $checkout"
            tvHotelFrontDeskPhone?.text = "Front Desk Direct: $phone"
            tvCheckoutLuggagePhone?.text = "📞 Need luggage or airport transfer assistance? Reception: $phone"
            tvFooterQuietReception?.text = "Quiet Hours: $quietHours • Reception / Front Desk: $phone"

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
                    tvHotelAmenitiesList?.text = text
                    tvGuestAmenitiesList?.text = text
                    prefs.edit().putString("amenities_cached", text).apply()
                }
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
                    tvHotelTagline?.text = dSubtitle
                    prefs.edit().putString("hotel_tagline", dSubtitle).apply()
                }
            }

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
            Log.e(TAG, "Error applying server payload in screensaver", e)
        }
    }
}
