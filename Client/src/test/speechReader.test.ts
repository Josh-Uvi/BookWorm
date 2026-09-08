import { describe, expect, it } from "vitest";
import {
  findWordIndexAtChar,
  speechUnsupportedReason,
  tokenizeSpeechText,
} from "@/hooks/useSpeechReader";

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
