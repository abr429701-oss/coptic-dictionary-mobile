#!/usr/bin/env bash
# Self-managed Android emulator capture: no third-party action, explicit adb/emulator lifecycle.
set -x
mkdir -p capture
SDK="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export PATH="$SDK/platform-tools:$SDK/emulator:$SDK/cmdline-tools/latest/bin:$PATH"

export ANDROID_SDK_ROOT="$SDK"
export ANDROID_AVD_HOME="$HOME/.android/avd"
mkdir -p "$ANDROID_AVD_HOME"

yes | sdkmanager --sdk_root="$SDK" --licenses >/dev/null || true
sdkmanager --sdk_root="$SDK" --install 'platforms;android-34' 'system-images;android-34;google_apis;x86_64' 'emulator' 'platform-tools' || { echo SDKMANAGER_INSTALL_FAILED; exit 1; }
echo "--- installed packages ---"
sdkmanager --sdk_root="$SDK" --list_installed | head -20

create_avd() {
  echo no | avdmanager create avd --force -n test --package 'system-images;android-34;google_apis;x86_64' --device "$1"
}
create_avd 'pixel_6' || create_avd 'pixel' || echo "AVD create exit=$?"
echo "--- avd dir after create ---"
ls -la "$ANDROID_AVD_HOME" || true
avdmanager list avd || true
if [ ! -f "$ANDROID_AVD_HOME/test.ini" ]; then
  echo "AVD_MISSING_AFTER_CREATE"
  exit 1
fi

# Clean adb state, then start fresh
adb kill-server || true
adb start-server
adb devices -l
echo "--- accel check ---"
emulator -accel-check || true

launch_emu() {
  emulator -avd test -no-window -no-audio -no-snapshot -no-boot-anim -no-metrics -gpu swiftshader_indirect -memory 4096 $1 &
  EMU=$!
}

wait_boot() {
  adb wait-for-device
  for i in $(seq 1 84); do
    ST=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$ST" = "1" ]; then return 0; fi
    if ! kill -0 $EMU 2>/dev/null; then echo "EMULATOR PROCESS DIED"; return 1; fi
    sleep 5
  done
  return 1
}

BOOTED=""
launch_emu "-accel on"
if wait_boot; then BOOTED=1; fi
if [ -z "$BOOTED" ]; then
  echo "KVM attempt failed, retrying software accel"
  kill $EMU 2>/dev/null || true
  sleep 3
  adb kill-server || true
  adb start-server
  launch_emu "-accel off"
  if wait_boot; then BOOTED=1; fi
fi
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

if ! adb install -r app.apk 2>&1 | tee /tmp/install.log | grep -qi success; then
  echo "APK INSTALL FAILED"
  exit 1
fi

adb shell "screenrecord --time-limit 165 /sdcard/demo1.mp4" &
REC=$!
sleep 3

adb shell monkey -p com.khmi.copticdictionary -c android.intent.category.LAUNCHER 1
sleep 25
adb shell pidof com.khmi.copticdictionary || echo "APP PROCESS NOT RUNNING AFTER LAUNCH"
adb exec-out screencap -p > capture/00-launch.png
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