#!/bin/bash
set -e

export JAVA_HOME=/tmp/jdk17
export PATH="/tmp/jdk17/bin:$PATH"
export ANDROID_SDK_ROOT=/tmp/android-sdk
export ANDROID_HOME=/tmp/android-sdk

echo "=== APK Build Started at $(date) ==="
echo "Java: $(java -version 2>&1 | head -1)"

cd /home/runner/workspace/artifacts/coptic-dictionary

# Run prebuild if android dir doesn't exist
if [ ! -d "android" ]; then
  echo "Running expo prebuild..."
  CI=1 EXPO_NO_GIT_STATUS_CHECK=1 pnpm exec expo prebuild --platform android --clean --no-install
fi

cd android
echo "sdk.dir=/tmp/android-sdk" > local.properties

chmod +x ./gradlew

echo "=== Building APK (this takes 10-20 minutes) ==="
./gradlew assembleRelease --no-daemon 2>&1

APK_PATH=$(find . -name "*.apk" -type f 2>/dev/null | head -1)
if [ -n "$APK_PATH" ]; then
  echo "=== APK BUILD SUCCESS ==="
  echo "APK: $APK_PATH"
  cp "$APK_PATH" /home/runner/workspace/artifacts/api-server/public/coptic-dictionary.apk
  echo "=== APK copied to public folder ==="
  ls -lh /home/runner/workspace/artifacts/api-server/public/coptic-dictionary.apk
else
  echo "=== APK BUILD FAILED - no APK found ==="
fi
