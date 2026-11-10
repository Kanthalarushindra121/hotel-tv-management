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
    }

    private fun renderScreensaverState() {
        val hotelName = prefs.getString("hotel_name", "risky resto") ?: "risky resto"
        val tagline = prefs.getString("hotel_tagline", "Experience world-class luxury and hospitality.") ?: "Experience world-class luxury and hospitality."
        val roomNumber = prefs.getString("room_number", "122") ?: "122"
        val guestName = prefs.getString("guest_name", null)
        val checkoutTime = prefs.getString("checkout_time", "11:00") ?: "11:00"
        val conciergePhone = prefs.getString("concierge_phone", "+91 85559 72884") ?: "+91 85559 72884"
        val quietHours = prefs.getString("quiet_hours", "22:00 – 07:00") ?: "22:00 – 07:00"
        val wifiSsid = prefs.getString("wifi_ssid", "risky_resto_Guest") ?: "risky_resto_Guest"
        val wifiPass = prefs.getString("wifi_pass", "") ?: ""
        val wifiStatus = prefs.getString("wifi_status", "MATCHED") ?: "MATCHED"
        val amenities = prefs.getString("amenities_cached", "• Fitness Center (24/7)\n• Valet Parking (Complimentary)\n• 24/7 Room Service (Dial 9)")

        tvHotelName?.text = hotelName
        tvHotelTagline?.text = tagline
        tvGuestHotelMini?.text = hotelName.uppercase(Locale.getDefault())
        tvBadgeRoomHotel?.text = "ROOM $roomNumber"
        tvBadgeRoomGuest?.text = roomNumber
        tvCheckoutRoomDeparture?.text = "Room $roomNumber • Departure"
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
            val qrString = if (pass.isEmpty()) "WIFI:S:$ssid;;" else "WIFI:S:$ssid;T:WPA;P:$pass;;"
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

        layoutStateHotel?.visibility = View.VISIBLE
        layoutStateGuest?.visibility = View.GONE
        layoutStateCheckout?.visibility = View.GONE

        footerNormal?.visibility = View.VISIBLE
        footerCheckout?.visibility = View.GONE
        tvFooterWakeHint?.visibility = View.VISIBLE
        btnLaunchEntertainment?.visibility = View.GONE
    }

    private fun showStateGuest(guestName: String, roomNumber: String) {
        currentScreensaverState = TvScreenState.STATE_GUEST
        viewPairing?.visibility = View.GONE
        viewMainContainer?.visibility = View.VISIBLE

        headerGuest?.visibility = View.VISIBLE
        headerHotel?.visibility = View.GONE
        headerCheckout?.visibility = View.GONE

        tvGuestWelcomeName?.text = "Welcome, $guestName!"
        tvResGuestName?.text = guestName
        tvResRoomNum?.text = roomNumber
        tvBadgeRoomGuest?.text = roomNumber

        layoutStateGuest?.visibility = View.VISIBLE
        layoutStateHotel?.visibility = View.GONE
        layoutStateCheckout?.visibility = View.GONE

        footerNormal?.visibility = View.VISIBLE
        footerCheckout?.visibility = View.GONE
        btnLaunchEntertainment?.visibility = View.VISIBLE
        tvFooterWakeHint?.visibility = View.GONE
    }

    private fun showStateCheckout() {
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
            val backendUrl = if (saved != null && !saved.contains("192.168.") && !saved.contains("localhost") && !saved.contains("127.0.0.1")) {
                saved
            } else {
                BuildConfig.DEFAULT_BACKEND_URL
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

            // GUEST CHECKED IN -> Instantly update screensaver to Welcome Guest (Image 2)
            val onCheckin = { args: Array<Any> ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val guestName = data.optString("guestName", "Guest")
                        val roomNum = data.optString("roomNumber", prefs.getString("room_number", "122") ?: "122")
                        val checkoutTime = data.optString("checkoutTime", "11:00")

                        prefs.edit()
                            .putString("guest_name", guestName)
                            .putString("room_number", roomNum)
                            .putString("checkout_time", checkoutTime)
                            .apply()

                        handler.post {
                            tvResCheckoutVal?.text = "By $checkoutTime"
                            showStateGuest(guestName, roomNum)
                        }
                    }
                }
            }
            socket?.on("guest.checked_in") { onCheckin(it) }
            socket?.on("GUEST_CHECKED_IN") { onCheckin(it) }

            // GUEST CHECKED OUT -> Instantly show Checkout Thank You (Image 3), then return to Image 1
            val onCheckout = { _: Array<Any> ->
                prefs.edit().remove("guest_name").apply()
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
                    val data = args[0] as? JSONObject
                    if (data != null) {
                        val ssid = data.optString("networkName", data.optString("ssid", ""))
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
                    if (data != null) {
                        handler.post { applyServerPayload(data) }
                    }
                }
            }
            socket?.on("content.updated") { onContentUpdated(it) }
            socket?.on("CONTENT_UPDATED") { onContentUpdated(it) }
            socket?.on("screen.refresh") { onContentUpdated(it) }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket init error in screensaver: ${e.message}")
        }
    }

    private fun applyServerPayload(data: JSONObject) {
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

            val wifi = data.optJSONObject("wifi")
            val wifiSsid = wifi?.optString("networkName", "") ?: ""
            val wifiPass = wifi?.optString("password", "") ?: ""
            val wifiStatus = wifi?.optString("status", "MATCHED") ?: "MATCHED"

            prefs.edit().apply {
                putString("hotel_name", hotelName)
                putString("room_number", roomNum)
                putString("checkout_time", checkout)
                putString("concierge_phone", phone)
                putString("wifi_ssid", wifiSsid)
                putString("wifi_pass", wifiPass)
                putString("wifi_status", wifiStatus)
            }.apply()

            tvHotelName?.text = hotelName
            tvGuestHotelMini?.text = hotelName.uppercase(Locale.getDefault())
            tvBadgeRoomHotel?.text = "ROOM $roomNum"
            tvBadgeRoomGuest?.text = roomNum
            tvResRoomNum?.text = roomNum
            tvCheckoutRoomDeparture?.text = "Room $roomNum • Departure"
            tvHotelCheckoutLabel?.text = "✓ Standard Check-out: $checkout"
            tvResCheckoutVal?.text = "By $checkout"
            tvHotelFrontDeskPhone?.text = "Front Desk Direct: $phone"
            tvCheckoutLuggagePhone?.text = "📞 Need luggage or airport transfer assistance? Reception: $phone"

            renderWifiDetails(wifiSsid, wifiPass, wifiStatus)

            val guest = data.optJSONObject("guest")
            if (guest != null && !guest.optString("name", "").isNullOrEmpty()) {
                val guestName = guest.optString("name", "Guest")
                prefs.edit().putString("guest_name", guestName).apply()
                showStateGuest(guestName, roomNum)
            } else {
                prefs.edit().remove("guest_name").apply()
                showStateHotel()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error applying server payload in screensaver", e)
        }
    }
}
