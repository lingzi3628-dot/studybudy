"use client";

/**
 * VoiceMode helpers — browser-based TTS (text-to-speech) and ASR
 * (automatic speech recognition) using the Web Speech API.
 *
 * These are COMPLETELY FREE, no API key, no network, no server config needed.
 * They use the OS voices built into the browser/OS:
 *   - macOS: dozens of high-quality voices (Samantha, Alex, etc.)
 *   - Windows: Microsoft voices (David, Zira, etc.)
 *   - Android: Google voices
 *   - iOS: Siri voices
 *
 * Browser support:
 *   - speechSynthesis (TTS): Chrome, Edge, Safari, Firefox — universal
 *   - SpeechRecognition (ASR): Chrome, Edge, Safari (with prefix) — NOT Firefox
 *
 * For Firefox users, we fall back to the server-side TTS/ASR endpoints,
 * which currently require the z-ai-web-dev-sdk config (see .z-ai-config).
 */

// =====================================================================
// TTS — Text to Speech (browser SpeechSynthesis API)
// =====================================================================

type TTSOptions = {
  voice?: SpeechSynthesisVoice | null;
  rate?: number; // 0.1 to 10, default 1
  pitch?: number; // 0 to 2, default 1
  volume?: number; // 0 to 1, default 1
  lang?: string; // e.g. "en-US", "en-GB", "sw-KE" for Kiswahili
};

/**
 * Returns true if the browser supports speechSynthesis (TTS).
 * Universal on modern browsers (Chrome, Edge, Safari, Firefox).
 */
export function isBrowserTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Returns the list of available voices on this device.
 * Call this AFTER voices are loaded (use the onvoiceschanged event).
 */
export function getBrowserVoices(): SpeechSynthesisVoice[] {
  if (!isBrowserTTSSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Pick the best matching voice for a given language code.
 * Falls back to the default voice if no match.
 */
export function pickVoiceForLang(lang: string): SpeechSynthesisVoice | null {
  const voices = getBrowserVoices();
  if (voices.length === 0) return null;
  // Exact match first
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  // Prefix match (e.g. "en" matches "en-US", "en-GB")
  const prefix = lang.split("-")[0].toLowerCase();
  const prefixMatch = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (prefixMatch) return prefixMatch;
  return voices[0]; // default
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

// Phase 46 — language-of-instruction map (matches the Zustand store field)
// Maps human-readable language names to BCP-47 codes the browser understands.
const LANG_NAME_TO_BCP47: Record<string, string> = {
  English: "en-US",
  Kiswahili: "sw-KE",   // Kenyan Swahili
  Chinese: "zh-CN",
  French: "fr-FR",
  Spanish: "es-ES",
  Arabic: "ar-SA",
};

/**
 * Get the user's preferred TTS language. Reads from a window global that
 * the AITutorChat / Profile set after the Zustand store loads. Avoids a
 * circular import between this lib and the Zustand store.
 *
 * Phase 46: this lets the AI Tutor's voice mode respect the user's
 * `languageOfInstruction` setting in Profile.
 */
export function getPreferredTTSLang(): string | null {
  if (typeof window === "undefined") return null;
  const lang = (window as any).__studybuddy_lang_of_instruction as string | undefined;
  if (lang && LANG_NAME_TO_BCP47[lang]) {
    return LANG_NAME_TO_BCP47[lang];
  }
  return null;
}

/**
 * Set the user's preferred TTS language (called by Profile.tsx + AITutorChat.tsx
 * after the Zustand store loads the languageOfInstruction).
 *
 * Phase 46: this is the inverse of getPreferredTTSLang — it lets components
 * push the current language into a window global without this lib having to
 * import the store.
 */
export function setPreferredTTSLang(langName: string): void {
  if (typeof window === "undefined") return;
  (window as any).__studybuddy_lang_of_instruction = langName;
}

/**
 * Split text into chunks of <=200 chars by sentence boundaries — works around
 * the Chrome long-text cutoff bug. Sentences longer than 200 chars are split
 * at the nearest space.
 *
 * Phase 46: enables reading long AI Tutor replies aloud without truncation.
 */
function chunkText(text: string, maxLen = 200): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  // Split on sentence boundaries (. ? !) followed by space
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  let current = "";
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((current + " " + trimmed).length > maxLen && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? current + " " + trimmed : trimmed;
    }
    // If a single sentence exceeds maxLen, hard-split at word boundaries
    while (current.length > maxLen) {
      const slice = current.slice(0, maxLen);
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > 0) {
        chunks.push(current.slice(0, lastSpace));
        current = current.slice(lastSpace + 1);
      } else {
        chunks.push(current.slice(0, maxLen));
        current = current.slice(maxLen);
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Speak text using the browser's speechSynthesis.
 * Returns a promise that resolves when speech is finished or cancelled.
 *
 * Phase 46 upgrades:
 *   - Auto-splits long text by sentence boundaries (Chrome bug workaround)
 *   - Falls back to the user's languageOfInstruction from the Zustand store
 *     if no `lang` option is passed
 *
 * Usage:
 *   const stop = speak("Hello world", { lang: "en-US" });
 *   // ... later, to stop:
 *   stop();
 */
export function browserSpeak(
  text: string,
  opts: TTSOptions = {}
): { promise: Promise<void>; stop: () => void } {
  if (!isBrowserTTSSupported()) {
    return {
      promise: Promise.reject(new Error("Browser TTS not supported")),
      stop: () => {},
    };
  }

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  // Resolve the effective language — explicit option > user preference > default
  const lang = opts.lang ?? getPreferredTTSLang();
  const effectiveOpts = lang ? { ...opts, lang } : opts;

  // Phase 46 — split long text into chunks (Chrome bug workaround)
  const chunks = chunkText(text, 200);

  let resolveFn: () => void;
  let rejectFn: (e: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  let chunkIdx = 0;
  let stopped = false;

  const speakChunk = () => {
    if (stopped) return;
    if (chunkIdx >= chunks.length) {
      resolveFn();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[chunkIdx]);
    if (effectiveOpts.voice) utterance.voice = effectiveOpts.voice;
    if (effectiveOpts.rate !== undefined) utterance.rate = effectiveOpts.rate;
    if (effectiveOpts.pitch !== undefined) utterance.pitch = effectiveOpts.pitch;
    if (effectiveOpts.volume !== undefined) utterance.volume = effectiveOpts.volume;
    if (effectiveOpts.lang) utterance.lang = effectiveOpts.lang;

    // Auto-pick voice if lang is given but no voice
    if (!utterance.voice && effectiveOpts.lang) {
      const v = pickVoiceForLang(effectiveOpts.lang);
      if (v) utterance.voice = v;
    }

    utterance.onend = () => {
      chunkIdx++;
      speakChunk();
    };
    utterance.onerror = (e) => {
      if (!stopped) rejectFn(new Error("Speech error: " + (e as any).error));
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  };

  speakChunk();

  const stop = () => {
    stopped = true;
    window.speechSynthesis.cancel();
    resolveFn();
  };

  return { promise, stop };
}

/**
 * Stop any in-progress browser speech.
 */
export function stopBrowserSpeech() {
  if (isBrowserTTSSupported()) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

// =====================================================================
// ASR — Speech Recognition (browser SpeechRecognition API)
// =====================================================================

/**
 * Returns true if the browser supports SpeechRecognition (ASR).
 * Currently Chrome, Edge, Safari (with webkit prefix).
 * NOT in Firefox.
 */
export function isBrowserASRSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

type ASROptions = {
  lang?: string; // e.g. "en-US", "sw-KE"
  continuous?: boolean; // keep listening after pauses
  interimResults?: boolean; // show partial results as user speaks
  maxDurationSec?: number; // auto-stop after N seconds (default 30)
};

type ASRResult = {
  text: string;
  isFinal: boolean;
};

/**
 * Start listening via browser SpeechRecognition.
 * Returns an object with:
 *   - stop(): stop listening
 *   - onResult(cb): register a callback for each transcription result
 *   - onError(cb): register a callback for errors
 *   - onEnd(cb): register a callback when listening stops
 */
export function startBrowserListening(opts: ASROptions = {}) {
  if (!isBrowserASRSupported()) {
    throw new Error("Browser ASR not supported. Use Chrome, Edge, or Safari.");
  }

  // @ts-ignore — vendor-prefixed API
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = opts.lang ?? "en-US";
  recognition.continuous = opts.continuous ?? false;
  recognition.interimResults = opts.interimResults ?? false;

  const resultCallbacks: Array<(r: ASRResult) => void> = [];
  const errorCallbacks: Array<(e: any) => void> = [];
  const endCallbacks: Array<() => void> = [];

  recognition.onresult = (event: any) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }
    if (finalText) {
      resultCallbacks.forEach((cb) => cb({ text: finalText, isFinal: true }));
    }
    if (interimText) {
      resultCallbacks.forEach((cb) => cb({ text: interimText, isFinal: false }));
    }
  };

  recognition.onerror = (event: any) => {
    errorCallbacks.forEach((cb) => cb(event));
  };

  recognition.onend = () => {
    endCallbacks.forEach((cb) => cb());
  };

  // Auto-stop after maxDurationSec
  let timeoutId: NodeJS.Timeout | null = null;
  if (opts.maxDurationSec) {
    timeoutId = setTimeout(() => recognition.stop(), opts.maxDurationSec * 1000);
  }

  recognition.start();

  return {
    stop() {
      if (timeoutId) clearTimeout(timeoutId);
      recognition.stop();
    },
    onResult(cb: (r: ASRResult) => void) {
      resultCallbacks.push(cb);
    },
    onError(cb: (e: any) => void) {
      errorCallbacks.push(cb);
    },
    onEnd(cb: () => void) {
      endCallbacks.push(cb);
    },
  };
}
