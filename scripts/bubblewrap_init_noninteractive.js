#!/usr/bin/env node
/**
 * Non-interactive bubblewrap "init" — uses bubblewrap/core directly to:
 *   1. Fetch web manifest from Vercel
 *   2. Build a TwaManifest from the existing bubblewrap-config.json
 *   3. Save twa-manifest.json + checksum
 *   4. Run TwaGenerator.createTwaProject to scaffold the Android project
 *   5. Generate a self-signed keystore via keytool (non-interactive)
 *
 * This avoids all the interactive prompts that bubblewrap init shows.
 */
const path = require("path");
const fs = require("fs");
const { execSync, spawnSync } = require("child_process");

// Make bubblewrap's modules resolvable
const BUBBLEWRAP_CLI = "/home/z/.npm-global/lib/node_modules/@bubblewrap/cli";
const BUBBLEWRAP_CORE = path.join(
  BUBBLEWRAP_CLI,
  "node_modules",
  "@bubblewrap",
  "core"
);

const Color = require(path.join(
  BUBBLEWRAP_CLI,
  "node_modules",
  "color"
));
const {
  Config,
  TwaManifest,
  TwaGenerator,
  KeyTool,
  JdkHelper,
} = require(BUBBLEWRAP_CORE);
const { ShortcutInfo } = require(
  path.join(BUBBLEWRAP_CORE, "dist", "lib", "ShortcutInfo.js")
);
const { generateManifestChecksumFile } = require(
  path.join(BUBBLEWRAP_CLI, "dist", "lib", "cmds", "shared.js")
);

const PROJECT_ROOT = "/home/z/my-project";
const TWA_DIR = path.join(PROJECT_ROOT, "twa");
const CONFIG_FILE = path.join(PROJECT_ROOT, "bubblewrap-config.json");
const WEB_MANIFEST_URL = "https://studybudy-chi.vercel.app/manifest.json";

const KEYSTORE_PASSWORD = process.env.KEYSTORE_PASSWORD || "studybuddy";
const KEY_PASSWORD = process.env.KEY_PASSWORD || "studybuddy";

function main() {
  console.log("[+] Setting up environment...");

  // Build a Config object so JdkHelper / KeyTool can locate tools
  const config = new Config(
    path.join(require("os").homedir(), "jdk17"),
    path.join(require("os").homedir(), "android-sdk")
  );

  // Override JDK path to our JDK 17
  process.env.JDK_PATH = path.join(require("os").homedir(), "jdk17");
  process.env.ANDROID_HOME = path.join(
    require("os").homedir(),
    "android-sdk"
  );

  // Step 1: Load bubblewrap-config.json
  console.log("[+] Loading bubblewrap-config.json...");
  const bubblewrapConfig = JSON.parse(
    fs.readFileSync(CONFIG_FILE, "utf-8")
  );

  // Step 2: Fetch web manifest from Vercel and build a TwaManifest.
  // We use TwaManifest.fromWebManifest() — same as bubblewrap init.
  // However, that builds a default manifest. We then override fields with our
  // bubblewrap-config.json values.
  console.log(`[+] Fetching web manifest from ${WEB_MANIFEST_URL} ...`);
  TwaManifest.fromWebManifest(WEB_MANIFEST_URL).then(async (twaManifest) => {
    // Override fields from bubblewrap-config.json
    twaManifest.packageId = bubblewrapConfig.packageId;
    twaManifest.host = bubblewrapConfig.host;
    twaManifest.name = bubblewrapConfig.applicationName;
    twaManifest.launcherName = bubblewrapConfig.applicationName.substring(
      0,
      12
    );
    twaManifest.startUrl = bubblewrapConfig.startUrl;
    twaManifest.themeColor = new Color(bubblewrapConfig.themeColor);
    if (bubblewrapConfig.navigationColor) {
      twaManifest.navigationColor = new Color(bubblewrapConfig.navigationColor);
      twaManifest.navigationColorDark = new Color(
        bubblewrapConfig.navigationColorDark
      );
      twaManifest.navigationDividerColor = new Color(
        bubblewrapConfig.navigationDividerColor
      );
      twaManifest.navigationDividerColorDark = new Color(
        bubblewrapConfig.navigationDividerColorDark
      );
    }
    twaManifest.appVersionName = bubblewrapConfig.appVersionName;
    twaManifest.appVersionCode = bubblewrapConfig.appVersionCode;
    twaManifest.iconUrl = `https://${bubblewrapConfig.host}${bubblewrapConfig.iconUrl}`;
    if (bubblewrapConfig.maskableIconUrl) {
      twaManifest.maskableIconUrl = `https://${bubblewrapConfig.host}${bubblewrapConfig.maskableIconUrl}`;
    }
    twaManifest.signingKey = {
      path: path.join(TWA_DIR, "android.keystore"),
      alias: bubblewrapConfig.signingKey.alias,
    };
    if (bubblewrapConfig.shortcuts) {
      twaManifest.shortcuts = bubblewrapConfig.shortcuts.map((s) => {
        return new ShortcutInfo(
          s.name,
          s.shortName,
          s.url,
          `https://${bubblewrapConfig.host}${s.iconUrl}`,
          undefined,
          undefined
        );
      });
    }
    if (bubblewrapConfig.fallbackType) {
      twaManifest.fallbackType = bubblewrapConfig.fallbackType;
    }
    if (bubblewrapConfig.features) {
      twaManifest.features = bubblewrapConfig.features;
    }
    if (bubblewrapConfig.alphaDependencies) {
      twaManifest.alphaDependencies = bubblewrapConfig.alphaDependencies;
    }
    twaManifest.enableSiteSettingsShortcut =
      bubblewrapConfig.enableSiteSettingsShortcut ?? false;
    twaManifest.isChromeOSOnly = bubblewrapConfig.isChromeOSOnly ?? false;
    twaManifest.display = bubblewrapConfig.display ?? "standalone";
    twaManifest.orientation = bubblewrapConfig.orientation ?? "portrait";
    twaManifest.splashScreenFadeOutDuration =
      bubblewrapConfig.splashScreenFadeOutDuration ?? 300;

    // Validate
    const validationError = twaManifest.validate();
    if (validationError) {
      throw new Error(`TwaManifest validation failed: ${validationError}`);
    }

    // Step 3: Make TWA_DIR
    fs.mkdirSync(TWA_DIR, { recursive: true });

    // Step 4: Save twa-manifest.json
    const manifestPath = path.join(TWA_DIR, "twa-manifest.json");
    await twaManifest.saveToFile(manifestPath);
    console.log(`[+] Saved ${manifestPath}`);

    // Step 5: Generate the project
    console.log("[+] Generating TWA project...");
    const generator = new TwaGenerator();
    const log = {
      warn: (msg) => console.warn("[warn]", msg),
      info: (msg) => console.log("[info]", msg),
      error: (msg) => console.error("[err]", msg),
      debug: (msg) => console.log("[debug]", msg),
    };
    await generator.createTwaProject(TWA_DIR, twaManifest, log, (p) =>
      process.stdout.write(`\r[progress] ${Math.round(p * 100)}%`)
    );
    process.stdout.write("\n");

    // Step 6: Generate checksum
    console.log("[+] Generating manifest checksum...");
    await generateManifestChecksumFile(manifestPath, TWA_DIR);

    // Step 7: Create keystore (non-interactive)
    const keystorePath = twaManifest.signingKey.path;
    if (!fs.existsSync(keystorePath)) {
      console.log("[+] Creating signing keystore (non-interactive)...");
      const jdkHelper = new JdkHelper(process, config);
      const keytool = new KeyTool(jdkHelper);
      await keytool.createSigningKey({
        fullName: "StudyBuddy",
        organizationalUnit: "App",
        organization: "StudyBuddy",
        country: "US",
        password: KEYSTORE_PASSWORD,
        keypassword: KEY_PASSWORD,
        alias: twaManifest.signingKey.alias,
        path: keystorePath,
      });
      console.log(`[+] Keystore saved to ${keystorePath}`);
    } else {
      console.log(`[+] Keystore already exists: ${keystorePath}`);
    }

    console.log("[+] DONE — TWA project ready in ./twa");
  }).catch((err) => {
    console.error("[!] Error:", err);
    process.exit(1);
  });
}

main();
