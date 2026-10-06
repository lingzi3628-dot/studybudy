"use client";
import { useMemo } from "react";

export function TimelinePanel({ spec }: { spec: any }) {
  const events = Array.isArray(spec?.events) ? spec.events : [];
  const direction = spec?.direction === "horizontal" ? "horizontal" : "vertical";

  if (events.length === 0) {
    return <div className="p-3 text-center text-xs text-gray-400">No timeline events provided.</div>;
  }

  // Sort by date if available
  const sorted = useMemo(() => {
    return [...events].sort((a: any, b: any) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
  }, [events]);

  if (direction === "horizontal") {
    return (
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-2 min-w-max px-2">
          {sorted.map((e: any, i: number) => (
            <div key={i} className="flex flex-col items-center w-32 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-indigo-600 border-2 border-white shadow-sm" />
              <div className="w-0.5 h-8 bg-indigo-200" />
              <div className="text-[10px] font-bold text-indigo-600 text-center">{e.date || e.year || `Event ${i+1}`}</div>
              <div className="text-[10px] text-gray-600 text-center mt-0.5 leading-tight">{e.title || e.label || ""}</div>
              {e.description && <div className="text-[9px] text-gray-400 text-center mt-0.5 leading-tight">{e.description}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="relative border-l-2 border-indigo-200 ml-2">
        {sorted.map((e: any, i: number) => (
          <div key={i} className="mb-4 ml-4 relative">
            <div className="absolute -left-[1.4rem] w-3 h-3 rounded-full bg-indigo-600 border-2 border-white shadow-sm top-0.5" />
            <div className="text-xs font-bold text-indigo-600">{e.date || e.year || `Event ${i+1}`}</div>
            <div className="text-sm font-semibold text-gray-800 mt-0.5">{e.title || e.label || ""}</div>
            {e.description && <div className="text-xs text-gray-500 mt-0.5">{e.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
