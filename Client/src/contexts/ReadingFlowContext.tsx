import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { Book, ReadingProgress, StudentProfile } from "@/types";
import {
  initialReadingFlowState,
  readingFlowReducer,
  ReadingFlowState,
} from "./readingFlowState";

const STORAGE_KEY = "reading-flow-session";

function restoreState(): ReadingFlowState {
  if (typeof window === "undefined") return initialReadingFlowState;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return initialReadingFlowState;
    const parsed = JSON.parse(stored) as Partial<ReadingFlowState>;
    const currentStudent = parsed.currentStudent ?? null;
    return {
      currentStudent,
      selectedBook: currentStudent ? (parsed.selectedBook ?? null) : null,
      readingHistory: currentStudent ? (parsed.readingHistory ?? []) : [],
    };
  } catch {
    return initialReadingFlowState;
  }
}

interface ReadingFlowContextValue extends ReadingFlowState {
  login: (student: StudentProfile) => void;
  updateStudent: (
    updates: Partial<Pick<StudentProfile, "displayName" | "description" | "avatarUrl">>
  ) => void;
  selectBook: (book: Book) => void;
  clearBook: () => void;
  recordProgress: (entry: ReadingProgress) => void;
  clearHistory: () => void;
  switchStudent: () => void;
}

const ReadingFlowContext = createContext<ReadingFlowContextValue | null>(null);

export function ReadingFlowProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    readingFlowReducer,
    initialReadingFlowState,
    restoreState
  );

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be blocked in privacy modes; in-memory routing still works.
    }
  }, [state]);

  const value = useMemo<ReadingFlowContextValue>(
    () => ({
      ...state,
      login: (student) => dispatch({ type: "login", student }),
      updateStudent: (updates) => dispatch({ type: "update-student", updates }),
      selectBook: (book) => dispatch({ type: "select-book", book }),
      clearBook: () => dispatch({ type: "clear-book" }),
      recordProgress: (entry) => dispatch({ type: "record-progress", entry }),
      clearHistory: () => dispatch({ type: "clear-history" }),
      switchStudent: () => dispatch({ type: "switch-student" }),
    }),
    [state]
  );

  return <ReadingFlowContext.Provider value={value}>{children}</ReadingFlowContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider and hook share one context
export function useReadingFlow(): ReadingFlowContextValue {
  const context = useContext(ReadingFlowContext);
  if (!context) {
    throw new Error("useReadingFlow must be used inside ReadingFlowProvider");
  }
  return context;
}