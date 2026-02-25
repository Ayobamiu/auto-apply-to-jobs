const HANDSHAKE_ORIGINS = [
  'https://app.joinhandshake.com',
  'https://wmich.joinhandshake.com'
];

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (message.action !== 'uploadSession') {
    sendResponse({ ok: false, error: 'Unknown action' });
    return;
  }
  const { apiBase, token } = message;
  if (!apiBase || !token) {
    sendResponse({ ok: false, error: 'Missing apiBase or token' });
    return;
  }

  (async function () {
    const allCookies = [];
    for (const origin of HANDSHAKE_ORIGINS) {
      const list = await chrome.cookies.getAll({ url: origin });
      allCookies.push(...list);
    }
    const url = apiBase.replace(/\/$/, '') + '/handshake/session/upload';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ cookies: allCookies })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      sendResponse({ ok: false, error: data.error || res.statusText || 'Request failed' });
      return;
    }
    sendResponse({ ok: true, ...data });
  })().catch(function (err) {
    sendResponse({ ok: false, error: err.message || 'Failed to upload' });
  });

  return true;
});
