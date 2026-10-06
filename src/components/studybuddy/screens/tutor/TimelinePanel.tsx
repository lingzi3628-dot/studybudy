"use client";
import { useState, useMemo } from "react";

/**
 * TimelinePanel — interactive timeline of events.
 *
 * Phase 8 round 3: now accepts an optional `onChange` callback. When the
 * learner edits an event's date, label, or description (or adds/removes
 * events), onChange fires so the parent can persist the edit to the
 * workspace tab + DB.
 */
export function TimelinePanel({
  spec,
  onChange,
}: {
  spec: any;
  onChange?: (newSpec: any) => void;
}) {
  const events = Array.isArray(spec?.events) ? spec.events : [];
  const direction = spec?.direction === "horizontal" ? "horizontal" : "vertical";
  const [editMode, setEditMode] = useState(false);
  const [localEvents, setLocalEvents] = useState(events);

  if (events.length === 0) {
    return <div className="p-3 text-center text-xs text-gray-400">No timeline events provided.</div>;
  }

  // Sort by date if available
  const sorted = useMemo(() => {
    return [...(editMode ? localEvents : events)].sort((a: any, b: any) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
  }, [events, localEvents, editMode]);

  const emitChange = (newEvents: any[]) => {
    setLocalEvents(newEvents);
    if (onChange) {
      onChange({ ...spec, events: newEvents });
    }
  };

  const updateEvent = (idx: number, field: string, value: string) => {
    const updated = localEvents.map((e: any, i: number) =>
      i === idx ? { ...e, [field]: value } : e
    );
    emitChange(updated);
  };

  const removeEvent = (idx: number) => {
    emitChange(localEvents.filter((_: any, i: number) => i !== idx));
  };

  const addEvent = () => {
    emitChange([...localEvents, { date: new Date().getFullYear().toString(), label: "New event", description: "" }]);
  };

  // === Edit mode — inline event editors ===
  if (editMode) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase text-amber-600">Edit mode</span>
          <button onClick={() => setEditMode(false)} className="text-[10px] text-indigo-600 font-semibold">
            ✓ Done
          </button>
        </div>
        {localEvents.map((e: any, i: number) => (
          <div key={i} className="p-2 bg-gray-50 rounded-lg space-y-1.5 border border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={e.date || ""}
                onChange={(ev) => updateEvent(i, "date", ev.target.value)}
                placeholder="Date"
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded font-bold text-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button onClick={() => removeEvent(i)} className="text-red-400 hover:text-red-600 text-xs px-1" title="Remove event">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={e.label || e.title || ""}
              onChange={(ev) => updateEvent(i, "label", ev.target.value)}
              placeholder="Event label"
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={e.description || ""}
              onChange={(ev) => updateEvent(i, "description", ev.target.value)}
              placeholder="Description (optional)"
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        ))}
        <button onClick={addEvent} className="w-full py-1.5 text-xs font-semibold text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50">
          + Add event
        </button>
      </div>
    );
  }

  // === View mode ===
  return (
    <div className="p-3">
      <div className="flex justify-end mb-2">
        <button onClick={() => { setLocalEvents(events); setEditMode(true); }} className="text-[10px] text-indigo-600 font-semibold px-2 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100">
          ✎ Edit events
        </button>
      </div>
      {direction === "horizontal" ? (
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
      ) : (
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
      )}
    </div>
  );
}
