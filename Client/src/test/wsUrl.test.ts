import { describe, expect, it } from "vitest";
import { resolveWsUrl } from "@/hooks/useReadingAssistant";

describe("resolveWsUrl", () => {
  it("defaults to a same-origin /ws endpoint", () => {
    expect(resolveWsUrl()).toBe(`ws://${window.location.host}/ws`);
  });

  it("uses an explicit URL when provided", () => {
    expect(resolveWsUrl("ws://example.com:1234")).toBe("ws://example.com:1234");
  });
});
