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

echo "--- ABI / translation properties ---"
{
  adb shell getprop ro.product.cpu.abilist
  adb shell getprop ro.product.cpu.abilist64
  adb shell getprop ro.product.cpu.abilist32
  adb shell getprop ro.dalvik.vm.native.bridge
  adb shell dumpsys package com.khmi.copticdictionary | grep -E 'primaryCpuAbi|secondaryCpuAbi|versionName|installerPackageName' | head -6
  echo "--- resolve launcher activity ---"
  adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER com.khmi.copticdictionary
} | tee capture/abi-info.txt

adb logcat -c || true
adb logcat -v threadtime > capture/logcat-live.txt &
LOGPID=$!

adb shell "screenrecord --time-limit 165 /sdcard/demo1.mp4" &
REC=$!
sleep 3

COMP=$(adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER com.khmi.copticdictionary 2>/dev/null | tail -1 | tr -d '\r')
echo "resolved component: $COMP"

# Workaround for proven SoLoader failure: APK ships arm64 libs only in-apk (extractNativeLibs=false),
# SoLoader's DirectApkSoSource probes lib/x86_64 under translation and misses. Fill the empty
# extracted-lib dir /data/app/.../lib/arm64 with the APK's own arm64-v8a libs (real libs, unmodified app).
adb root || true
sleep 3
adb wait-for-device
APKDIR=$(adb shell 'ls -d /data/app/*/com.khmi.copticdictionary-* 2>/dev/null' | tr -d '\r' | head -1)
echo "APKDIR=$APKDIR"
mkdir -p /tmp/apklibs && unzip -o -q app.apk 'lib/arm64-v8a/*' -d /tmp/apklibs
ls /tmp/apklibs/lib/arm64-v8a | head
adb shell "mkdir -p '$APKDIR/lib/arm64'"
adb push /tmp/apklibs/lib/arm64-v8a/. "$APKDIR/lib/arm64/"
adb shell "chmod 755 '$APKDIR/lib/arm64'/*.so"
adb shell "restorecon -R '$APKDIR/lib'" || true
adb shell "ls -la '$APKDIR/lib/arm64'" | head -5

echo "--- am start -W (direct launch after lib fill, real result) ---"
adb shell am start -W "$COMP" 2>&1 | tee capture/am-start.txt
sleep 20

if adb shell pidof com.khmi.copticdictionary >/dev/null 2>&1 && [ -n "$(adb shell pidof com.khmi.copticdictionary | tr -d '\r')" ]; then
  echo "APP ALIVE - dynamic navigation video capture"
  uix() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml | tr -d '\r'; }
  tapn() {
    B=$(uix | python3 -c "
import sys,re
x=sys.stdin.read()
pat=re.compile(r'<node[^>]*(?:text|content-desc)=\"[^\"]*'+sys.argv[1]+r'[^\"]*\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',re.I)
m=pat.search(x)
print(f'{(int(m.group(1))+int(m.group(3)))//2} {(int(m.group(2))+int(m.group(4)))//2}' if m else '')" "$1")
    if [ -n "$B" ]; then echo "tapn[$1] -> $B"; adb shell input tap $B; else echo "tapn[$1] fallback $2 $3"; adb shell input tap "$2" "$3"; fi
    sleep "${4:-4}"
  }
  # Start ONE continuous recording; let screenrecord exit naturally (graceful moov finalize)
  adb shell 'screenrecord --time-limit 150 /sdcard/demo1.mp4' &
  REC=$!
  sleep 3
  # dismiss notification permission dialog if present (Don't allow, else Allow)
  tapn "Don.t allow" 400 975 3
  tapn "^Allow" 400 865 3
  sleep 6                                  # home on camera
  adb exec-out screencap -p > capture/01-home.png
  tapn 'drawer|menu|☰|قائمة' 75 135 6      # hamburger (verified TOP LEFT px 75,135)
  adb exec-out screencap -p > capture/02-drawer.png
  sleep 3                                  # dwell on drawer
  tapn 'الكتاب المقدس' 480 580 7           # Bible row (verified from v10 drawer pixels)
  adb exec-out screencap -p > capture/03-bible.png
  tapn 'التكوين|Genesis|ⲅⲉⲛⲉⲥⲓⲥ' 400 400 7  # first book
  adb exec-out screencap -p > capture/04-book.png
  adb shell input tap 200 300; sleep 6     # chapter 1 cell (screenshot verifies)
  adb exec-out screencap -p > capture/05-chapter.png
  adb shell input keyevent KEYCODE_BACK; sleep 3
  adb shell input keyevent KEYCODE_BACK; sleep 3
  tapn 'بحث|Search' 360 530 4              # search field (v10 home pixels)
  adb shell input text "love"; sleep 7
  adb exec-out screencap -p > capture/06-search.png
  adb shell input tap 360 700; sleep 6     # first result
  adb exec-out screencap -p > capture/07-details.png
  adb shell input swipe 360 1100 360 500; sleep 4   # scroll details
  adb shell input keyevent KEYCODE_BACK; sleep 3
  tapn 'drawer|menu|☰|قائمة' 75 135 5      # drawer again
  tapn 'تعلم' 480 460 7                    # Learn Coptic row
  adb exec-out screencap -p > capture/08-learn.png
  adb shell input keyevent KEYCODE_BACK; sleep 3
  sleep 5
  echo "waiting for screenrecord natural exit (finalize)"
  wait $REC || true
  adb pull /sdcard/demo1.mp4 capture/demo1.mp4 || true
  ls -la capture/demo1.mp4 || true
else
  echo "APP NOT ALIVE after launch - no capture beats"
fi
if ! adb shell pidof com.khmi.copticdictionary; then
  echo "APP PROCESS NOT RUNNING AFTER DIRECT LAUNCH - evidence:"
  adb shell pidof com.khmi.copticdictionary || true
  sleep 3
  kill $LOGPID 2>/dev/null || true
  grep -iE 'AndroidRuntime|FATAL|ActivityManager.*coptic|abort|dlopen|UnsatisfiedLink|native bridge|incompat|arm64' capture/logcat-live.txt | tail -60 > capture/logcat-crash.txt || true
  adb exec-out screencap -p > capture/00-after-launch-attempt.png
  echo "STOPPING - evidence saved (no blind retry)"
  kill $EMU 2>/dev/null || true
  exit 1
fi
kill $LOGPID 2>/dev/null || true
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