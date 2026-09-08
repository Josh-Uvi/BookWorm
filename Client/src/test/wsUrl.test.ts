import { describe, expect, it } from "vitest";
import { isAssistantReady, resolveWsUrl } from "@/hooks/useReadingAssistant";

describe("resolveWsUrl", () => {
  it("defaults to a same-origin /ws endpoint", () => {
    expect(resolveWsUrl()).toBe(`ws://${window.location.host}/ws`);
  });

  it("uses an explicit URL when provided", () => {
    expect(resolveWsUrl("ws://example.com:1234")).toBe("ws://example.com:1234");
  });
});

describe("isAssistantReady", () => {
  it("enables assistant controls only for an open WebSocket", () => {
    expect(isAssistantReady("connected")).toBe(true);
    expect(isAssistantReady("idle")).toBe(false);
    expect(isAssistantReady("connecting")).toBe(false);
    expect(isAssistantReady("reconnecting")).toBe(false);
    expect(isAssistantReady("error")).toBe(false);
  });
});
