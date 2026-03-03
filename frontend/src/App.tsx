import { useEffect, useState } from 'react';
import { clearToken, isLoggedIn, setOnUnauthorized } from './api';
import { Auth } from './components/Auth';
import { Chat } from './components/Chat';

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

  return <Chat onLogout={() => { clearToken(); setShowChat(false); }} />;
}
