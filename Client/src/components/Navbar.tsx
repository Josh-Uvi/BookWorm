import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Home, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  const location = useLocation();
  
  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/reading", label: "Reading", icon: BookOpen },
    { path: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <motion.div
              whileHover={{ rotate: 10 }}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary"
            >
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <span className="text-xl font-bold gradient-text">Bookworm</span>
          </Link>
          
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative px-4 py-2"
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
                    <span className="hidden sm:inline">{item.label}</span>
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
