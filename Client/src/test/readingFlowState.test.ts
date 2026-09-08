import { describe, expect, it } from "vitest";
import {
  initialReadingFlowState,
  readingFlowReducer,
  ReadingFlowState,
} from "@/contexts/readingFlowState";
import { DemoProfiles } from "@/data/demoProfiles";
import { readingLevelBooks } from "@/data/readingBooks";
import { ReadingProgress } from "@/types";

describe("readingFlowReducer", () => {
  const studentA = DemoProfiles[0];
  const studentB = DemoProfiles[1];
  const levelTwoBook = readingLevelBooks.find((book) => book.level === 2)!;

  const baseState: ReadingFlowState = {
    currentStudent: studentA,
    selectedBook: null,
    readingHistory: [],
  };

  const historyEntry: ReadingProgress = {
    bookId: "book_2_1",
    chapterId: "book_2_1-sample",
    progress: 40,
    lastRead: "2026-09-08T10:00:00.000Z",
    bookTitle: "The Cat in the Hat",
    bookAuthor: "Dr. Seuss",
    chapterTitle: "Reading Practice",
    readingLevel: 2,
  };

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
    const reading = { ...baseState, selectedBook: levelTwoBook };

    expect(readingFlowReducer(reading, { type: "login", student: studentB })).toEqual({
      currentStudent: studentB,
      selectedBook: null,
      readingHistory: [],
    });
  });

  it("updates the active profile without losing the selected book", () => {
    const reading = { ...baseState, selectedBook: levelTwoBook };

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

  it("records reading progress with a self-contained book snapshot", () => {
    const reading = readingFlowReducer(baseState, {
      type: "record-progress",
      entry: historyEntry,
    });

    expect(reading.readingHistory).toHaveLength(1);
    expect(reading.readingHistory[0]).toMatchObject({
      bookId: "book_2_1",
      bookTitle: "The Cat in the Hat",
      bookAuthor: "Dr. Seuss",
      readingLevel: 2,
    });
  });

  it("upserts progress for the same chapter instead of duplicating it", () => {
    const recorded = readingFlowReducer(baseState, {
      type: "record-progress",
      entry: historyEntry,
    });
    const updated = readingFlowReducer(recorded, {
      type: "record-progress",
      entry: { ...historyEntry, progress: 80, lastRead: "2026-09-08T11:00:00.000Z" },
    });

    expect(updated.readingHistory).toHaveLength(1);
    expect(updated.readingHistory[0].progress).toBe(80);
    expect(updated.readingHistory[0].lastRead).toBe("2026-09-08T11:00:00.000Z");
  });

  it("clears history without ending the student session", () => {
    const withHistory: ReadingFlowState = {
      currentStudent: studentA,
      selectedBook: levelTwoBook,
      readingHistory: [historyEntry],
    };

    const cleared = readingFlowReducer(withHistory, { type: "clear-history" });

    expect(cleared.readingHistory).toEqual([]);
    expect(cleared.currentStudent).toBe(studentA);
    expect(cleared.selectedBook).toBe(levelTwoBook);
  });

  it("clears reading history when switching students", () => {
    const withHistory = { ...baseState, readingHistory: [historyEntry] };

    expect(readingFlowReducer(withHistory, { type: "switch-student" })).toEqual(
      initialReadingFlowState
    );
  });
});