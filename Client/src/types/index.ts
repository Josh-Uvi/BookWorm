export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  genre: string;
  pdfUrl?: string;
  interests?: string[];
  chapters: Chapter[];
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
