import { describe, expect, it } from "vitest";
import { parseServerMessage } from "@/services/wsMessages";

describe("parseServerMessage", () => {
  it("parses transcription messages", () => {
    const raw = JSON.stringify({
      type: "transcription",
      text: "the monkey climbed the tree",
      confidence: 0.92,
      is_partial: false,
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(parseServerMessage(raw)).toEqual({
      type: "transcription",
      text: "the monkey climbed the tree",
      confidence: 0.92,
      isPartial: false,
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  it("tolerates missing confidence on transcription messages", () => {
    const raw = JSON.stringify({ type: "transcription", text: "hello" });
    expect(parseServerMessage(raw)).toMatchObject({
      type: "transcription",
      text: "hello",
      confidence: null,
    });
  });

  it("parses help_needed messages with spoken audio", () => {
    const raw = JSON.stringify({
      type: "help_needed",
      needs_help: true,
      help_message: "Great effort! Sound it out: m-on-key.",
      audio: "QkFTRTY0QVVESU8=",
      audio_format: "wav",
      confidence: 0.9,
      reason: "hesitation on a word",
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(parseServerMessage(raw)).toEqual({
      type: "help_needed",
      needsHelp: true,
      helpMessage: "Great effort! Sound it out: m-on-key.",
      audio: "QkFTRTY0QVVESU8=",
      audioFormat: "wav",
      confidence: 0.9,
      reason: "hesitation on a word",
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  it("parses error messages", () => {
    const raw = JSON.stringify({ type: "error", message: "Invalid base64 audio payload" });
    expect(parseServerMessage(raw)).toEqual({
      type: "error",
      message: "Invalid base64 audio payload",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseServerMessage("this is not json")).toBeNull();
  });

  it("returns null for unknown message types", () => {
    expect(parseServerMessage(JSON.stringify({ type: "banana" }))).toBeNull();
  });
});
