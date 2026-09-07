import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  X,
  Send,
  Users,
  Minus,
  Plus,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { fetchBook } from "@/services/bookService";
import { Book, ChatMessage, UserPreferences, UserProfile, ReadingProgress } from "@/types";

const defaultPreferences: UserPreferences = {
  fontSize: 16,
  lineSpacing: 1.6,
  theme: "dark",
  readingLevel: "beginner",
};

const defaultProfile: UserProfile = {
  id: "user-1",
  name: "Reader",
  avatarUrl: "",
  bio: "",
};

// Sample chat messages for demonstration
const initialMessages: ChatMessage[] = [
  {
    id: "1",
    userId: "user-2",
    userName: "BookLover42",
    avatarUrl: "",
    content: "This chapter is amazing! The twist at the end...",
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: "2",
    userId: "user-3",
    userName: "NightReader",
    avatarUrl: "",
    content: "I didn't see that coming at all!",
    timestamp: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: "3",
    userId: "user-4",
    userName: "SciFiFan",
    avatarUrl: "",
    content: "The world-building is incredible. Maya's journey is so compelling.",
    timestamp: new Date(Date.now() - 1 * 60000).toISOString(),
  },
];

const Reading = () => {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get("book") || "1";
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [preferences] = useLocalStorage<UserPreferences>("user-preferences", defaultPreferences);
  const [profile] = useLocalStorage<UserProfile>("user-profile", defaultProfile);
  const [, setReadingHistory] = useLocalStorage<ReadingProgress[]>("reading-history", []);
  const [localFontSize, setLocalFontSize] = useState(preferences.fontSize);
  const [onlineUsers] = useState(12);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      const fetchedBook = await fetchBook(bookId);
      setBook(fetchedBook);
      setLoading(false);
    };
    loadBook();
  }, [bookId]);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    const message: ChatMessage = {
      id: Date.now().toString(),
      userId: profile.id,
      userName: profile.name,
      avatarUrl: profile.avatarUrl,
      content: newMessage,
      timestamp: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, message]);
    setNewMessage("");
    
    // Simulate response after a short delay
    setTimeout(() => {
      const responses = [
        "I totally agree!",
        "Great observation!",
        "That's an interesting perspective.",
        "I love this part too!",
        "Can't wait to see what happens next!",
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          userId: "user-bot",
          userName: "BookBot",
          avatarUrl: "",
          content: randomResponse,
          timestamp: new Date().toISOString(),
        },
      ]);
    }, 1500);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

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

  // If book has PDF, render PDF viewer
  if (book.pdfUrl) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <div className="flex h-[calc(100vh-4rem)]">
          {/* PDF Viewer Area */}
          <div className={`flex-1 transition-all duration-300 ${isChatOpen ? "mr-80" : ""}`}>
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
                
                <div className="glass-effect rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
                  <iframe
                    src={book.pdfUrl}
                    className="w-full h-full"
                    title={book.title}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chat Sidebar */}
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 20 }}
                className="fixed right-0 top-16 bottom-0 w-80 glass-effect border-l border-border z-30"
              >
                <div className="flex h-full flex-col">
                  {/* Chat Header */}
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-foreground">Live Chat</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Users className="h-4 w-4 mr-1" />
                        {onlineUsers}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsChatOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex gap-3 ${
                            message.userId === profile.id ? "flex-row-reverse" : ""
                          }`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.avatarUrl} alt={message.userName} />
                            <AvatarFallback className="bg-primary/20 text-xs">
                              {message.userName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`flex-1 ${
                              message.userId === profile.id ? "text-right" : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground">
                                {message.userName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(message.timestamp)}
                              </span>
                            </div>
                            <div
                              className={`inline-block rounded-lg px-3 py-2 text-sm ${
                                message.userId === profile.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-surface text-foreground"
                              }`}
                            >
                              {message.content}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="border-t border-border p-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage();
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-surface border-border"
                      />
                      <Button type="submit" size="icon" className="bg-primary">
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Chat Toggle */}
          {!isChatOpen && (
            <div className="fixed bottom-6 right-6 z-40">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              >
                <Button
                  onClick={() => setIsChatOpen(true)}
                  className="h-12 w-12 rounded-full bg-primary shadow-lg hover-glow"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentChapter = book.chapters[currentChapterIndex];
  const progress = ((currentChapterIndex + 1) / book.chapters.length) * 100;

  const getThemeStyles = () => {
    switch (preferences.theme) {
      case "light":
        return "bg-white/10 text-foreground";
      default:
        return "bg-card text-foreground";
    }
  };

  // Update reading history
  useEffect(() => {
    setReadingHistory((prev) => {
      const existing = prev.findIndex((p) => p.bookId === book.id);
      const newProgress: ReadingProgress = {
        bookId: book.id,
        chapterId: currentChapter.id,
        progress: Math.round(progress),
        lastRead: new Date().toISOString(),
      };
      
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newProgress;
        return updated;
      }
      return [...prev, newProgress];
    });
  }, [currentChapterIndex, book.id, currentChapter.id, progress, setReadingHistory]);



  return (
    <div className="min-h-screen bg-background pt-16">
      {/* Progress Bar */}
      <div className="fixed top-16 left-0 right-0 z-40">
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Main Reading Area */}
        <div className={`flex-1 transition-all duration-300 ${isChatOpen ? "mr-80" : ""}`}>
          <div className="h-full overflow-y-auto">
            <div className="container max-w-3xl px-4 py-8">
              {/* Book Title */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 text-center"
              >
                <h1 className="text-3xl font-bold gradient-text mb-2">{book.title}</h1>
                <p className="text-muted-foreground">by {book.author}</p>
              </motion.div>

              {/* Chapter Content */}
              <motion.article
                key={currentChapter.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`glass-effect rounded-xl p-8 mb-8 ${getThemeStyles()}`}
                style={{
                  fontSize: `${localFontSize}px`,
                  lineHeight: preferences.lineSpacing,
                }}
              >
                <h2 className="text-2xl font-semibold mb-6">{currentChapter.title}</h2>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {currentChapter.content}
                </div>
              </motion.article>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setCurrentChapterIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentChapterIndex === 0}
                  className="border-border"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous Chapter
                </Button>
                
                <span className="text-muted-foreground">
                  Chapter {currentChapterIndex + 1} of {book.chapters.length}
                </span>
                
                <Button
                  variant="outline"
                  onClick={() =>
                    setCurrentChapterIndex((prev) =>
                      Math.min(book.chapters.length - 1, prev + 1)
                    )
                  }
                  disabled={currentChapterIndex === book.chapters.length - 1}
                  className="border-border"
                >
                  Next Chapter
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 20 }}
              className="fixed right-0 top-16 bottom-0 w-80 glass-effect border-l border-border z-30"
            >
              <div className="flex h-full flex-col">
                {/* Chat Header */}
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground">Live Chat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="h-4 w-4 mr-1" />
                      {onlineUsers}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsChatOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-3 ${
                          message.userId === profile.id ? "flex-row-reverse" : ""
                        }`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={message.avatarUrl} alt={message.userName} />
                          <AvatarFallback className="bg-primary/20 text-xs">
                            {message.userName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={`flex-1 ${
                            message.userId === profile.id ? "text-right" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">
                              {message.userName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(message.timestamp)}
                            </span>
                          </div>
                          <div
                            className={`inline-block rounded-lg px-3 py-2 text-sm ${
                              message.userId === profile.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-surface text-foreground"
                            }`}
                          >
                            {message.content}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t border-border p-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-surface border-border"
                    />
                    <Button type="submit" size="icon" className="bg-primary">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Controls */}
        <div className="fixed bottom-6 right-6 flex gap-2 z-40">
          {/* Chat Toggle */}
          {!isChatOpen && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              <Button
                onClick={() => setIsChatOpen(true)}
                className="h-12 w-12 rounded-full bg-primary shadow-lg hover-glow"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            </motion.div>
          )}

          {/* Reader Settings */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="h-12 w-12 rounded-full border-border shadow-lg"
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
        </div>
      </div>
    </div>
  );
};

export default Reading;
