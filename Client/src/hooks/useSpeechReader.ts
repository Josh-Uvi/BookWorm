/**
 * Read-along text-to-speech: speaks the chapter with the browser's built-in
 * speechSynthesis and reports which word is currently being spoken so the UI
 * can highlight it and the child can follow along.
 *
 * Word tracking prefers SpeechSynthesisUtterance `boundary` events (Chrome,
 * Edge, Firefox). Some engines (e.g. Safari's) never fire them, so the hook
 * falls back to a time-based estimate that advances one word at a time.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** A spoken word or the whitespace between words, with char offsets. */
export interface SpeechToken {
  text: string;
  /** Char offset of this token inside the original text. */
  start: number;
  end: number;
  isWord: boolean;
}

/** Calibrated browser narration speed at rate 1.0 (≈195 words per minute). */
const FALLBACK_WORDS_PER_SECOND = 3.25;
/** How long to wait for a boundary event before switching to estimation. */
const BOUNDARY_GRACE_MS = 700;

export interface SpeechTimingPoint {
  tokenIndex: number;
  startMs: number;
  durationMs: number;
}

/**
 * Why read-along is unavailable, or null when speechSynthesis is supported.
 *
 * The env params let tests simulate capabilities, mirroring
 * `micUnsupportedReason` in useAudioRecorder.
 */
export function speechUnsupportedReason(
  env: { speechSynthesis?: boolean; speechSynthesisUtterance?: boolean } = {}
): string | null {
  const hasSynthesis =
    env.speechSynthesis ?? (typeof window !== "undefined" && "speechSynthesis" in window);
  const hasUtterance =
    env.speechSynthesisUtterance ??
    (typeof window !== "undefined" && "SpeechSynthesisUtterance" in window);
  if (!hasSynthesis || !hasUtterance) {
    return "This browser does not support text-to-speech (speechSynthesis unavailable).";
  }
  return null;
}

/** Split text into word / whitespace tokens with char offsets preserved. */
export function tokenizeSpeechText(text: string): SpeechToken[] {
  const tokens: SpeechToken[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const isWhitespace = /\s/.test(text[i]);
    while (i < text.length && /\s/.test(text[i]) === isWhitespace) i++;
    tokens.push({ text: text.slice(start, i), start, end: i, isWord: !isWhitespace });
  }
  return tokens;
}

/**
 * Map a `boundary` event's charIndex (relative to the spoken text) to the
 * index of the word token being spoken. Whitespace offsets resolve to the
 * following word; out-of-range offsets return null.
 */
export function findWordIndexAtChar(tokens: SpeechToken[], charIndex: number): number | null {
  if (tokens.length === 0 || charIndex < 0) return null;
  let lo = 0;
  let hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const token = tokens[mid];
    if (charIndex < token.start) {
      hi = mid - 1;
    } else if (charIndex >= token.end) {
      lo = mid + 1;
    } else if (token.isWord) {
      return mid;
    } else {
      const next = tokens[mid + 1];
      return next?.isWord ? mid + 1 : null;
    }
  }
  return null;
}

/**
 * Estimate how long a spoken word occupies in the narration. Word length and
 * punctuation matter: "a" is quicker than "automatically", while commas and
 * sentence endings introduce audible pauses. This is used only on browsers
 * that don't provide native word-boundary events.
 */
export function estimateWordDurationMs(word: string, rate: number = 1): number {
  const safeRate = Math.max(rate, 0.1);
  const baseWordMs = 1000 / (FALLBACK_WORDS_PER_SECOND * safeRate);
  const letterCount = Math.max((word.match(/[\p{L}\p{N}]/gu) ?? []).length, 1);
  const lengthFactor = Math.min(1.28, Math.max(0.78, 0.78 + (letterCount - 1) * 0.05));

  let punctuationPauseMs = 0;
  if (/[.!?]["')\]]*$/.test(word)) punctuationPauseMs = 220 / safeRate;
  else if (/[,;:]["')\]]*$/.test(word)) punctuationPauseMs = 110 / safeRate;
  else if (/[—–-]["')\]]*$/.test(word)) punctuationPauseMs = 90 / safeRate;

  return Math.round(baseWordMs * lengthFactor + punctuationPauseMs);
}

/** Build an elapsed-time schedule for word highlights. */
export function buildSpeechTimeline(
  tokens: SpeechToken[],
  rate: number = 1
): SpeechTimingPoint[] {
  const timeline: SpeechTimingPoint[] = [];
  let startMs = 0;
  tokens.forEach((token, tokenIndex) => {
    if (!token.isWord) return;
    const durationMs = estimateWordDurationMs(token.text, rate);
    timeline.push({ tokenIndex, startMs, durationMs });
    startMs += durationMs;
  });
  return timeline;
}

/** Find the word that should be active at a given elapsed narration time. */
export function findTimingPointAtElapsed(
  timeline: SpeechTimingPoint[],
  elapsedMs: number
): number | null {
  if (!timeline.length) return null;
  const elapsed = Math.max(elapsedMs, 0);
  let lo = 0;
  let hi = timeline.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].startMs <= elapsed) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

interface UseSpeechReaderStartOptions {
  /** Speech rate — 1.0 is the engine default. Defaults to a clear storytelling pace. */
  rate?: number;
  /** BCP-47 language tag used to pick a voice. Defaults to "en-US". */
  lang?: string;
}

/**
 * Friendly, clear narrator voices for child-facing storytelling, ranked.
 * Natural/Neural/Premium voices (Chrome's "Google …", Edge's "… (Natural)",
 * macOS "… (Premium)") sound dramatically better than the compact system
 * defaults; classic robotic/novelty voices are pushed to the bottom.
 */
const NARRATOR_VOICE_NAME_BONUS: Record<string, number> = {
  "google us english": 90, // Chrome — natural neural voice
  "microsoft aria": 70, // Edge natural voice, warm and clear
  "microsoft jenny": 70,
  "microsoft ana": 70, // child voice
  samantha: 60, // macOS default — pleasant and clear
  serena: 50,
  tessa: 50,
  karen: 50,
  moira: 50,
  ava: 50,
  allison: 50,
  alice: 50,
};

// Robotic (old SAPI) or novelty system voices — only as a last resort.
const ROBOTIC_VOICE_NAMES = [
  "zarvox", "whisper", "bahh", "bells", "bubbles", "cellos", "jester",
  "organ", "pipes", "superstar", "trinoids", "wobble", "albert",
  "bad news", "good news", "junior", "ralph", "fred",
  "microsoft david", "microsoft zira", "microsoft mark",
];

/** Higher is friendlier for narration; pure so it is unit-testable. */
export function scoreNarratorVoice(
  voice: SpeechSynthesisVoice,
  requestedLang: string = "en-US"
): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  // Higher-quality variants of any voice are the single biggest upgrade.
  if (/(natural|premium|enhanced|neural)/.test(name)) score += 100;
  if (name.startsWith("google ")) score += 80;

  for (const [needle, bonus] of Object.entries(NARRATOR_VOICE_NAME_BONUS)) {
    if (name.includes(needle)) {
      score += bonus;
      break;
    }
  }
  for (const needle of ROBOTIC_VOICE_NAMES) {
    if (name.includes(needle)) {
      score -= 120;
      break;
    }
  }

  // Strongly prefer the requested locale, then the same language family.
  const language = (voice.lang || "").toLowerCase().replace("_", "-");
  const requested = requestedLang.toLowerCase().replace("_", "-");
  const requestedFamily = requested.split("-")[0];
  if (language === requested) score += 30;
  else if (language.startsWith(requestedFamily)) score += 15;
  else score -= 200;

  return score;
}

/** Pick the friendliest available voice for the requested language. */
export function pickNarratorVoice(
  voices: SpeechSynthesisVoice[],
  lang: string = "en-US"
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = scoreNarratorVoice(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

export function useSpeechReader() {
  const [isReading, setIsReading] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  const unsupportedReason = speechUnsupportedReason();
  const isSupported = unsupportedReason === null;

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const tokensRef = useRef<SpeechToken[]>([]);
  const fallbackTimerRef = useRef<number | null>(null);
  const seenBoundaryRef = useRef(false);
  /** Bumped on every start/stop so stale fallback ticks bail out. */
  const generationRef = useRef(0);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    clearFallbackTimer();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    tokensRef.current = [];
    setIsReading(false);
    setActiveWordIndex(null);
  }, [clearFallbackTimer]);

  const start = useCallback(
    (text: string, tokens: SpeechToken[], options: UseSpeechReaderStartOptions = {}) => {
      if (!isSupported || !text) return;
      stop();

      generationRef.current += 1;
      const generation = generationRef.current;
      tokensRef.current = tokens;
      seenBoundaryRef.current = false;

      const utterance = new SpeechSynthesisUtterance(text);
      const rate = options.rate ?? 0.92;
      const lang = options.lang ?? "en-US";
      utterance.rate = rate;
      // Keep a natural pitch; voice quality and a calm pace are clearer than
      // artificially raising the pitch, which can sound thin or robotic.
      utterance.pitch = 1;
      utterance.lang = lang;
      const voice = pickNarratorVoice(window.speechSynthesis.getVoices(), lang);
      if (voice) utterance.voice = voice;
      const fallbackTimeline = buildSpeechTimeline(tokens, rate);
      let speechStartedAt: number | null = null;

      const finish = () => {
        // Ignore events from an utterance we already stopped or replaced.
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        tokensRef.current = [];
        clearFallbackTimer();
        setIsReading(false);
        setActiveWordIndex(null);
      };

      utterance.onboundary = (event) => {
        if (event.name && event.name !== "word") return;
        seenBoundaryRef.current = true;
        clearFallbackTimer();
        const index = findWordIndexAtChar(tokensRef.current, event.charIndex);
        if (index !== null) setActiveWordIndex(index);
      };
      utterance.onstart = () => {
        if (utteranceRef.current !== utterance || generationRef.current !== generation) return;
        speechStartedAt = performance.now();

        // Highlight the first word as soon as audio actually begins. The old
        // fallback waited for the grace period plus one interval, which put
        // the UI more than a second behind the narrator.
        if (fallbackTimeline.length) {
          setActiveWordIndex(fallbackTimeline[0].tokenIndex);
        }

        const syncFallbackToElapsedTime = () => {
          if (
            seenBoundaryRef.current ||
            generationRef.current !== generation ||
            speechStartedAt === null
          ) {
            return;
          }

          const elapsedMs = performance.now() - speechStartedAt;
          const pointIndex = findTimingPointAtElapsed(fallbackTimeline, elapsedMs);
          if (pointIndex === null) return;

          const point = fallbackTimeline[pointIndex];
          setActiveWordIndex(point.tokenIndex);

          const nextPoint = fallbackTimeline[pointIndex + 1];
          if (!nextPoint) return;
          // Schedule against the original speech start time, not relative to
          // the last tick. This prevents timer drift from accumulating.
          const delayMs = Math.max(16, nextPoint.startMs - elapsedMs);
          fallbackTimerRef.current = window.setTimeout(syncFallbackToElapsedTime, delayMs);
        };

        fallbackTimerRef.current = window.setTimeout(
          syncFallbackToElapsedTime,
          BOUNDARY_GRACE_MS
        );
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      utteranceRef.current = utterance;
      setIsReading(true);
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, stop, clearFallbackTimer]
  );

  const toggle = useCallback(
    (text: string, tokens: SpeechToken[], options: UseSpeechReaderStartOptions = {}) => {
      if (isReading) stop();
      else start(text, tokens, options);
    },
    [isReading, start, stop]
  );

  // Stop speaking when the component unmounts.
  useEffect(() => () => stop(), [stop]);

  // Warm the voice list: Chrome (and some other engines) populate
  // getVoices() asynchronously via the voiceschanged event — without this
  // the very first narration would fall back to the robotic default voice.
  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    const warm = () => {
      synth.getVoices();
    };
    synth.addEventListener?.("voiceschanged", warm);
    warm();
    return () => synth.removeEventListener?.("voiceschanged", warm);
  }, [isSupported]);

  return { isReading, activeWordIndex, isSupported, unsupportedReason, start, stop, toggle };
}

