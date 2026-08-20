"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X, Loader2, AlertCircle, Check, Coins, Crown, Palette,
  Bot, ShoppingBag, ChevronRight, Volume2,
} from "lucide-react";
import { useApp } from "../store";

type ShopTab = "themes" | "objects" | "pets";

/**
 * RoomShop — Phase 15 customization shop modal.
 * Spend coins on themes, furniture, decorations, and pets.
 */
export function RoomShopModal({ open, onClose, topicId, coinBalance, onPurchased }: {
  open: boolean;
  onClose: () => void;
  topicId: string;
  coinBalance: number;
  onPurchased: () => void;
}) {
  const [tab, setTab] = useState<ShopTab>("themes");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themesRes, objectsRes, petsRes] = await Promise.all([
        fetch("/api/admin/themes").then(r => r.ok ? r.json() : { themes: [] }).catch(() => ({ themes: [] })),
        fetch(`/api/study-room/${topicId}/objects`).then(r => r.ok ? r.json() : { objects: [] }).catch(() => ({ objects: [] })),
        fetch("/api/pets").then(r => r.ok ? r.json() : { pets: [] }).catch(() => ({ pets: [] })),
      ]);
      setItems({
        themes: themesRes.themes ?? [],
        objects: objectsRes.objects ?? [],
        pets: petsRes.pets ?? [],
      } as any);
    } catch {}
    setLoading(false);
  }, [topicId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const purchase = async (type: ShopTab, itemId: string, coinCost: number) => {
    if (coinCost > coinBalance) {
      setToast(`Need ${coinCost} coins — you have ${coinBalance}`);
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setBusy(true);
    try {
      let url = "";
      let body: any = {};
      if (type === "themes") {
        url = `/api/study-room/${topicId}/theme`;
        body = { themeName: itemId };
      } else if (type === "objects") {
        url = `/api/study-room/${topicId}/objects/purchase`;
        body = { objectId: itemId };
      } else if (type === "pets") {
        url = "/api/pets/purchase";
        body = { petId: itemId };
      }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        setToast(`Purchased! -${coinCost} coins ✓`);
        setTimeout(() => { setToast(null); onPurchased(); }, 1500);
        await load();
      } else {
        setToast(d.error ?? "Purchase failed");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {}
    setBusy(false);
  };

  if (!open) return null;

  const tabs = [
    { key: "themes" as const, label: "Themes", icon: Palette },
    { key: "objects" as const, label: "Furniture", icon: ShoppingBag },
    { key: "pets" as const, label: "Pets", icon: Bot },
  ];

  const currentItems = (items as any)?.[tab] ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-indigo-600" /> Customization Shop
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-1">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${tab === t.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}
                  >
                    <Icon className="w-3 h-3" /> {t.label}
                  </button>
                );
              })}
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
              <Coins className="w-3 h-3" /> {coinBalance}
            </span>
          </div>
        </div>

        {/* Items grid */}
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {currentItems.map((item: any) => {
                const isFree = item.coinCost === 0;
                const canAfford = coinBalance >= item.coinCost;
                const isLocked = item.levelRequired && item.levelRequired > 1; // simplified
                return (
                  <div key={item.id} className="rounded-xl border border-gray-200 p-2.5 text-center">
                    <div className="aspect-square rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mb-1.5">
                      {tab === "themes" ? (
                        <div className="w-full h-full rounded-lg" style={{ background: item.backgroundGradient }} />
                      ) : (
                        <span className="text-3xl">{item.icon ?? item.emoji ?? "📦"}</span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-gray-900 truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-[9px] text-gray-400 line-clamp-1 mt-0.5">{item.description}</p>
                    )}
                    <div className="mt-1.5 flex items-center justify-center gap-1">
                      {item.owned ? (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Owned
                        </span>
                      ) : isFree ? (
                        <button
                          onClick={() => purchase(tab, item.id, 0)}
                          disabled={busy}
                          className="px-2 h-6 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-semibold hover:bg-emerald-100"
                        >
                          Get Free
                        </button>
                      ) : (
                        <button
                          onClick={() => purchase(tab, item.id, item.coinCost)}
                          disabled={busy || !canAfford}
                          className={`flex items-center gap-0.5 px-2 h-6 rounded-full text-[9px] font-semibold ${canAfford ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-gray-100 text-gray-400"}`}
                        >
                          <Coins className="w-2.5 h-2.5" /> {item.coinCost}
                          {item.isPremium && <Crown className="w-2.5 h-2.5 text-violet-500" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {toast && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SoundMixer — Phase 15 ambient sound mixer.
 * Volume sliders for fireplace, rain, birds, lo-fi, pages.
 */
export function SoundMixer({ open, onClose, soundSettings, onUpdate }: {
  open: boolean;
  onClose: () => void;
  soundSettings: any;
  onUpdate: (settings: any) => void;
}) {
  const sounds = [
    { key: "fireplace", label: "🔥 Fireplace", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_71f60d8d8a.mp3" },
    { key: "rain", label: "🌧️ Rain", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_1e760d8d8a.mp3" },
    { key: "birds", label: "🐦 Birds", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_345c0d8d8a.mp3" },
    { key: "lofi", label: "🎧 Lo-Fi", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_9862666eca.mp3" },
    { key: "pages", label: "📖 Pages", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_a4c60d8d8a.mp3" },
  ];
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach((a) => a?.pause());
    };
  }, []);

  const setVolume = (key: string, vol: number) => {
    const audio = audioRefs.current[key];
    if (audio) {
      audio.volume = vol / 100;
      if (vol > 0) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }
    onUpdate({ ...soundSettings, [key]: vol });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-purple-600" /> Sound Mixer
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {sounds.map((s) => {
            const vol = soundSettings?.[s.key] ?? 0;
            return (
              <div key={s.key}>
                {typeof window !== "undefined" && (
                  <audio ref={(el) => { audioRefs.current[s.key] = el; }} src={s.url} loop preload="none" />
                )}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{s.label}</span>
                  <span className="text-[10px] text-gray-400">{vol}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vol}
                  onChange={(e) => setVolume(s.key, Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                />
              </div>
            );
          })}
          <p className="text-[10px] text-gray-400 text-center">Mix sounds for the perfect study ambiance. Settings are saved automatically.</p>
        </div>
      </div>
    </div>
  );
}

