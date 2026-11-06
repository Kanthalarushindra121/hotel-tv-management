#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  SmartStay TV — Native Android TV APK Builder"
echo "=========================================================="

export ANDROID_HOME="/opt/android-sdk-linux"
export ANDROID_SDK_ROOT="/opt/android-sdk-linux"
export PATH="$PATH:/opt/android-sdk-linux/cmdline-tools/latest/bin:/opt/android-sdk-linux/platform-tools:/opt/gradle/bin"

# 1. Accept Android licenses
echo "[1/4] Accepting Android SDK licenses..."
yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null 2>&1 || true

# 2. Check or download Gradle 8.7
if [ ! -f "/opt/gradle/bin/gradle" ]; then
    echo "[2/4] Downloading and setting up Gradle 8.7..."
    mkdir -p /opt
    if [ ! -f "/tmp/gradle-8.7-bin.zip" ]; then
        curl -sL https://services.gradle.org/distributions/gradle-8.7-bin.zip -o /tmp/gradle-8.7-bin.zip
    fi
    unzip -q -o /tmp/gradle-8.7-bin.zip -d /opt/
    ln -sfn /opt/gradle-8.7 /opt/gradle
fi

echo "[3/4] Running Gradle Build for SmartStay TV APK..."
/opt/gradle/bin/gradle assembleDebug --no-daemon --stacktrace

# 3. Create release directory & copy APK
echo "[4/4] Finalizing APK artifacts..."
mkdir -p /project/app/build/outputs/apk/release
mkdir -p /project/app/build/outputs/apk/debug

if [ -f "/project/app/build/outputs/apk/debug/app-debug.apk" ]; then
    cp -f "/project/app/build/outputs/apk/debug/app-debug.apk" "/project/app/build/outputs/apk/release/app-release.apk"
    echo "=========================================================="
    echo "  SUCCESS! APK generated successfully:"
    ls -lh /project/app/build/outputs/apk/debug/app-debug.apk
    ls -lh /project/app/build/outputs/apk/release/app-release.apk
    echo "=========================================================="
else
    echo "Error: APK file not found after build!"
    exit 1
fi

