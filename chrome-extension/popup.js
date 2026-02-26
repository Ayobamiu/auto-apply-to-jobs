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

  function setStatus(text, type, linkUrl) {
    statusEl.textContent = '';
    statusEl.className = type || '';
    statusEl.appendChild(document.createTextNode(text));
    if (linkUrl) {
      statusEl.appendChild(document.createElement('br'));
      const link = document.createElement('a');
      link.href = linkUrl;
      link.textContent = 'Open app';
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.display = 'inline-block';
      link.style.marginTop = '8px';
      link.style.color = '#2563eb';
      statusEl.appendChild(link);
    }
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
          setStatus('Handshake connected! Open the app to continue.', 'success', apiBase + '/?session=uploaded');
        } else {
          const msg = (response && response.error) || 'Request failed';
          setStatus(msg, 'error');
        }
      }
    );
  });
})();
