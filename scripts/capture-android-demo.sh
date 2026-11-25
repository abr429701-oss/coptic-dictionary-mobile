#!/usr/bin/env bash
# Self-managed Android emulator capture: no third-party action, explicit adb/emulator lifecycle.
set -x
mkdir -p capture
SDK="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export PATH="$SDK/platform-tools:$SDK/emulator:$SDK/cmdline-tools/latest/bin:$PATH"

yes | sdkmanager --licenses >/dev/null || true
sdkmanager --install 'platforms;android-34' 'system-images;android-34;default;x86_64' 'emulator' 'platform-tools' >/dev/null
echo no | avdmanager create avd --force -n test --package 'system-images;android-34;default;x86_64' --device 'pixel_6'

# Clean adb state, then start fresh
adb kill-server || true
adb start-server
adb devices -l

# Launch emulator headless with software GL
emulator -avd test -no-window -no-audio -no-snapshot -no-boot-anim -no-metrics -gpu swiftshader_indirect -memory 4096 &
EMU=$!
sleep 5
adb start-server || true

# Own boot wait (max 420s)
BOOTED=""
for i in $(seq 1 84); do
  ST=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  if [ "$ST" = "1" ]; then BOOTED=1; break; fi
  if ! kill -0 $EMU 2>/dev/null; then echo "EMULATOR PROCESS DIED"; break; fi
  sleep 5
done
echo "booted=$BOOTED"
if [ -z "$BOOTED" ]; then
  adb devices -l
  kill $EMU 2>/dev/null || true
  exit 1
fi

adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell wm size

adb install -r app.apk

adb shell "screenrecord --time-limit 165 /sdcard/demo1.mp4" &
REC=$!
sleep 3

adb shell monkey -p com.khmi.copticdictionary -c android.intent.category.LAUNCHER 1
sleep 25
adb exec-out screencap -p > capture/01-home.png

adb shell input tap 540 300
sleep 3
adb shell input text "agapi"
sleep 8
adb exec-out screencap -p > capture/02-search.png
adb shell input keyevent KEYCODE_ENTER
sleep 8
adb exec-out screencap -p > capture/03-results.png
adb shell input tap 540 1000
sleep 8
adb exec-out screencap -p > capture/04-details.png
adb shell input swipe 540 1600 540 600
sleep 5
adb exec-out screencap -p > capture/05-details-scrolled.png

wait $REC || true
adb pull /sdcard/demo1.mp4 capture/demo1.mp4 || true
adb shell "screenrecord --time-limit 60 /sdcard/demo2.mp4" &
REC2=$!
adb shell input keyevent KEYCODE_BACK
sleep 4
adb shell input swipe 540 1800 540 500
sleep 4
adb exec-out screencap -p > capture/06-scroll.png
wait $REC2 || true
adb pull /sdcard/demo2.mp4 capture/demo2.mp4 || true
kill $EMU 2>/dev/null || true
ls -la capture/