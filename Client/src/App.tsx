import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme";
import { ReadingFlowProvider, useReadingFlow } from "./contexts/ReadingFlowContext";
import { Navbar } from "./components/Navbar";
import Landing from "./pages/Landing";
import Interests from "./pages/Interests";
import Reading from "./pages/Reading";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import StudentLogin from "./components/StudentLogin";
import BookSelection from "./components/BookSelection";

const queryClient = new QueryClient();

/**
 * Shared controller for the student flow routes: /login -> /books -> /reading.
 * All three routes render this component so navigation and app state stay in
 * sync through the single ReadingFlowContext source of truth.
 */
function StudentFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentStudent, selectedBook, login, selectBook } = useReadingFlow();

  useEffect(() => {
    if (location.pathname !== "/reading" || !selectedBook) return;
    const expectedSearch = `?book=${encodeURIComponent(selectedBook.id)}`;
    if (location.search !== expectedSearch) {
      navigate({ pathname: "/reading", search: expectedSearch }, { replace: true });
    }
  }, [location.pathname, location.search, navigate, selectedBook]);

  if (!currentStudent) {
    // Protected flow: everything except the login step requires a session.
    if (location.pathname !== "/login") {
      return <Navigate to="/login" replace />;
    }
    return (
      <StudentLogin
        onLogin={(student) => {
          login(student);
          navigate("/books");
        }}
      />
    );
  }

  if (location.pathname === "/login") {
    // Already signed in — skip straight to book selection.
    return <Navigate to="/books" replace />;
  }

  if (location.pathname === "/reading") {
    if (!selectedBook) {
      return <Navigate to="/books" replace />;
    }
    return (
      <Reading
        student={currentStudent}
        selectedBook={selectedBook}
      />
    );
  }

  // /books
  return (
    <BookSelection
      student={currentStudent}
      onSelect={(book) => {
        selectBook(book);
        navigate(`/reading?book=${encodeURIComponent(book.id)}`);
      }}
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ReadingFlowProvider>
            <Navbar />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/welcome" element={<Navigate to="/" replace />} />
              <Route path="/login" element={<StudentFlow />} />
              <Route path="/books" element={<StudentFlow />} />
              <Route path="/reading" element={<StudentFlow />} />
              <Route path="/interests" element={<Interests />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ReadingFlowProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
