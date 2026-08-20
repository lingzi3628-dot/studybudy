"use client";

import { useEffect, useState } from "react";
import { Coins, Heart, Zap } from "lucide-react";

/**
 * VirtualPet — Phase 15 study companion.
 *
 * Shows pet emoji with states: idle, happy, sleeping, eating.
 * Pet bubble shows messages. Click to feed/interact.
 */
const PET_MESSAGES = [
  "You're doing great! Keep going! 🌟",
  "Don't forget to review your due cards! 📚",
  "I believe in you! You can do this! 💪",
  "Take a 5-min break if you need one! ☕",
  "Your streak is amazing! 🔥",
  "Let's earn some coins together! 🪙",
];

const SLEEP_MESSAGES = [
  "Zzz... wake me when you're ready to study... 😴",
  "Shhh... dreaming about equations... 🌙",
];

export function VirtualPet({ pet, onFeed, isIdle }: {
  pet: any;
  onFeed: () => void;
  isIdle: boolean;
}) {
  const [showBubble, setShowBubble] = useState(false);
  const [message, setMessage] = useState("");
  const [isSleeping, setIsSleeping] = useState(false);

  useEffect(() => {
    // Show a message every 30s when not idle
    if (!isIdle) {
      const interval = setInterval(() => {
        setShowBubble(true);
        setMessage(PET_MESSAGES[Math.floor(Math.random() * PET_MESSAGES.length)]);
        setTimeout(() => setShowBubble(false), 5000);
      }, 30000);
      return () => clearInterval(interval);
    } else {
      // Idle > 5 min → sleeping
      const sleepTimer = setTimeout(() => {
        setIsSleeping(true);
        setShowBubble(true);
        setMessage(SLEEP_MESSAGES[Math.floor(Math.random() * SLEEP_MESSAGES.length)]);
      }, 5 * 60 * 1000);
      return () => clearTimeout(sleepTimer);
    }
  }, [isIdle]);

  const handleClick = () => {
    if (isSleeping) {
      setIsSleeping(false);
      setShowBubble(true);
      setMessage("Oh! You're back! Let's study! 😊");
      setTimeout(() => setShowBubble(false), 4000);
      return;
    }
    setShowBubble(true);
    setMessage(PET_MESSAGES[Math.floor(Math.random() * PET_MESSAGES.length)]);
    setTimeout(() => setShowBubble(false), 4000);
  };

  if (!pet) return null;

  const happiness = pet.happiness ?? 100;
  const level = pet.petLevel ?? 1;
  const emoji = pet.emoji ?? pet.pet?.emoji ?? "🦉";

  return (
    <div className="relative flex flex-col items-center gap-1">
      {/* Speech bubble */}
      {showBubble && message && (
        <div className="absolute bottom-full mb-2 w-40 rounded-2xl bg-white border border-gray-200 px-3 py-2 text-[10px] text-gray-700 shadow-md animate-in fade-in slide-in-from-bottom-2">
          {message}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45" />
        </div>
      )}
      {/* Pet */}
      <button
        onClick={handleClick}
        className={`text-4xl transition-transform hover:scale-110 active:scale-95 ${isSleeping ? "opacity-60" : "animate-bounce-slow"}`}
        style={{ animationDuration: "2s" }}
      >
        {isSleeping ? "💤" : emoji}
      </button>
      {/* Pet stats */}
      <div className="flex items-center gap-1 text-[8px]">
        <span className="text-violet-600 font-bold">L{level}</span>
        <span className="text-rose-500">{"❤".repeat(Math.ceil(happiness / 25))}</span>
      </div>
      {/* Feed button */}
      {!isSleeping && (
        <button
          onClick={(e) => { e.stopPropagation(); onFeed(); }}
          className="flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-amber-50 text-amber-600 text-[8px] font-semibold hover:bg-amber-100"
        >
          <Coins className="w-2 h-2" /> Feed (5)
        </button>
      )}
    </div>
  );
}
