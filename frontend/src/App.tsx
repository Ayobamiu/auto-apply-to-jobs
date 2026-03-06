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
import { DiscoverListPage } from "./components/DiscoverListPage";
import { DiscoverJobDetailPage } from "./components/DiscoverJobDetailPage";

function ChatRoute({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  return (
    <Chat
      onLogout={onLogout}
      onNavigateToDiscover={() => navigate("/discover")}
    />
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
      <Routes>
        <Route path="/" element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<DiscoverListPage />} />
        <Route
          path="/discover/job/:jobRef"
          element={<DiscoverJobDetailPage />}
        />
        <Route
          path="/chat"
          element={
            <ChatRoute
              onLogout={() => {
                clearToken();
                setShowChat(false);
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
