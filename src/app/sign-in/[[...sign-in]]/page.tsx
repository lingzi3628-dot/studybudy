"use client";

import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl bg-white border border-gray-200 p-8 shadow-md text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white text-2xl font-bold">
          S
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">StudyBuddy AI</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign in from the home page to continue.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full h-11 rounded-full bg-indigo-600 text-white font-semibold leading-[44px]"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
