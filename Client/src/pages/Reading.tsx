/**
 * Reading page — book (PDF or chapters) plus a live assistant sidebar that
 * captures microphone audio, streams it to the WebSocket server, shows the
 * live transcript, and plays spoken help when the child struggles.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Minus,
  Plus,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import HighlightedText from "@/components/HighlightedText";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { isAssistantReady, useReadingAssistant } from "@/hooks/useReadingAssistant";
import { tokenizeSpeechText, useSpeechReader } from "@/hooks/useSpeechReader";
import { useToast } from "@/hooks/use-toast";
import { fetchReadableBook } from "@/services/bookService";
import {
  AssistantStatus,
  Book,
  HelpEvent,
  ReadingProgress,
  TranscriptionEvent,
  UserPreferences,
  StudentProfile,
} from "@/types";

const defaultPreferences: UserPreferences = {
  fontSize: 16,
  lineSpacing: 1.6,
  theme: "dark",
  readingLevel: "beginner",
};

const STATUS_LABEL: Record<AssistantStatus, string> = {
  idle: "Offline",
  connecting: "Connecting…",
  connected: "Active",
  reconnecting: "Reconnecting…",
  error: "Connection error",
};

const STATUS_DOT_COLOR: Record<AssistantStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-yellow-400",
  connected: "bg-green-400",
  reconnecting: "bg-yellow-400",
  error: "bg-red-400",
};

interface AssistantSidebarProps {
  status: AssistantStatus;
  isRecording: boolean;
  isSupported: boolean;
  unsupportedReason: string | null;
  micError: string | null;
  lastError: string | null;
  transcript: TranscriptionEvent[];
  helpMessages: HelpEvent[];
  onToggleMic: () => void;
  onClear: () => void;
  onClose: () => void;
  student?: StudentProfile;
  book?: Book | null;
}

const AssistantSidebar = ({
  status,
  isRecording,
  isSupported,
  unsupportedReason,
  micError,
  lastError,
  transcript,
  helpMessages,
  onToggleMic,
  onClear,
  onClose,
  student,
  book,
}: AssistantSidebarProps) => {
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, helpMessages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Reading Assistant</span>
          <span
            className={`ml-1 h-2 w-2 rounded-full ${STATUS_DOT_COLOR[status]} ${
              isRecording ? "animate-pulse" : ""
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {isRecording ? "Listening" : STATUS_LABEL[status]}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close assistant">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {student && (
        <div className="border-b border-border bg-primary/5 p-4">
          <p className="font-semibold text-foreground">Hi, {student.displayName}! 👋</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You’re reading <span className="font-semibold text-foreground">{book?.title}</span> with
            {` ${student.voice}`} voice support.
          </p>
        </div>
      )}

      {/* Mic control */}
      <div className="border-b border-border p-4">
        <Button
          onClick={onToggleMic}
          disabled={!isSupported}
          className={`w-full ${isRecording ? "bg-red-500 hover:bg-red-600" : "bg-primary"}`}
        >
          {isRecording ? (
            <MicOff className="mr-2 h-4 w-4" />
          ) : (
            <Mic className="mr-2 h-4 w-4" />
          )}
          {isRecording ? "Stop Reading Session" : "Start Reading Session"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          {isSupported
            ? "The assistant listens while you read and speaks up with encouragement if you get stuck."
            : (unsupportedReason ??
              "This browser does not support microphone capture.")}
        </p>
        {micError && <p className="mt-1 text-xs text-red-400">{micError}</p>}
        {lastError && <p className="mt-1 text-xs text-yellow-400">{lastError}</p>}
      </div>

      {/* Live feed: help messages + transcript */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {helpMessages.map((help) => (
            <motion.div
              key={help.timestamp}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-primary/30 bg-primary/10 p-3"
            >
              <div className="mb-1 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-primary">Assistant</span>
              </div>
              <p className="text-sm text-foreground">{help.helpMessage}</p>
            </motion.div>
          ))}
          {transcript.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={`text-sm ${
                entry.isPartial ? "italic text-muted-foreground" : "text-foreground"
              }`}
            >
              {entry.text}
            </div>
          ))}
          {transcript.length === 0 && helpMessages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Press “Start Reading Session” and begin reading — your words and the assistant’s encouragement
              will appear here.
            </p>
          )}
          <div ref={feedEndRef} />
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Button variant="outline" size="sm" onClick={onClear} className="w-full border-border">
          <Trash2 className="mr-2 h-4 w-4" />
          Clear transcript
        </Button>
      </div>
    </div>
  );
};

interface ReadingProps {
  student?: StudentProfile;
  selectedBook?: Book;
}

const Reading = ({ student, selectedBook }: ReadingProps) => {
  const [searchParams] = useSearchParams();
  const bookId = selectedBook?.id ?? searchParams.get("book") ?? "1";
  const [book, setBook] = useState<Book | null>(selectedBook ?? null);
  const [loading, setLoading] = useState(!selectedBook);
  const { toast } = useToast();

  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [areControlsCollapsed, setAreControlsCollapsed] = useState(false);
  const [preferences] = useLocalStorage<UserPreferences>("user-preferences", defaultPreferences);
  const [, setReadingHistory] = useLocalStorage<ReadingProgress[]>("reading-history", []);
  const [localFontSize, setLocalFontSize] = useState(preferences.fontSize);

  const assistant = useReadingAssistant({
    preferredVoiceName: student?.voice,
    voiceLocale: student?.voiceLocale,
  });
  const recorder = useAudioRecorder({ onChunk: assistant.sendAudio });
  const speech = useSpeechReader();
  const isAssistantConnected = isAssistantReady(assistant.status);
  const isRecording = recorder.isRecording;
  const stopRecording = recorder.stop;

  useEffect(() => {
    const loadBook = async () => {
      if (selectedBook) {
        setBook(selectedBook);
        setCurrentChapterIndex(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { book: resolvedBook, fellBack } = await fetchReadableBook(bookId);
      setBook(resolvedBook);
      setCurrentChapterIndex(0);
      setLoading(false);
      if (fellBack) {
        toast({
          title: "Book unavailable",
          description: `We couldn't open that book right now, so you're reading "${resolvedBook.title}" instead. Add the missing file to media/books to read the original.`,
          duration: 8000,
        });
      }
    };
    loadBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, selectedBook]);

  const chapters = book?.chapters ?? [];
  const chapterIndex = Math.min(currentChapterIndex, Math.max(chapters.length - 1, 0));
  const currentChapter = chapters.length ? chapters[chapterIndex] : null;
  const progress = chapters.length
    ? Math.round(((chapterIndex + 1) / chapters.length) * 100)
    : 0;

  // Word tokens for the on-screen chapter text, used for read-along highlighting.
  const chapterTokens = useMemo(
    () => tokenizeSpeechText(currentChapter?.content ?? ""),
    [currentChapter?.content]
  );

  // Persist reading progress when the chapter changes.
  useEffect(() => {
    if (!book || !currentChapter) return;
    setReadingHistory((prev) => {
      const updated = [...prev];
      const existing = updated.findIndex(
        (item) => item.bookId === book.id && item.chapterId === currentChapter.id
      );
      const entry: ReadingProgress = {
        bookId: book.id,
        chapterId: currentChapter.id,
        progress,
        lastRead: new Date().toISOString(),
      };
      if (existing >= 0) {
        updated[existing] = entry;
      } else {
        updated.push(entry);
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, currentChapter?.id]);

  const toggleMic = () => {
    if (recorder.isRecording) {
      recorder.stop();
    } else if (isAssistantConnected) {
      void recorder.start();
    }
  };

  const toggleReadAlong = () => {
    if (speech.isReading) {
      speech.stop();
      return;
    }
    if (!currentChapter) return;
    // Pause the mic so the assistant doesn't transcribe the narrator's voice.
    if (recorder.isRecording) recorder.stop();
    speech.start(currentChapter.content, chapterTokens, {
      lang: student?.voiceLocale,
      preferredVoiceName: student?.voice,
    });
  };

  // A connection loss makes microphone listening unavailable, but read-along
  // narration is browser-local and must keep working offline.
  useEffect(() => {
    if (isAssistantConnected) return;
    if (isRecording) stopRecording();
  }, [isAssistantConnected, isRecording, stopRecording]);

  // Stop the read-along narration when the chapter or book changes.
  useEffect(() => {
    speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentChapter?.id]);

  // Tell the server what's on screen so its guardrails can tell "reading
  // aloud" apart from "asking a question" and it only speaks up when the
  // child actually talks to it. Sent when the mic turns on and whenever the
  // chapter changes while recording.
  useEffect(() => {
    if (recorder.isRecording && book) {
      assistant.sendContext({
        text: currentChapter?.content ?? "",
        studentName: student?.displayName,
        profileId: student?.id,
        readingLevel: student?.readingLevel,
        voice: student?.voice,
        systemPrompt: student?.systemPrompt,
        bookTitle: book.title,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.isRecording, currentChapter?.id, book?.id, student?.id]);

  const assistantSidebar = (
    <AnimatePresence>
      {isAssistantOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 20 }}
          className="fixed right-0 top-16 bottom-0 w-80 glass-effect border-l border-border z-30"
        >
          <AssistantSidebar
            status={assistant.status}
            isRecording={recorder.isRecording}
            isSupported={recorder.isSupported && isAssistantConnected}
            unsupportedReason={
              !isAssistantConnected
                ? "Microphone controls are unavailable until the assistant reconnects."
                : recorder.unsupportedReason
            }
            micError={recorder.micError}
            lastError={assistant.lastError}
            transcript={assistant.transcript}
            helpMessages={assistant.helpMessages}
            onToggleMic={toggleMic}
            onClear={assistant.clearTranscript}
            onClose={() => setIsAssistantOpen(false)}
            student={student}
            book={book}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const floatingControls = (
    <div
      role="toolbar"
      aria-label="Reader controls"
      className={`fixed z-40 flex items-center gap-2 transition-all duration-300 ${
        isAssistantOpen
          ? "bottom-24 left-4 md:bottom-6 md:left-auto md:right-[21.5rem]"
          : "bottom-6 right-6"
      }`}
    >
      <AnimatePresence initial={false}>
        {!areControlsCollapsed && (
          <motion.div
            key="reader-controls"
            initial={{ opacity: 0, scale: 0.9, x: 12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 12 }}
            className="flex items-center gap-2"
          >
            {!isAssistantOpen && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <Button
                  onClick={() => setIsAssistantOpen(true)}
                  className="h-12 w-12 rounded-full bg-primary shadow-lg hover-glow"
                  aria-label="Open assistant"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </motion.div>
            )}
            {!book?.pdfUrl && currentChapter && (
              <Button
                onClick={toggleReadAlong}
                disabled={!speech.isSupported}
                aria-label={speech.isReading ? "Stop read-along" : "Read the story aloud"}
                title={
                  speech.isSupported
                    ? speech.isReading
                      ? "Stop read-along"
                      : "Read the story aloud with word highlighting"
                    : (speech.unsupportedReason ?? "Text-to-speech unavailable")
                }
                className={`h-12 w-12 rounded-full shadow-lg ${
                  speech.isReading ? "bg-red-500 hover:bg-red-600" : "bg-primary hover-glow"
                }`}
              >
                {speech.isReading ? (
                  <Square className="h-5 w-5" />
                ) : (
                  <Headphones className="h-5 w-5" />
                )}
              </Button>
            )}
            <Button
              onClick={toggleMic}
              disabled={!recorder.isSupported || !isAssistantConnected}
              aria-label={recorder.isRecording ? "Stop Reading Session" : "Start Reading Session"}
              title={
                !isAssistantConnected
                  ? "Microphone is unavailable until the assistant reconnects"
                  : (recorder.unsupportedReason ?? "Start Reading Session")
              }
              className={`h-12 w-12 rounded-full shadow-lg ${
                recorder.isRecording ? "bg-red-500 hover:bg-red-600" : "bg-primary hover-glow"
              }`}
            >
              {recorder.isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
            {!book?.pdfUrl && currentChapter && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-12 w-12 rounded-full border-border shadow-lg"
                    aria-label="Reader settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="bg-card border-border">
                  <SheetHeader>
                    <SheetTitle className="text-foreground">Reader Settings</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-4 block">
                        Font Size: {localFontSize}px
                      </label>
                      <div className="flex items-center gap-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setLocalFontSize((prev) => Math.max(12, prev - 2))}
                          className="border-border"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Slider
                          value={[localFontSize]}
                          onValueChange={(value) => setLocalFontSize(value[0])}
                          min={12}
                          max={24}
                          step={1}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setLocalFontSize((prev) => Math.min(24, prev + 2))}
                          className="border-border"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAreControlsCollapsed((collapsed) => !collapsed)}
        className="h-10 w-10 shrink-0 rounded-full border-border bg-card/90 shadow-lg backdrop-blur"
        aria-label={areControlsCollapsed ? "Expand reader controls" : "Collapse reader controls"}
        title={areControlsCollapsed ? "Expand reader controls" : "Collapse reader controls"}
      >
        {areControlsCollapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Book not found</h2>
          <p className="text-muted-foreground">The requested book could not be loaded.</p>
        </div>
      </div>
    );
  }

  // ── Branch 1: PDF books (real children's books) ─────────────────────
  if (book.pdfUrl) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <div className="flex h-[calc(100vh-4rem)]">
          <div className={`flex-1 transition-all duration-300 ${isAssistantOpen ? "mr-80" : ""}`}>
            <div className="h-full overflow-y-auto">
              <div className="container max-w-6xl px-4 py-8">
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 text-center"
                >
                  <h1 className="text-3xl font-bold gradient-text mb-2">{book.title}</h1>
                  <p className="text-muted-foreground">by {book.author}</p>
                </motion.div>
                <div
                  className="glass-effect rounded-xl overflow-hidden"
                  style={{ height: "calc(100vh - 250px)" }}
                >
                  <iframe src={book.pdfUrl} className="w-full h-full" title={book.title} />
                </div>
              </div>
            </div>
          </div>
          {assistantSidebar}
        </div>
        {floatingControls}
      </div>
    );
  }

  // ── Branch 2: Chapter-based books (bundled samples) ─────────────────
  if (currentChapter) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <div className="fixed top-16 left-0 right-0 z-40">
          <Progress value={progress} className="h-1 rounded-none" />
        </div>
        <div className="flex h-[calc(100vh-4rem)]">
          <div className={`flex-1 transition-all duration-300 ${isAssistantOpen ? "mr-80" : ""}`}>
            <div className="h-full overflow-y-auto">
              <div className="container max-w-3xl px-4 py-8">
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 text-center"
                >
                  <h1 className="text-3xl font-bold gradient-text mb-2">{book.title}</h1>
                  <p className="text-muted-foreground">by {book.author}</p>
                </motion.div>
                <motion.article
                  key={currentChapter.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-effect rounded-xl p-8 mb-8"
                  style={{
                    fontSize: `${localFontSize}px`,
                    lineHeight: preferences.lineSpacing,
                  }}
                >
                  <h2 className="text-2xl font-semibold mb-6">{currentChapter.title}</h2>
                  <HighlightedText
                    tokens={chapterTokens}
                    activeTokenIndex={speech.activeWordIndex}
                  />
                </motion.article>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentChapterIndex((prev) => Math.max(0, prev - 1))}
                    disabled={chapterIndex === 0}
                    className="border-border"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous Chapter
                  </Button>
                  <span className="text-muted-foreground">
                    Chapter {chapterIndex + 1} of {chapters.length}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentChapterIndex((prev) => Math.min(chapters.length - 1, prev + 1))
                    }
                    disabled={chapterIndex === chapters.length - 1}
                    className="border-border"
                  >
                    Next Chapter
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {assistantSidebar}
        </div>
        {floatingControls}
      </div>
    );
  }

  // ── Fallback: no readable content ────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">No readable content</h2>
        <p className="text-muted-foreground">
          This book has neither a PDF nor chapters available.
        </p>
      </div>
    </div>
  );


};

export default Reading;

