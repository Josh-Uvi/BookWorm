import { motion } from "framer-motion";
import { Book } from "@/types";

interface BookCardProps {
  book: Book;
  onClick?: () => void;
  progress?: number;
}

export function BookCard({ book, onClick, progress }: BookCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative overflow-hidden rounded-lg glass-effect hover-glow">
        <div className="aspect-[2/3] overflow-hidden">
          <img
            src={book.coverUrl}
            alt={book.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
        </div>
        
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-gradient-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span className="mb-2 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
            {book.genre}
          </span>
          <h3 className="mb-1 text-lg font-semibold text-foreground line-clamp-2">
            {book.title}
          </h3>
          <p className="text-sm text-muted-foreground">{book.author}</p>
        </div>
      </div>
    </motion.div>
  );
}
