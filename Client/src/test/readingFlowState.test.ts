import { describe, expect, it } from "vitest";
import {
  initialReadingFlowState,
  readingFlowReducer,
} from "@/contexts/readingFlowState";
import { DemoProfiles } from "@/data/demoProfiles";
import { readingLevelBooks } from "@/data/readingBooks";

describe("readingFlowReducer", () => {
  const studentA = DemoProfiles[0];
  const studentB = DemoProfiles[1];
  const levelTwoBook = readingLevelBooks.find((book) => book.level === 2)!;

  it("keeps login and selected-book state in one flow", () => {
    const loggedIn = readingFlowReducer(initialReadingFlowState, {
      type: "login",
      student: studentA,
    });
    const reading = readingFlowReducer(loggedIn, {
      type: "select-book",
      book: levelTwoBook,
    });

    expect(reading.currentStudent).toBe(studentA);
    expect(reading.selectedBook).toBe(levelTwoBook);
  });

  it("clears a previous book when another student logs in", () => {
    const reading = {
      currentStudent: studentA,
      selectedBook: levelTwoBook,
    };

    expect(readingFlowReducer(reading, { type: "login", student: studentB })).toEqual({
      currentStudent: studentB,
      selectedBook: null,
    });
  });

  it("updates the active profile without losing the selected book", () => {
    const reading = {
      currentStudent: studentA,
      selectedBook: levelTwoBook,
    };

    const updated = readingFlowReducer(reading, {
      type: "update-student",
      updates: {
        displayName: "Alex",
        description: "I love funny stories.",
      },
    });

    expect(updated.currentStudent).toMatchObject({
      id: "student-a",
      loginName: "StudentA",
      displayName: "Alex",
      description: "I love funny stories.",
      readingLevel: 2,
      voice: "Tiffany",
    });
    expect(updated.selectedBook).toBe(levelTwoBook);
  });

  it("clears both route-shared values when switching students", () => {
    const reading = {
      currentStudent: studentA,
      selectedBook: levelTwoBook,
    };

    expect(readingFlowReducer(reading, { type: "switch-student" })).toEqual(
      initialReadingFlowState
    );
  });
});