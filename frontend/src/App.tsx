import { ReactNode, useEffect, useState } from "react";
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
import { OnboardingProvider } from "./hooks/useOnboarding";
import { PipelineQueueProvider } from "./hooks/usePipelineQueue";
import { PipelineTray } from "./components/PipelineTray";
import { SubscriptionProvider } from "./subscription/useSubscription";
import { HomePage } from "./components/HomePage";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
function AppRoutes({
  onLogout,
  onLoginSuccess,
}: {
  onLogout: () => void;
  onLoginSuccess: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/auth"
        element={
          <Auth
            onSuccess={() => {
              onLoginSuccess();
              navigate("/discover");
            }}
          />
        }
      />
      {/* Shell-wrapped pages */}
      <Route
        path="/discover"
        element={
          <RequireAuth>
            <AppShell onLogout={onLogout}>
              <DiscoverListPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/discover/job/:jobRef"
        element={
          <RequireAuth>
            <AppShell onLogout={onLogout}>
              <DiscoverJobDetailPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/jobs"
        element={
          <RequireAuth>
            <AppShell onLogout={onLogout}>
              <MyJobsPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/*"
        element={
          <RequireAuth>
            <AppShell onLogout={onLogout}>
              <SettingsPage />
            </AppShell>
          </RequireAuth>
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
          <RequireAuth>
            <Chat
              onLogout={onLogout}
              onNavigateToDiscover={() => navigate("/discover")}
            />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  const [isLoggedIn_, setIsLoggedIn] = useState(isLoggedIn());
  useEffect(() => {
    setOnUnauthorized(() => {
      clearToken();
      setIsLoggedIn(false);
    });
  }, []);
  return (
    <BrowserRouter>
      <SubscriptionProvider>
        <PipelineQueueProvider enabled={isLoggedIn_}>
          <OnboardingProvider enabled={isLoggedIn_}>
            <AppRoutes
              onLoginSuccess={() => setIsLoggedIn(true)}
              onLogout={() => {
                clearToken();
                setIsLoggedIn(false);
                window.location.href = "/";
              }}
            />
            {isLoggedIn_ && <FloatingProgress />}
            {isLoggedIn_ && <PipelineTray />}
          </OnboardingProvider>
        </PipelineQueueProvider>
      </SubscriptionProvider>
    </BrowserRouter>
  );
}
