import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./lib/session";
import { useTheme } from "./lib/theme";
import { Shell } from "./components/Shell";
import { SignIn } from "./pages/SignIn";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { StartInterview } from "./pages/StartInterview";
import { InterviewSession } from "./pages/InterviewSession";
import { Library } from "./pages/Library";
import { TypeEditor } from "./pages/TypeEditor";
import { History } from "./pages/History";
import { InterviewReview } from "./pages/InterviewReview";
import { Settings } from "./pages/Settings";

export function App() {
  const { user, loading } = useSession();

  // Applied here so the theme is right on the sign-in screen too.
  useTheme();

  if (loading) {
    return (
      <div className="auth-screen">
        <p className="muted">Loading</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/interview/new" element={<StartInterview />} />
        <Route path="/interview/:id" element={<InterviewSession />} />
        <Route path="/interview/:id/review" element={<InterviewReview />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/new" element={<TypeEditor />} />
        <Route path="/library/:id" element={<TypeEditor />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
