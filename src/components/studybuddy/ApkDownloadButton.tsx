import { FileDown } from "lucide-react";

/** Direct download keeps large APK files out of browser memory. */
export function ApkDownloadButton() {
  return (
    <a
      href="/app-release.apk?v=24a56483"
      download="StudyBuddy-Android.apk"
      className="inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-700"
    >
      <FileDown className="h-4 w-4" />
      Download Android App (APK)
    </a>
  );
}
