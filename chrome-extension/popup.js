(function () {
  const DEFAULT_API = 'http://localhost:3000';
  const STORAGE_KEY = 'handshake-extension-apiBase';

  const apiBaseEl = document.getElementById('apiBase');
  const tokenEl = document.getElementById('token');
  const sendBtn = document.getElementById('send');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get([STORAGE_KEY], function (result) {
    apiBaseEl.value = result[STORAGE_KEY] || DEFAULT_API;
  });

  apiBaseEl.addEventListener('change', function () {
    chrome.storage.local.set({ [STORAGE_KEY]: apiBaseEl.value || DEFAULT_API });
  });

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = type || '';
  }

  sendBtn.addEventListener('click', function () {
    const apiBase = (apiBaseEl.value || DEFAULT_API).replace(/\/$/, '');
    const token = (tokenEl.value || '').trim();
    if (!token) {
      setStatus('Enter a JWT token.', 'error');
      return;
    }
    setStatus('Sending…');
    sendBtn.disabled = true;

    chrome.runtime.sendMessage(
      { action: 'uploadSession', apiBase, token },
      function (response) {
        sendBtn.disabled = false;
        if (chrome.runtime.lastError) {
          setStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response && response.ok) {
          setStatus('Session sent.', 'success');
        } else {
          const msg = (response && response.error) || 'Request failed';
          setStatus(msg, 'error');
        }
      }
    );
  });
})();
