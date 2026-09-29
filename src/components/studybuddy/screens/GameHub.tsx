"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gamepad2, Clock, Star, Search, ChevronLeft, Play, Lock,
  Flame, Sparkles, TrendingUp, Trophy, Zap, Loader2, Upload,
  Settings, Trash2, Download,
} from "lucide-react";
import { useApp } from "../store";

/**
 * GameHub — Phase 80
 *
 * Play Store-style game hub. Users earn play time by studying:
 *   30 min study → 10 min play time.
 *
 * Features:
 *   - Featured games (carousel)
 *   - Categories (Arcade, Puzzle, Strategy, Racing, etc.)
 *   - Most played
 *   - New games
 *   - Search
 *   - Lock/unlock based on study time
 *   - Game playtime tracker
 *
 * Games are uploaded by admin as HTML5 games (iframe-served).
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
  totalEarned: number;  // seconds
  totalUsed: number;    // seconds
  available: number;    // seconds remaining
  studyMinutesToday: number;
};

const CATEGORIES = ["All", "Arcade", "Puzzle", "Strategy", "Racing", "Adventure", "Educational", "Sports"];

export function GameHub() {
  const { setScreen } = useApp();
  const [games, setGames] = useState<Game[]>([]);
  const [playTime, setPlayTime] = useState<PlayTime>({ totalEarned: 0, totalUsed: 0, available: 0, studyMinutesToday: 0 });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingGame, setPlayingGame] = useState<Game | null>(null);
  const [playTimer, setPlayTimer] = useState(0); // seconds remaining in current session
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gamesRes, timeRes] = await Promise.all([
        fetch("/api/games"),
        fetch("/api/games/playtime"),
      ]);
      const gamesData = await gamesRes.json().catch(() => ({ games: [] }));
      const timeData = await timeRes.json().catch(() => ({ available: 0, studyMinutesToday: 0 }));
      setGames(gamesData.games || []);
      setPlayTime({
        totalEarned: timeData.totalEarned || 0,
        totalUsed: timeData.totalUsed || 0,
        available: timeData.available || 0,
        studyMinutesToday: timeData.studyMinutesToday || 0,
      });
    } catch {
      setError("Failed to load games. Check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Play timer countdown
  useEffect(() => {
    if (!playingGame || playTimer <= 0) return;
    const interval = setInterval(() => {
      setPlayTimer((t) => {
        if (t <= 1) {
          // Time's up — close the game
          setPlayingGame(null);
          fetch("/api/games/playtime", { method: "POST", body: JSON.stringify({ usedSeconds: playingGame.playTimeMinutes * 60 }) }).catch(() => {});
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playingGame, playTimer]);

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

  const canPlay = (game: Game) => playTime.available >= 60;

  const launchGame = (game: Game) => {
    if (!canPlay(game)) {
      setError(`You need to study more to unlock game time. Study ${game.minStudyMinutes} minutes to earn ${game.playTimeMinutes} minutes of play.`);
      setTimeout(() => setError(null), 4000);
      return;
    }
    setPlayingGame(game);
    setPlayTimer(Math.min(game.playTimeMinutes * 60, playTime.available));
    // Increment play count
    fetch("/api/games", { method: "PATCH", body: JSON.stringify({ gameId: game.id, action: "play" }) }).catch(() => {});
  };

  // === Playing mode (full-screen game iframe) ===
  if (playingGame) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <button onClick={() => { setPlayingGame(null); }} className="flex items-center gap-1 text-sm hover:text-violet-400">
              <ChevronLeft className="w-4 h-4" /> Exit
            </button>
            <span className="font-bold text-sm">{playingGame.title}</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${playTimer < 60 ? "bg-rose-600 animate-pulse" : "bg-violet-600"}`}>
            <Clock className="w-3.5 h-3.5" /> {formatTime(playTimer)}
          </div>
        </div>
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => setScreen("home")} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Gamepad2 className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-sm font-bold text-gray-900 flex-1">Game Hub</h1>
        {/* Play time badge */}
        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${playTime.available > 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
          <Clock className="w-3 h-3" />
          {formatTime(playTime.available)}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-20">
            <Gamepad2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-bold text-gray-900">No games yet</p>
            <p className="text-xs text-gray-500 mt-1">Games will appear here once the admin uploads them.</p>
            <p className="text-xs text-gray-400 mt-2">Study {30} minutes to earn {10} minutes of play time.</p>
          </div>
        )}

        {!loading && games.length > 0 && (
          <>
            {/* Study → Play progress */}
            <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-white mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase opacity-70">Your Play Time</p>
                  <p className="text-2xl font-bold">{formatTime(playTime.available)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase opacity-70">Studied Today</p>
                  <p className="text-xl font-bold">{playTime.studyMinutesToday} min</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (playTime.studyMinutesToday / 30) * 100)}%` }} />
              </div>
              <p className="text-[10px] opacity-70 mt-1">Study 30 min → earn 10 min play time</p>
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

            {/* Category tabs */}
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
                  {featuredGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay(game)} onPlay={launchGame} featured />)}
                </div>
              </section>
            )}

            {/* Most played */}
            {activeCategory === "All" && !searchQuery && mostPlayed.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" /> Most Played</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {mostPlayed.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay(game)} onPlay={launchGame} />)}
                </div>
              </section>
            )}

            {/* New games */}
            {activeCategory === "All" && !searchQuery && newGames.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-sky-500" /> New Games</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {newGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay(game)} onPlay={launchGame} />)}
                </div>
              </section>
            )}

            {/* All / filtered */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-2">{searchQuery ? "Search Results" : activeCategory === "All" ? "All Games" : activeCategory}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filteredGames.map((game) => <GameCard key={game.id} game={game} canPlay={canPlay(game)} onPlay={launchGame} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// === Game Card Component ===
function GameCard({ game, canPlay, onPlay, featured }: { game: Game; canPlay: boolean; onPlay: (g: Game) => void; featured?: boolean }) {
  return (
    <button
      onClick={() => onPlay(game)}
      className={`group relative ${featured ? "w-44 flex-shrink-0" : ""} text-left`}
    >
      {/* Thumbnail */}
      <div className={`relative ${featured ? "w-44 h-24" : "aspect-square"} rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden border border-gray-200 group-hover:border-violet-400 transition`}>
        {game.thumbnailUrl ? (
          <img src={game.thumbnailUrl} alt={game.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-gray-600" />
          </div>
        )}
        {/* Play / Lock overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          {canPlay ? <Play className="w-6 h-6 text-white fill-white" /> : <Lock className="w-5 h-5 text-white" />}
        </div>
        {/* Rating badge */}
        {game.rating > 0 && (
          <div className="absolute top-1 right-1 px-1 py-0.5 rounded-full bg-black/60 text-white text-[8px] font-bold flex items-center gap-0.5">
            <Star className="w-2 h-2 text-amber-400 fill-amber-400" /> {game.rating.toFixed(1)}
          </div>
        )}
      </div>
      {/* Title */}
      <p className="text-xs font-semibold text-gray-900 mt-1.5 truncate">{game.title}</p>
      <p className="text-[10px] text-gray-400">{game.category} · {game.playCount > 0 ? `${game.playCount} plays` : "New"}</p>
    </button>
  );
}
