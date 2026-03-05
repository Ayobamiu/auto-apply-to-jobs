import { useEffect, useState } from 'react';
import { clearToken, isLoggedIn, setOnUnauthorized } from './api';
import { Auth } from './components/Auth';
import { Chat } from './components/Chat';
import { DiscoverJobsPage } from './components/DiscoverJobsPage';

type MainView = 'chat' | 'discover';

export function App() {
  const [showChat, setShowChat] = useState(isLoggedIn());
  const [view, setView] = useState<MainView>('chat');

  useEffect(() => {
    setOnUnauthorized(() => {
      clearToken();
      setShowChat(false);
    });
  }, []);

  if (!showChat) {
    return <Auth onSuccess={() => setShowChat(true)} />;
  }

  if (view === 'discover') {
    return <DiscoverJobsPage onBackToChat={() => setView('chat')} />;
  }

  return (
    <Chat
      onNavigateToDiscover={() => setView('discover')}
      onLogout={() => {
        clearToken();
        setShowChat(false);
      }}
    />
  );
}
