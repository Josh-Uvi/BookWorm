/**
 * Pure parser for messages sent by the reading-assistant WebSocket server.
 *
 * Kept free of React so it is trivially unit-testable. See
 * `Server/app.py` for the sending side of this contract.
 */
import { HelpEvent, TranscriptionEvent } from "@/types";

export interface TranscriptionMessage extends TranscriptionEvent {
  type: "transcription";
}

export interface HelpNeededMessage extends HelpEvent {
  type: "help_needed";
  needsHelp: boolean;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage = TranscriptionMessage | HelpNeededMessage | ErrorMessage;

export function parseServerMessage(raw: string): ServerMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const message = payload as Record<string, unknown>;

  switch (message.type) {
    case "transcription":
      return {
        type: "transcription",
        text: String(message.text ?? ""),
        confidence: typeof message.confidence === "number" ? message.confidence : null,
        isPartial: Boolean(message.is_partial ?? false),
        timestamp: String(message.timestamp ?? new Date().toISOString()),
      };
    case "help_needed":
      return {
        type: "help_needed",
        needsHelp: Boolean(message.needs_help),
        helpMessage: String(message.help_message ?? ""),
        audio: typeof message.audio === "string" ? message.audio : undefined,
        audioFormat: typeof message.audio_format === "string" ? message.audio_format : undefined,
        confidence: typeof message.confidence === "number" ? message.confidence : undefined,
        reason: typeof message.reason === "string" ? message.reason : "",
        timestamp: String(message.timestamp ?? new Date().toISOString()),
      };
    case "error":
      return { type: "error", message: String(message.message ?? "Unknown server error") };
    default:
      return null;
  }
}
