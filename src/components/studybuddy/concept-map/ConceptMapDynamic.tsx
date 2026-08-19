"use client";

import dynamic from "next/dynamic";
import { type ConceptMapProps } from "./ConceptMap";

/**
 * Dynamic import wrapper for ConceptMap.
 * React Flow uses browser APIs (ResizeObserver, DOM measurements) so it
 * must be loaded with ssr: false to avoid Next.js hydration mismatches.
 */
export const ConceptMapDynamic = dynamic<ConceptMapProps>(
  () => import("./ConceptMap").then((m) => m.ConceptMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-xs"
        style={{ height: 500 }}>
        Loading map…
      </div>
    ),
  }
);
