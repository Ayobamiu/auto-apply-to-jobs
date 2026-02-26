import { isLoggedIn, clearToken, setOnUnauthorized } from './api.js';
import { renderAuth } from './auth.js';
import { renderChat } from './chat.js';
import './styles.css';

const app = document.getElementById('app')!;

function showChat(): void {
  renderChat(app, () => {
    clearToken();
    showAuth();
  });
}

function showAuth(): void {
  renderAuth(app, () => {
    showChat();
  });
}

setOnUnauthorized(() => {
  showAuth();
});

if (isLoggedIn()) {
  showChat();
} else {
  showAuth();
}
