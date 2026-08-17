import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/studybuddy/AuthProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudyBuddy AI – Your personal AI study companion",
  description: "Mobile-first AI study buddy. Flashcards, quizzes, graphs, language practice and more.",
  keywords: ["StudyBuddy", "AI", "study", "flashcards", "quiz", "learning"],
  authors: [{ name: "StudyBuddy AI" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
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
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}
      >
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
