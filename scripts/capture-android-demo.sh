#!/usr/bin/env bash
# Real-device demo capture for the Coptic Dictionary Android app (release APK v1.3.1).
# Runs inside android-emulator-runner on a hardware-accelerated emulator.
set -x
mkdir -p capture

adb wait-for-device
# Wait for full boot
while [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" != "1" ]; do sleep 2; done
sleep 5
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

adb install -r app.apk

# Screen size for coordinate math
adb shell wm size

# Start native screen recording (max 170s per take)
adb shell "screenrecord --time-limit 165 /sdcard/demo1.mp4" &
REC=$!
sleep 3

# Launch the real app
adb shell monkey -p com.khmi.copticdictionary -c android.intent.category.LAUNCHER 1
sleep 25
adb exec-out screencap -p > capture/01-home.png

# Tap the search field (top area) and type a query
adb shell input tap 540 300
sleep 3
adb shell input text "agapi"
sleep 8
adb exec-out screencap -p > capture/02-search.png

adb shell input keyevent KEYCODE_ENTER
sleep 8
adb exec-out screencap -p > capture/03-results.png

# Open first result
adb shell input tap 540 1000
sleep 8
adb exec-out screencap -p > capture/04-details.png

# Scroll in details
adb shell input swipe 540 1600 540 600
sleep 5
adb exec-out screencap -p > capture/05-details-scrolled.png

wait $REC || true
adb pull /sdcard/demo1.mp4 capture/demo1.mp4 || true
ls -la capture/