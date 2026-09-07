import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookCard } from "@/components/BookCard";
import { useState, useEffect } from "react";
import { fetchBooks } from "@/services/bookService";
import { Book } from "@/types";

const Landing = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBooks = async () => {
      const fetchedBooks = await fetchBooks();
      setBooks(fetchedBooks.slice(0, 3));
      setLoading(false);
    };
    loadBooks();
  }, []);

  const features = [
    {
      icon: BookOpen,
      title: "Immersive Reading",
      description: "Distraction-free reading experience with customizable themes and fonts.",
    },
    {
      icon: Users,
      title: "Live Chat",
      description: "Discuss books in real-time with other readers while you read.",
    },
    {
      icon: Sparkles,
      title: "Smart Progress",
      description: "Track your reading progress and pick up right where you left off.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        </div>
        
        <div className="container relative z-10 px-4 pt-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mx-auto max-w-4xl text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
              className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-primary"
            >
              <BookOpen className="h-10 w-10 text-primary-foreground" />
            </motion.div>
            
            <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
              <span className="gradient-text">Read Together,</span>
              <br />
              <span className="text-foreground">Discover Forever</span>
            </h1>
            
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Immerse yourself in stories with a beautiful reading experience. 
              Connect with fellow readers through live chat and track your literary journey.
            </p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex justify-center"
            >
              <Button
                size="lg"
                onClick={() => navigate("/interests")}
                className="group bg-gradient-primary hover:opacity-90 text-primary-foreground px-8"
              >
                Choose Your Interests
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
        
        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex flex-col items-center text-muted-foreground"
          >
            <span className="text-sm mb-2">Scroll to explore</span>
            <div className="h-10 w-6 rounded-full border-2 border-muted-foreground/50 flex items-start justify-center p-1">
              <motion.div
                animate={{ y: [0, 16, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="h-2 w-1.5 rounded-full bg-muted-foreground"
              />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-surface/50">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold mb-4 text-foreground">
              Everything You Need to Read
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A modern reading experience designed for comfort and connection.
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="glass-effect rounded-xl p-6 hover-glow"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Books Section */}
      <section className="py-24">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-between mb-12"
          >
            <div>
              <h2 className="text-3xl font-bold mb-2 text-foreground">Featured Books</h2>
              <p className="text-muted-foreground">Discover your next favorite read</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => navigate("/reading")}
              className="group text-primary hover:text-primary"
            >
              View All
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Loading books...
              </div>
            ) : books.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No books available
              </div>
            ) : (
              books.map((book, index) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <BookCard
                    book={book}
                    onClick={() => navigate(`/reading?book=${book.id}`)}
                  />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-surface/50">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass-effect rounded-2xl p-8 md:p-16 text-center hover-glow"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              Ready to Start Your Journey?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Tell us what you love to read and we'll personalize your experience!
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/interests")}
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground px-8"
            >
              Choose Your Interests
              <Sparkles className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
