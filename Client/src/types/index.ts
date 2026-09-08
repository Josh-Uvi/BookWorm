export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  genre: string;
  level?: 2 | 3;
  pages?: number;
  publishedYear?: number;
  pdfUrl?: string;
  interests?: string[];
  chapters: Chapter[];
}

export interface StudentProfile {
  id: "student-a" | "student-b";
  loginName: "StudentA" | "StudentB";
  displayName: string;
  readingLevel: 2 | 3;
  readingLabel: string;
  voice: "Tiffany" | "Amy";
  voiceLocale: "en-US" | "en-GB";
  description: string;
  avatarUrl?: string;
  tools: string[];
  systemPrompt: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  progress: number;
  lastRead: string;
}

export interface UserPreferences {
  fontSize: number;
  lineSpacing: number;
  theme: 'dark' | 'light';
  readingLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string;
  content: string;
  timestamp: string;
}

// ── Reading assistant (WebSocket) types ──────────────────────────────

export type AssistantStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface TranscriptionEvent {
  text: string;
  confidence: number | null;
  isPartial: boolean;
  timestamp: string;
}

export interface HelpEvent {
  helpMessage: string;
  audio?: string;
  audioFormat?: string;
  confidence?: number;
  reason?: string;
  timestamp: string;
}
