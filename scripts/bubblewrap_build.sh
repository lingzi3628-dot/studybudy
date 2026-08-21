#!/bin/bash
# Non-interactive bubblewrap build
set -e

cd /home/z/my-project/twa

export JAVA_HOME="$HOME/jdk17"
export PATH="$JAVA_HOME/bin:$HOME/android-sdk/cmdline-tools/latest/bin:$HOME/android-sdk/platform-tools:$PATH"
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export KEYSTORE_PASSWORD=studybuddy
export KEY_PASSWORD=studybuddy

# Use bubblewrap directly via the local bin
BUBBLEWRAP="$HOME/.npm-global/bin/bubblewrap"

echo "[+] Building APK via bubblewrap build..."
"$BUBBLEWRAP" build --manifest ./twa-manifest.json --directory ./

echo
echo "[+] Build artifacts:"
ls -la app-release-signed.apk app-release-signed.aab 2>/dev/null || ls -la *.apk *.aab 2>/dev/null
