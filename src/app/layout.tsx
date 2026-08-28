import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/studybuddy/AuthProvider";
import { ServiceWorkerRegister } from "@/components/studybuddy/ServiceWorkerRegister";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudyBuddy AI – Your personal AI study companion",
  description: "Mobile-first AI study buddy. Flashcards, quizzes, graphs, language practice, AI tutor, and spaced-repetition memory.",
  keywords: ["StudyBuddy", "AI", "study", "flashcards", "quiz", "learning", "PWA"],
  authors: [{ name: "StudyBuddy AI" }],
  applicationName: "StudyBuddy AI",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "StudyBuddy AI",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "StudyBuddy AI",
    description: "Your personal AI study companion",
    siteName: "StudyBuddy AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyBuddy AI",
    description: "Your personal AI study companion",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}
      >
        {/* Phase 45: Skip-to-content link for keyboard / screen-reader users.
            Visually hidden until focused, then jumps to the main landmark. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <AuthProvider>
          <div id="main-content">{children}</div>
        </AuthProvider>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
