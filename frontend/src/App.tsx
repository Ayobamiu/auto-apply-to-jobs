import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { clearToken, isLoggedIn, setOnUnauthorized } from "./api";
import { Auth } from "./components/Auth";
import { Chat } from "./components/Chat";
import { AppShell } from "./components/AppShell";
import { DiscoverListPage } from "./components/DiscoverListPage";
import { DiscoverJobDetailPage } from "./components/DiscoverJobDetailPage";
import { MyJobsPage } from "./components/MyJobsPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { FloatingProgress } from "./components/onboarding/FloatingProgress";

function AppRoutes({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/discover" replace />} />

      {/* Shell-wrapped pages */}
      <Route
        path="/discover"
        element={
          <AppShell onLogout={onLogout}>
            <DiscoverListPage />
          </AppShell>
        }
      />
      <Route
        path="/discover/job/:jobRef"
        element={
          <AppShell onLogout={onLogout}>
            <DiscoverJobDetailPage />
          </AppShell>
        }
      />
      <Route
        path="/jobs"
        element={
          <AppShell onLogout={onLogout}>
            <MyJobsPage />
          </AppShell>
        }
      />
      <Route
        path="/settings/*"
        element={
          <AppShell onLogout={onLogout}>
            <SettingsPage />
          </AppShell>
        }
      />
      <Route
        path="/settings"
        element={<Navigate to="/settings/profile" replace />}
      />

      {/* Chat (standalone layout, no shell) */}
      <Route
        path="/chat"
        element={
          <Chat
            onLogout={onLogout}
            onNavigateToDiscover={() => navigate("/discover")}
          />
        }
      />

      <Route path="*" element={<Navigate to="/discover" replace />} />
    </Routes>
  );
}

export function App() {
  const [showChat, setShowChat] = useState(isLoggedIn());

  useEffect(() => {
    setOnUnauthorized(() => {
      clearToken();
      setShowChat(false);
    });
  }, []);

  if (!showChat) {
    return <Auth onSuccess={() => setShowChat(true)} />;
  }

  return (
    <BrowserRouter>
      <AppRoutes
        onLogout={() => {
          clearToken();
          setShowChat(false);
        }}
      />
      <FloatingProgress />
    </BrowserRouter>
  );
}
