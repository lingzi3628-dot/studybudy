"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Gamepad2, Clock, Star, Search, ChevronLeft, Play, Lock,
  Flame, Sparkles, TrendingUp, Trophy, Zap, Loader2, Upload,
  Settings, Trash2, Download, Gift, ArrowLeft, Grid3x3,
} from "lucide-react";
import { useApp } from "../store";

/**
 * GameHub — Phase 80/81
 *
 * Play Store-style game hub. Users get:
 *   - 20 minutes FREE daily play time (claim once per day)
 *   - Additional 10 min per 30 min studied
 *   - Can switch between games during active play session
 *   - Timer keeps running across game switches
 *   - When time runs out, games lock
 */

type Game = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnailUrl: string | null;
  gameUrl: string;
  version: string;
  isFeatured: boolean;
  isActive: boolean;
  playCount: number;
  rating: number;
  minStudyMinutes: number;
  playTimeMinutes: number;
  createdAt: string;
};

type PlayTime = {
  available: number;
  dailyFreeClaimed: boolean;
  dailyFreeSeconds: number;
  studyMinutesToday: number;
  earnedFromStudy: number;
};

const CATEGORIES = ["All", "Arcade", "Puzzle", "Strategy", "Racing", "Adventure", "Educational", "Sports"];

export function GameHub() {
  const { setScreen } = useApp();
  const [games, setGames] = useState<Game[]>([]);
  const [playTime, setPlayTime] = useState<PlayTime>({ available: 0, dailyFreeClaimed: false, dailyFreeSeconds: 1200, studyMinutesToday: 0, earnedFromStudy: 0 });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingGame, setPlayingGame] = useState<Game | null>(null);
  const [playTimer, setPlayTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showGamePicker, setShowGamePicker] = useState(false); // switch games mid-session
  const [claiming, setClaiming] = useState(false);
  const usedSecondsRef = useRef(0); // track total used in current session
  const sessionStartRef = useRef(0); // total available at session start

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gamesRes, timeRes] = await Promise.all([
        fetch("/api/games"),
        fetch("/api/games/playtime"),
      ]);
      const gamesData = await gamesRes.json().catch(() => ({ games: [] }));
      const timeData = await timeRes.json().catch(() => ({ available: 0, dailyFreeClaimed: false, dailyFreeSeconds: 1200, studyMinutesToday: 0, earnedFromStudy: 0 }));
      setGames(gamesData.games || []);
      setPlayTime({
        available: timeData.available || 0,
        dailyFreeClaimed: timeData.dailyFreeClaimed || false,
        dailyFreeSeconds: timeData.dailyFreeSeconds || 1200,
        studyMinutesToday: timeData.studyMinutesToday || 0,
        earnedFromStudy: timeData.earnedFromStudy || 0,
      });
    } catch {
      setError("Failed to load games. Check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Claim daily free time
  const claimDaily = async () => {
    setClaiming(true);
    try {
      const r = await fetch("/api/games/playtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim_daily" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Failed to claim");
        setTimeout(() => setError(null), 3000);
      } else {
        // Reload play time
        await loadData();
      }
    } catch {
      setError("Network error");
    }
    setClaiming(false);
  };

  // Play timer countdown
  useEffect(() => {
    if (!playingGame || playTimer <= 0) return;
    const interval = setInterval(() => {
      setPlayTimer((t) => {
        if (t <= 1) {
          // Time's up — record usage and close
          const used = usedSecondsRef.current;
          fetch("/api/games/playtime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "use", usedSeconds: used }),
          }).catch(() => {});
          setPlayingGame(null);
          setShowGamePicker(false);
          // Reload data to reflect used time
          setTimeout(() => loadData(), 500);
          return 0;
        }
        usedSecondsRef.current += 1;
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playingGame, playTimer, loadData]);

  const filteredGames = games.filter((g) => {
    if (activeCategory !== "All" && g.category !== activeCategory) return false;
    if (searchQuery && !g.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const featuredGames = games.filter((g) => g.isFeatured).slice(0, 5);
  const mostPlayed = [...games].sort((a, b) => b.playCount - a.playCount).slice(0, 6);
  const newGames = [...games].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const canPlay = playTime.available >= 60;

  const launchGame = (game: Game) => {
    if (!canPlay) {
      if (!playTime.dailyFreeClaimed) {
        setError("Claim your daily 20 minutes of free play time to start playing!");
      } else {
        setError(`Study more to earn play time. 30 min study = 10 min play. You've studied ${playTime.studyMinutesToday} min today.`);
      }
      setTimeout(() => setError(null), 4000);
      return;
    }
    setPlayingGame(game);
    setShowGamePicker(false);
    const sessionTime = Math.min(playTime.available, 20 * 60); // max 20 min per session
    setPlayTimer(sessionTime);
    sessionStartRef.current = sessionTime;
    usedSecondsRef.current = 0;
    // Increment play count
    fetch("/api/games", { method: "PATCH", body: JSON.stringify({ gameId: game.id, action: "play" }) }).catch(() => {});
  };

  // Switch to a different game mid-session (keeps the timer running)
  const switchGame = (game: Game) => {
    setPlayingGame(game);
    setShowGamePicker(false);
    // Timer keeps running — don't reset it
  };

  // Exit game (record used time)
  const exitGame = () => {
    const used = usedSecondsRef.current;
    if (used > 0) {
      fetch("/api/games/playtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use", usedSeconds: used }),
      }).catch(() => {});
    }
    setPlayingGame(null);
    setShowGamePicker(false);
    setPlayTimer(0);
    setTimeout(() => loadData(), 500);
  };

  // === Playing mode (full-screen game iframe + switcher) ===
  if (playingGame) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <button onClick={exitGame} className="flex items-center gap-1 text-sm hover:text-violet-400">
              <ChevronLeft className="w-4 h-4" /> Exit
            </button>
            <span className="font-bold text-sm">{playingGame.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Switch games button */}
            <button
              onClick={() => setShowGamePicker(!showGamePicker)}
              className="px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold flex items-center gap-1"
              title="Switch game (keeps your timer)"
            >
              <Grid3x3 className="w-3.5 h-3.5" /> Games
            </button>
            {/* Timer */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${playTimer < 60 ? "bg-rose-600 animate-pulse" : "bg-violet-600"}`}>
              <Clock className="w-3.5 h-3.5" /> {formatTime(playTimer)}
            </div>
          </div>
        </div>

        {/* Game switcher overlay */}
        {showGamePicker && (
          <div className="absolute inset-0 bg-black/90 z-10 flex flex-col p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-sm">Switch Game</h2>
              <button onClick={() => setShowGamePicker(false)} className="text-gray-400 hover:text-white text-xs">Close</button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto">
              {games.map((g) => (
                <button
                  key={g.id}
                  onClick={() => switchGame(g)}
                  className={`p-2 rounded-xl text-left ${g.id === playingGame.id ? "bg-violet-600" : "bg-gray-800 hover:bg-gray-700"}`}
                >
                  <div className="aspect-square rounded-lg bg-gray-700 flex items-center justify-center mb-1">
                    <Gamepad2 className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-[10px] text-white font-semibold truncate">{g.title}</p>
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-[10px] mt-2 text-center">Timer keeps running — switch freely!</p>
          </div>
        )}

        <iframe
          src={playingGame.gameUrl}
          className="flex-1 w-full border-0"
          allow="autoplay; fullscreen; gamepad"
          title={playingGame.title}
        />
      </div>
    );
  }

  // === Main hub ===
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => setScreen("home")} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Gamepad2 className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-sm font-bold text-gray-900 flex-1">Game Hub</h1>
        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${playTime.available > 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
          <Clock className="w-3 h-3" />
          {formatTime(playTime.available)}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-20">
            <Gamepad2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-bold text-gray-900">No games yet</p>
            <p className="text-xs text-gray-500 mt-1">Games will appear here once added.</p>
          </div>
        )}

        {!loading && games.length > 0 && (
          <>
            {/* Play time dashboard */}
            <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-white mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase opacity-70">Available Play Time</p>
                  <p className="text-2xl font-bold">{formatTime(playTime.available)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase opacity-70">Studied Today</p>
                  <p className="text-xl font-bold">{playTime.studyMinutesToday} min</p>
                </div>
              </div>

              {/* Daily free claim button */}
              {!playTime.dailyFreeClaimed ? (
                <button
                  onClick={claimDaily}
                  disabled={claiming}
                  className="w-full mt-2 h-11 rounded-xl bg-white text-violet-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-violet-50 transition disabled:opacity-50"
                >
                  {claiming ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</> : <><Gift className="w-4 h-4" /> Claim 20 Min Free Play Time</>}
                </button>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Check className="w-3.5 h-3.5" />
                    <span>Daily free time claimed</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Earned from study: {formatTime(playTime.earnedFromStudy)}</span>
                  </div>
                </div>
              )}

              {/* Study progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] opacity-70 mb-1">
                  <span>Study progress (30 min = +10 min play)</span>
                  <span>{playTime.studyMinutesToday} / 30 min</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (playTime.studyMinutesToday / 30) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games..."
                className="w-full h-10 rounded-full bg-white border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-violet-400"
              />
            </div>

            {/* Categories */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === cat ? "bg-violet-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Featured */}
            {activeCategory === "All" && !searchQuery && featuredGames.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-violet-500" /> Featured</h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {featuredGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay} onPlay={launchGame} featured />)}
                </div>
              </section>
            )}

            {/* Most played */}
            {activeCategory === "All" && !searchQuery && mostPlayed.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" /> Most Played</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {mostPlayed.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay} onPlay={launchGame} />)}
                </div>
              </section>
            )}

            {/* New games */}
            {activeCategory === "All" && !searchQuery && newGames.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-sky-500" /> New Games</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {newGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay} onPlay={launchGame} />)}
                </div>
              </section>
            )}

            {/* All / filtered */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-2">{searchQuery ? "Search Results" : activeCategory === "All" ? "All Games" : activeCategory}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filteredGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay} onPlay={launchGame} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return <span className={className}>✓</span>;
}

function GameCard({ game, canPlay, onPlay, featured }: { game: Game; canPlay: boolean; onPlay: (g: Game) => void; featured?: boolean }) {
  return (
    <button
      onClick={() => onPlay(game)}
      className={`group relative ${featured ? "w-44 flex-shrink-0" : ""} text-left`}
    >
      <div className={`relative ${featured ? "w-44 h-24" : "aspect-square"} rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden border border-gray-200 group-hover:border-violet-400 transition`}>
        {game.thumbnailUrl ? (
          <img src={game.thumbnailUrl} alt={game.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-gray-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          {canPlay ? <Play className="w-6 h-6 text-white fill-white" /> : <Lock className="w-5 h-5 text-white" />}
        </div>
        {game.rating > 0 && (
          <div className="absolute top-1 right-1 px-1 py-0.5 rounded-full bg-black/60 text-white text-[8px] font-bold flex items-center gap-0.5">
            <Star className="w-2 h-2 text-amber-400 fill-amber-400" /> {game.rating.toFixed(1)}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-900 mt-1.5 truncate">{game.title}</p>
      <p className="text-[10px] text-gray-400">{game.category} · {game.playCount > 0 ? `${game.playCount} plays` : "New"}</p>
    </button>
  );
}
