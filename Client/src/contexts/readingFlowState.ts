import { Book, StudentProfile } from "@/types";

export interface ReadingFlowState {
  currentStudent: StudentProfile | null;
  selectedBook: Book | null;
}

export type ReadingFlowAction =
  | { type: "login"; student: StudentProfile }
  | {
      type: "update-student";
      updates: Partial<Pick<StudentProfile, "displayName" | "description" | "avatarUrl">>;
    }
  | { type: "select-book"; book: Book }
  | { type: "clear-book" }
  | { type: "switch-student" };

export const initialReadingFlowState: ReadingFlowState = {
  currentStudent: null,
  selectedBook: null,
};

export function readingFlowReducer(
  state: ReadingFlowState,
  action: ReadingFlowAction
): ReadingFlowState {
  switch (action.type) {
    case "login":
      // A book belongs to the profile that selected it. Logging in as another
      // student always starts a fresh level-appropriate book selection.
      return { currentStudent: action.student, selectedBook: null };
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
    case "switch-student":
      return initialReadingFlowState;
    default:
      return state;
  }
}