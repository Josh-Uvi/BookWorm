/**
 * Captures microphone audio with MediaRecorder and emits base64 chunks
 * (WebM/Opus where supported) for streaming over the WebSocket.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

interface UseAudioRecorderOptions {
  onChunk: (base64Audio: string) => void;
  timesliceMs?: number;
}

export function useAudioRecorder({ onChunk, timesliceMs = 1000 }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const isSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    if (recorderRef.current || !isSupported) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          try {
            const base64 = await blobToBase64(event.data);
            onChunkRef.current(base64);
          } catch (err) {
            console.warn("Failed to encode audio chunk:", err);
          }
        }
      };
      recorder.onerror = () => setMicError("Audio recording error — try again.");
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
      };

      recorder.start(timesliceMs);
      setIsRecording(true);
    } catch (error) {
      setMicError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied. Enable it in your browser settings."
          : "Could not access the microphone."
      );
      setIsRecording(false);
    }
  }, [isSupported, timesliceMs]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  // Stop recording (and release the mic) when the component unmounts.
  useEffect(() => () => stop(), [stop]);

  return { isRecording, isSupported, micError, start, stop };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
