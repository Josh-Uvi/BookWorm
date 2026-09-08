import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, BookOpenCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchBooksByLevel } from "@/services/bookService";
import { Book, StudentProfile } from "@/types";

interface BookSelectionProps {
  student: StudentProfile;
  onSelect: (book: Book) => void;
}

export default function BookSelection({ student, onSelect }: BookSelectionProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchBooksByLevel(student.readingLevel).then((result) => {
      if (!active) return;
      setBooks(result.books);
      setLoading(false);
      if (result.fellBack) {
        setError("We couldn't reach the server book shelves, so we loaded backup reading books.");
      }
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setError("We couldn't load books right now. Please go back and try again.");
    });
    return () => { active = false; };
  }, [student.readingLevel]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-100 via-background to-violet-100 px-3 pb-28 pt-24 text-foreground sm:px-4 sm:pt-28 dark:from-sky-950/40 dark:to-violet-950/40">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 text-center sm:mb-9">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg sm:h-16 sm:w-16">
            <BookOpenCheck className="h-7 w-7 text-white sm:h-8 sm:w-8" />
          </div>
          <h1 className="text-3xl font-black leading-tight sm:text-4xl md:text-5xl">Pick your next story, {student.displayName}!</h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">Level {student.readingLevel} · {student.readingLabel} · {student.voice} voice</p>
        </div>

        {error && (
          <div role="status" className="mx-auto mb-6 flex max-w-3xl items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertCircle className="h-5 w-5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-semibold">Finding Level {student.readingLevel} books…</p>
          </div>
        ) : books.length === 0 ? (
          <div className="rounded-3xl border bg-card p-12 text-center shadow-sm">
            <h2 className="text-2xl font-bold">No books found</h2>
            <p className="mt-2 text-muted-foreground">Try going back and choosing your profile again.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {books.map((book, index) => {
              const isSelected = selectedBook?.id === book.id;
              return (
                <motion.button
                  key={book.id}
                  type="button"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  onClick={() => setSelectedBook(book)}
                  className="text-left"
                  aria-pressed={isSelected}
                >
                  <Card className={`h-full overflow-hidden border-2 transition-all ${isSelected ? "border-primary shadow-xl ring-4 ring-primary/20" : "hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"}`}>
                    <div className="relative h-44 overflow-hidden bg-muted sm:h-48">
                      <img src={book.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <Badge className="absolute left-4 top-4">Level {book.level ?? student.readingLevel}</Badge>
                      {isSelected && <CheckCircle2 className="absolute right-4 top-4 h-8 w-8 fill-white text-primary" />}
                      <div className="absolute bottom-4 left-4 right-4 text-white">
                        <h2 className="text-2xl font-black leading-tight">{book.title}</h2>
                        <p className="mt-1 text-sm text-white/85">by {book.author}</p>
                      </div>
                    </div>
                    <CardContent className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                        <span className="rounded-full bg-muted px-3 py-1">{book.pages ?? "?"} pages</span>
                        <span className="rounded-full bg-muted px-3 py-1">{book.genre}</span>
                        {book.publishedYear && <span className="rounded-full bg-muted px-3 py-1">{book.publishedYear}</span>}
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{book.description}</p>
                    </CardContent>
                  </Card>
                </motion.button>
              );
            })}
          </div>
        )}

        {!loading && books.length > 0 && (
          <div className="sticky bottom-3 z-20 mt-8 flex justify-center px-1 sm:bottom-4">
            <Button size="lg" disabled={!selectedBook} onClick={() => selectedBook && onSelect(selectedBook)} className="h-14 w-full max-w-xl rounded-full bg-gradient-primary px-5 text-base font-bold shadow-xl sm:w-auto sm:px-10 sm:text-lg">
              {selectedBook ? `Read ${selectedBook.title}` : "Select one book"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}