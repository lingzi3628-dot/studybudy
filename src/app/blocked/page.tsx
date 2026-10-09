"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Globe, MapPin, ShieldAlert } from "lucide-react";

function BlockedContent() {
  const searchParams = useSearchParams();
  const country = searchParams.get("country") || "your country";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-amber-600" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Access Restricted
        </h1>

        {/* Message */}
        <p className="text-sm text-gray-600 mb-4">
          This service is currently only available in Kenya. We detected your
          connection from <span className="font-semibold text-gray-800">{country}</span>.
        </p>

        {/* Kenya-only badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full mb-4">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700">Available in Kenya only</span>
        </div>

        {/* Proxy link info */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-4">
          <p className="text-xs text-gray-500">
            <Globe className="w-3 h-3 inline mr-1" />
            If you have a proxy link from your administrator, please use it to access the site.
          </p>
        </div>

        {/* Contact */}
        <p className="text-xs text-gray-400">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}

export default function BlockedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-amber-600" />
        </div>
      </div>
    }>
      <BlockedContent />
    </Suspense>
  );
}
