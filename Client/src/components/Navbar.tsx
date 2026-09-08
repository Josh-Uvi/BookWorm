import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, User } from "lucide-react";
import { useReadingFlow } from "@/contexts/ReadingFlowContext";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  const location = useLocation();
  const { currentStudent } = useReadingFlow();
  
  const navItems = [
    ...(currentStudent
      ? [{
          path: "/profile",
          label: currentStudent.displayName,
          ariaLabel: `${currentStudent.displayName} profile`,
          icon: User,
        }]
      : []),
  ];

  const brand = (
    <>
      <motion.div
        whileHover={currentStudent ? undefined : { rotate: 10 }}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary"
      >
        <BookOpen className="h-5 w-5 text-primary-foreground" />
      </motion.div>
      <span className="hidden text-xl font-bold gradient-text sm:inline">Bookworm</span>
    </>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {currentStudent ? (
            <div
              className="flex cursor-default items-center gap-2"
              aria-label="Bookworm navigation disabled during an active student session"
              aria-disabled="true"
              title="Use Switch Student in the reading session to sign out"
            >
              {brand}
            </div>
          ) : (
            <Link to="/" className="flex items-center gap-2" aria-label="Bookworm home">
              {brand}
            </Link>
          )}
          
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-label={item.ariaLabel ?? item.label}
                  className="relative px-1 py-2 sm:px-3"
                >
                  <motion.div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden max-w-28 truncate sm:inline">{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="navbar-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"
                        initial={false}
                        transition={{ type: "spring", bounce: 0.25 }}
                      />
                    )}
                  </motion.div>
                </Link>
              );
            })}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
