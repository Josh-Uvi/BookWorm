import { describe, expect, it } from "vitest";
import { micUnsupportedReason } from "@/hooks/useAudioRecorder";

describe("micUnsupportedReason", () => {
  it("explains the secure-context rule for plain-HTTP (insecure) origins", () => {
    const reason = micUnsupportedReason({ secureContext: false, getUserMedia: true, mediaRecorder: true });
    expect(reason).toMatch(/localhost/);
    expect(reason).toMatch(/HTTPS/);
  });

  it("reports missing getUserMedia support on secure origins", () => {
    expect(
      micUnsupportedReason({ secureContext: true, getUserMedia: false, mediaRecorder: true })
    ).toMatch(/getUserMedia/);
  });

  it("reports missing MediaRecorder support", () => {
    expect(
      micUnsupportedReason({ secureContext: true, getUserMedia: true, mediaRecorder: false })
    ).toMatch(/MediaRecorder/);
  });

  it("returns null when the microphone is available", () => {
    expect(
      micUnsupportedReason({ secureContext: true, getUserMedia: true, mediaRecorder: true })
    ).toBeNull();
  });
});
