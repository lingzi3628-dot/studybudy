"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const ClerkSignUp = dynamic(
  () => import("@clerk/nextjs").then((m) => m.SignUp),
  { ssr: false }
);

export default function SignUpPage() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkConfigured = Boolean(pk && pk.startsWith("pk_"));

  if (clerkConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ClerkSignUp />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl bg-white border border-gray-200 p-8 shadow-md text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-2xl font-bold">
          📚
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">StudyBuddy AI</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign-up runs in dev mode. Add Clerk credentials in <code>.env</code> to enable real sign-up.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full h-11 rounded-full bg-indigo-600 text-white font-semibold leading-[44px]"
        >
          Continue as dev user (Alex)
        </Link>
      </div>
    </div>
  );
}
