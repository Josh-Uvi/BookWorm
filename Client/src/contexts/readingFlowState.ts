import { Book, ReadingProgress, StudentProfile } from "@/types";

export interface ReadingFlowState {
  currentStudent: StudentProfile | null;
  selectedBook: Book | null;
  readingHistory: ReadingProgress[];
}

export type ReadingFlowAction =
  | { type: "login"; student: StudentProfile }
  | {
      type: "update-student";
      updates: Partial<Pick<StudentProfile, "displayName" | "description" | "avatarUrl">>;
    }
  | { type: "select-book"; book: Book }
  | { type: "clear-book" }
  | { type: "record-progress"; entry: ReadingProgress }
  | { type: "clear-history" }
  | { type: "switch-student" };

export const initialReadingFlowState: ReadingFlowState = {
  currentStudent: null,
  selectedBook: null,
  readingHistory: [],
};

export function readingFlowReducer(
  state: ReadingFlowState,
  action: ReadingFlowAction
): ReadingFlowState {
  switch (action.type) {
    case "login":
      // A book belongs to the profile that selected it. Logging in as another
      // student always starts a fresh level-appropriate book selection.
      return {
        currentStudent: action.student,
        selectedBook: null,
        readingHistory: [],
      };
    case "update-student":
      if (!state.currentStudent) return state;
      return {
        ...state,
        currentStudent: { ...state.currentStudent, ...action.updates },
      };
    case "select-book":
      return { ...state, selectedBook: action.book };
    case "clear-book":
      return { ...state, selectedBook: null };
    case "record-progress": {
      // History entries carry their own book snapshot, so the profile page
      // never resolves them against static fixture data.
      const readingHistory = [...state.readingHistory];
      const index = readingHistory.findIndex(
        (item) =>
          item.bookId === action.entry.bookId &&
          item.chapterId === action.entry.chapterId
      );
      if (index >= 0) {
        readingHistory[index] = action.entry;
      } else {
        readingHistory.push(action.entry);
      }
      return { ...state, readingHistory };
    }
    case "clear-history":
      return { ...state, readingHistory: [] };
    case "switch-student":
      return initialReadingFlowState;
    default:
      return state;
  }
}