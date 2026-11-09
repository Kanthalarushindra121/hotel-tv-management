package com.smartstaytv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * SmartStay TV Boot Receiver
 * Automatically launches the SmartStay welcome screen on TV power on / boot if paired.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmartStayBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.i(TAG, "SmartStay TV received boot broadcast: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            val prefs = context.getSharedPreferences("smartstay_tv_prefs", Context.MODE_PRIVATE)
            val isPaired = prefs.getBoolean("is_paired", false)
            Log.i(TAG, "Device boot finished. Device isPaired = $isPaired")

            if (isPaired) {
                try {
                    val launchIntent = Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        putExtra("from_boot", true)
                    }
                    context.startActivity(launchIntent)
                    Log.i(TAG, "Successfully started SmartStay welcome screen on TV boot")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to launch SmartStay on boot: ${e.message}", e)
                }
            }
        }
    }
}

