# ProGuard rules for SmartStay TV
-keepattributes *Annotation*
-keepclassmembers class * {
    @org.greenrobot.eventbus.Subscribe <methods>;
}
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keep class com.google.gson.** { *; }
-keep class com.google.zxing.** { *; }

