# StudyBuddy Mobile

An Expo / React Native app with native screens. It uses the existing StudyBuddy
API and Neon-backed Prisma database; the database connection string stays on
the server. It does not embed or open the website.

## Run locally

1. Install Node.js 22.13 or newer.
2. Copy `env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the deployed
   web app URL (or your reachable local Next.js URL).
3. Install and start the mobile app:

   ```sh
   cd mobile
   npm install
   npm start -- --tunnel --go
   ```

Sign in or create an account directly in the app. New accounts use the existing
email verification flow. The app stores its session token using iOS Keychain /
Android Keystore and calls the API for account, study, search, tutor, and
progress data. Each account gets a short guided tour and a personalized
onboarding flow that can create a four-week learning path. Home shows saved
daily goals, and an optional local 7:00 PM study reminder can be enabled during
onboarding or from Profile. The API continues to use Neon on the server.

## Publishing app updates

The production APK checks the `production` EAS Update channel on launch, when
the app returns to the foreground, and every 15 minutes while it is open. If a
JavaScript/assets update is available, StudyBuddy shows an **Update now** banner;
tapping it downloads the update in the app and restarts into the new version.

Publish screen, copy, and other JavaScript changes with:

```sh
cd mobile
EXPO_PUBLIC_API_URL=https://studybudy-chi.vercel.app npx eas-cli update --channel production --message "Describe the update"
```

Changes to native dependencies, permissions, the Expo SDK, or other native app
configuration still need a new production APK. Increase `expo.version` and
`expo.android.versionCode` for each new APK so Android can install it over the
previous release.
