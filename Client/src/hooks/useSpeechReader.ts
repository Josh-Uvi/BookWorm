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

/** Estimated narration speed at rate 1.0 (≈155 words per minute). */
const FALLBACK_WORDS_PER_SECOND = 2.6;
/** How long to wait for a boundary event before switching to estimation. */
const BOUNDARY_GRACE_MS = 1000;

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

interface UseSpeechReaderStartOptions {
  /** Speech rate — 1.0 is the engine default. Defaults to a child-friendly 0.95. */
  rate?: number;
  /** BCP-47 language tag used to pick a voice. Defaults to "en-US". */
  lang?: string;
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === lang) ??
    voices.find((voice) => voice.lang.startsWith(lang.split("-")[0] ?? lang)) ??
    null
  );
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
      const rate = options.rate ?? 0.95;
      const lang = options.lang ?? "en-US";
      utterance.rate = rate;
      utterance.lang = lang;
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;

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
        const index = findWordIndexAtChar(tokensRef.current, event.charIndex);
        if (index !== null) setActiveWordIndex(index);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      utteranceRef.current = utterance;
      setIsReading(true);
      window.speechSynthesis.speak(utterance);

      // Fallback for engines that never fire boundary events: if none arrive
      // shortly after playback starts, advance the highlight on a timer.
      fallbackTimerRef.current = window.setTimeout(() => {
        if (seenBoundaryRef.current || generationRef.current !== generation) return;
        const wordIndices = tokens
          .map((token, index) => (token.isWord ? index : -1))
          .filter((index) => index >= 0);
        const perWordMs = 1000 / (FALLBACK_WORDS_PER_SECOND * rate);
        let i = 0;
        const tick = () => {
          if (seenBoundaryRef.current || generationRef.current !== generation) return;
          if (i >= wordIndices.length) return;
          setActiveWordIndex(wordIndices[i]);
          i += 1;
          fallbackTimerRef.current = window.setTimeout(tick, perWordMs);
        };
        fallbackTimerRef.current = window.setTimeout(tick, perWordMs);
      }, BOUNDARY_GRACE_MS);
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

  return { isReading, activeWordIndex, isSupported, unsupportedReason, start, stop, toggle };
}

