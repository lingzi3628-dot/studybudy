# Building the StudyBuddy AI Android App (TWA)

This guide walks you through packaging the StudyBuddy AI web app as an
Android app using **Trusted Web Activity (TWA)** via Google's Bubblewrap CLI.

## Prerequisites

1. **Node.js 18+** and npm
2. **Android Studio** (for the SDK) or just the Android command-line tools
3. **Java JDK 17** (required by Bubblewrap)
4. A Google Play Developer account ($25 one-time fee) to publish

## Step 1: Install Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

Verify:
```bash
bubblewrap --version
```

## Step 2: Generate the Android Project

From the project root (where `bubblewrap-config.json` lives):

```bash
bubblewrap init --manifest https://studybudy-chi.vercel.app/manifest.json
```

This will:
- Fetch the web manifest from the live URL
- Create a `twa/` folder with the Android Studio project
- Download the Digital Asset Links file

If you have a custom config, use:
```bash
bubblewrap init --config ./bubblewrap-config.json
```

Answer any prompts (accept defaults for most).

## Step 3: Build the APK/AAB

```bash
cd twa
bubblewrap build
```

This produces:
- `app-release-signed.aab` (App Bundle — for Play Store)
- `app-release-signed.apk` (APK — for direct install/testing)

## Step 4: Digital Asset Links

For the TWA to work without a browser address bar, you need a
Digital Asset Links file at:

```
https://studybudy-chi.vercel.app/.well-known/assetlinks.json
```

Bubblewrap will generate this for you. Copy the file to:

```
public/.well-known/assetlinks.json
```

Then deploy and verify it's accessible at the URL above.

## Step 5: Test on Device

```bash
# Install the APK on a connected device
adb install twa/app-release-signed.apk
```

Or use Android Studio's emulator.

## Step 6: Upload to Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Create a new app
3. Upload the `.aab` file
4. Fill in store listing (description, screenshots, etc.)
5. Submit for review (usually 1-3 days)

## Configuration Reference

All settings are in `bubblewrap-config.json` at the project root:

| Field | Value | Description |
|---|---|---|
| `applicationName` | StudyBuddy AI | App name |
| `packageId` | ai.studybuddy.app | Android package name |
| `host` | studybudy-chi.vercel.app | Your deployed URL |
| `themeColor` | #4F46E5 | Matches PWA theme |
| `iconUrl` | /icon-512.png | App icon |
| `appVersionName` | 1.0.0 | Human-readable version |
| `appVersionCode` | 1 | Numeric version |
| `shortcuts` | Search, Tutor, Home | App shortcuts |

## Updating the App

When you make web changes (new features, bug fixes):
1. Deploy to Vercel (git push → auto-deploy)
2. Bump `appVersionCode` in `bubblewrap-config.json`
3. Rebuild: `cd twa && bubblewrap build`
4. Upload new `.aab` to Play Console

The web app updates are **instant** — users get them on next launch.
Only native changes (version code, shortcuts, theme) need a new APK.

## Troubleshooting

### Address bar still showing
- Verify `assetlinks.json` is served from `https://YOUR_DOMAIN/.well-known/assetlinks.json`
- Check it's valid JSON with the correct package name and fingerprint

### App won't install
- Make sure `packageId` is unique (not already on Play Store)
- Check that the keystore is valid

### Build fails
- Ensure JDK 17 is installed: `java -version`
- Ensure Android SDK is available: `echo $ANDROID_HOME`
- Try: `bubblewrap build --skipPwaCheck` (if PWA validation fails)
