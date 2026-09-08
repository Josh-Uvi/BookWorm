import { describe, expect, it } from "vitest";
import {
  buildSpeechTimeline,
  estimateWordDurationMs,
  findWordIndexAtChar,
  findTimingPointAtElapsed,
  pickNarratorVoice,
  scoreNarratorVoice,
  speechUnsupportedReason,
  tokenizeSpeechText,
} from "@/hooks/useSpeechReader";

function voice(name: string, lang = "en-US"): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

describe("tokenizeSpeechText", () => {
  it("splits words and whitespace with char offsets preserved", () => {
    const text = "The cat\nsat.";
    const tokens = tokenizeSpeechText(text);
    expect(tokens.map((token) => token.text)).toEqual(["The", " ", "cat", "\n", "sat."]);
    expect(tokens[2]).toMatchObject({ start: 4, end: 7, isWord: true });
    expect(tokens[1]).toMatchObject({ start: 3, end: 4, isWord: false });
  });

  it("reproduces the original text when tokens are joined", () => {
    const text = "Once upon a time…\n\nThe end.";
    expect(tokenizeSpeechText(text).map((token) => token.text).join("")).toBe(text);
  });

  it("returns an empty list for empty text", () => {
    expect(tokenizeSpeechText("")).toEqual([]);
  });
});

describe("findWordIndexAtChar", () => {
  // tokens: "The"(0) " "(1) "cat"(2) " "(3) "sat."("sat" + ".")
  const tokens = tokenizeSpeechText("The cat sat.");

  it("maps a boundary charIndex at a word start to that word", () => {
    expect(findWordIndexAtChar(tokens, 4)).toBe(2); // "cat"
    expect(findWordIndexAtChar(tokens, 8)).toBe(4); // "sat."
  });

  it("maps a charIndex inside a word to that word", () => {
    expect(findWordIndexAtChar(tokens, 5)).toBe(2); // middle of "cat"
  });

  it("resolves whitespace offsets to the following word", () => {
    expect(findWordIndexAtChar(tokens, 3)).toBe(2); // space before "cat"
  });

  it("returns null for out-of-range or negative offsets", () => {
    expect(findWordIndexAtChar(tokens, 999)).toBeNull();
    expect(findWordIndexAtChar(tokens, -1)).toBeNull();
  });

  it("returns null for an empty token list", () => {
    expect(findWordIndexAtChar([], 0)).toBeNull();
  });
});

describe("fallback word timing", () => {
  it("starts the first word at zero and preserves token indexes", () => {
    const timeline = buildSpeechTimeline(tokenizeSpeechText("The quick fox."), 1);

    expect(timeline[0]).toMatchObject({ tokenIndex: 0, startMs: 0 });
    expect(timeline.map((point) => point.tokenIndex)).toEqual([0, 2, 4]);
    expect(timeline[1].startMs).toBe(timeline[0].durationMs);
  });

  it("allows longer words more time than short words", () => {
    expect(estimateWordDurationMs("automatically")).toBeGreaterThan(
      estimateWordDurationMs("a")
    );
  });

  it("adds natural pauses after punctuation", () => {
    expect(estimateWordDurationMs("hello.")).toBeGreaterThan(
      estimateWordDurationMs("hello")
    );
    expect(estimateWordDurationMs("hello,")).toBeGreaterThan(
      estimateWordDurationMs("hello")
    );
  });

  it("speeds up the timeline when speech rate increases", () => {
    expect(estimateWordDurationMs("reading", 1.2)).toBeLessThan(
      estimateWordDurationMs("reading", 0.8)
    );
  });

  it("catches up to the correct word from elapsed narration time", () => {
    const timeline = buildSpeechTimeline(tokenizeSpeechText("one two three four"), 1);
    const thirdWord = timeline[2];

    expect(findTimingPointAtElapsed(timeline, thirdWord.startMs + 1)).toBe(2);
    expect(findTimingPointAtElapsed(timeline, 0)).toBe(0);
    expect(findTimingPointAtElapsed([], 500)).toBeNull();
  });
});

describe("speechUnsupportedReason", () => {
  it("reports missing speechSynthesis support", () => {
    expect(
      speechUnsupportedReason({ speechSynthesis: false, speechSynthesisUtterance: true })
    ).toMatch(/text-to-speech/);
  });

  it("reports missing SpeechSynthesisUtterance support", () => {
    expect(
      speechUnsupportedReason({ speechSynthesis: true, speechSynthesisUtterance: false })
    ).toMatch(/text-to-speech/);
  });

  it("returns null when speech synthesis is available", () => {
    expect(
      speechUnsupportedReason({ speechSynthesis: true, speechSynthesisUtterance: true })
    ).toBeNull();
  });
});

describe("narrator voice selection", () => {
  it("prefers a natural voice over a robotic system voice", () => {
    const natural = voice("Microsoft Aria Online (Natural) - English (United States)");
    const robotic = voice("Zarvox");

    expect(scoreNarratorVoice(natural)).toBeGreaterThan(scoreNarratorVoice(robotic));
    expect(pickNarratorVoice([robotic, natural])).toBe(natural);
  });

  it("prefers a known clear narrator such as Samantha over an unknown compact voice", () => {
    const compact = voice("Unknown Compact Voice");
    const samantha = voice("Samantha");

    expect(pickNarratorVoice([compact, samantha])).toBe(samantha);
  });

  it("prefers the requested language over a high-quality foreign voice", () => {
    const english = voice("Samantha", "en-US");
    const foreignNatural = voice("Marie Natural", "fr-FR");

    expect(pickNarratorVoice([foreignNatural, english], "en-US")).toBe(english);
  });

  it("returns null when the browser has not provided voices", () => {
    expect(pickNarratorVoice([])).toBeNull();
  });
});
