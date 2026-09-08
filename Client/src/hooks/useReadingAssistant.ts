/**
 * Connects to the reading-assistant WebSocket server and exposes the live
 * transcript, spoken-help feed and an audio sender. Auto-reconnects with
 * exponential backoff.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseServerMessage } from "@/services/wsMessages";
import { AssistantStatus, HelpEvent, TranscriptionEvent } from "@/types";
import { pickNarratorVoice } from "@/hooks/useSpeechReader";

const RECONNECT_BASE_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

/** Assistant-backed controls are usable only after the WebSocket opens. */
export function isAssistantReady(status: AssistantStatus): boolean {
  return status === "connected";
}

/** Same-origin `/ws` by default — works with the Vite dev proxy, the Nginx
 * container, and any TLS-terminating load balancer in production. */
export function resolveWsUrl(explicitUrl?: string): string {
  const configured = explicitUrl || import.meta.env.VITE_WS_URL || "";
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

interface UseReadingAssistantOptions {
  url?: string;
  autoConnect?: boolean;
  preferredVoiceName?: string;
  voiceLocale?: string;
}

export interface ReadingAssistantContext {
  text: string;
  studentName?: string;
  profileId?: string;
  readingLevel?: 2 | 3;
  voice?: string;
  systemPrompt?: string;
  bookTitle?: string;
}

export function useReadingAssistant(options: UseReadingAssistantOptions = {}) {
  const { url, autoConnect = true, preferredVoiceName, voiceLocale = "en-US" } = options;

  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptionEvent[]>([]);
  const [helpMessages, setHelpMessages] = useState<HelpEvent[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const manualCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    manualCloseRef.current = false;
    setStatus(attemptsRef.current > 0 ? "reconnecting" : "connecting");

    const socket = new WebSocket(resolveWsUrl(url));
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      setStatus("connected");
      setLastError(null);
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;

      if (message.type === "transcription") {
        const entry: TranscriptionEvent = {
          text: message.text,
          confidence: message.confidence,
          isPartial: message.isPartial,
          timestamp: message.timestamp,
        };
        setTranscript((prev) => {
          // A new partial replaces the previous partial instead of piling up.
          if (entry.isPartial && prev.length > 0 && prev[prev.length - 1].isPartial) {
            return [...prev.slice(0, -1), entry];
          }
          return [...prev, entry];
        });
      } else if (message.type === "help_needed") {
        const help: HelpEvent = {
          helpMessage: message.helpMessage,
          audio: message.audio,
          audioFormat: message.audioFormat,
          confidence: message.confidence,
          reason: message.reason,
          timestamp: message.timestamp,
        };
        setHelpMessages((prev) => [...prev, help]);
        playHelpAudio(help, preferredVoiceName, voiceLocale);
      } else if (message.type === "error") {
        setLastError(message.message);
      }
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (manualCloseRef.current) {
        setStatus("idle");
        return;
      }
      if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        attemptsRef.current += 1;
        setStatus("reconnecting");
        const delay = RECONNECT_BASE_DELAY_MS * 2 ** (attemptsRef.current - 1);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      } else {
        setStatus("error");
      }
    };

    socket.onerror = () => {
      // onclose always follows onerror; nothing else to do here.
    };
  }, [preferredVoiceName, url, voiceLocale]);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("idle");
  }, []);

  const sendAudio = useCallback((base64Audio: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "audio", data: base64Audio }));
    }
  }, []);

  /** Share the on-screen passage so the server can tell "reading aloud"
   * apart from "asking a question" and avoid interrupting the child. */
  const sendContext = useCallback((context: string | ReadingAssistantContext) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = typeof context === "string" ? { text: context } : context;
      socket.send(JSON.stringify({
        type: "context",
        text: payload.text,
        student_name: typeof context === "string" ? undefined : context.studentName,
        profile_id: typeof context === "string" ? undefined : context.profileId,
        reading_level: typeof context === "string" ? undefined : context.readingLevel,
        voice: typeof context === "string" ? undefined : context.voice,
        system_prompt: typeof context === "string" ? undefined : context.systemPrompt,
        book_title: typeof context === "string" ? undefined : context.bookTitle,
      }));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    lastError,
    transcript,
    helpMessages,
    sendAudio,
    sendContext,
    connect,
    disconnect,
    clearTranscript,
  };
}

function playHelpAudio(help: HelpEvent, preferredVoiceName?: string, voiceLocale = "en-US") {
  if (
    preferredVoiceName &&
    help.helpMessage &&
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  ) {
    const voice = pickNarratorVoice(
      window.speechSynthesis.getVoices(),
      voiceLocale,
      preferredVoiceName
    );
    if (voice && voice.name.toLowerCase().includes(preferredVoiceName.toLowerCase())) {
      const utterance = new SpeechSynthesisUtterance(help.helpMessage);
      utterance.voice = voice;
      utterance.lang = voiceLocale;
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
      return;
    }
  }
  if (!help.audio) return;
  const format = help.audioFormat || "wav";
  const audio = new Audio(`data:audio/${format};base64,${help.audio}`);
  audio.play().catch((err) => console.warn("Could not play help audio:", err));
}
