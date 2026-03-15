const API_BASE = 'https://auto-apply-to-jobs-production-a171.up.railway.app';
const APP_MATCH = "http://localhost/*";
const HANDSHAKE_MATCH = ".joinhandshake.com";

// Trigger sync when Handshake tabs are updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes(HANDSHAKE_MATCH)) {
    handleAutoSync(tabId, tab.url);
  }
});

async function getAppToken() {
  const tabs = await chrome.tabs.query({ url: APP_MATCH });
  if (tabs.length === 0) return null;

  try {
    // Ensure content script is injected
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    }).catch(() => { }); // Ignore error if already injected

    const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "getToken" });
    return response?.token;
  } catch (err) {
    console.error("Token retrieval failed:", err);
    return null;
  }
}

async function handleAutoSync(tabId, tabUrl) {
  const hostname = new URL(tabUrl).hostname;
  const storageKey = `last_sync_${hostname}`;

  // 1. Check persistence to prevent spamming (30-minute cooldown)
  const data = await chrome.storage.local.get([storageKey]);
  if (data[storageKey] && Date.now() - data[storageKey] < 30 * 60 * 1000) {
    console.log(`Skipping sync for ${hostname}: Recently synced.`);
    chrome.action.setBadgeText({ text: "ON" });
    return;
  }

  // 2. Get identity from localhost
  const token = await getAppToken();
  if (!token) {
    chrome.action.setBadgeText({ text: "AUTH" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    return;
  }

  // 3. Capture Cookies
  const allCookies = await chrome.cookies.getAll({});
  const sessionCookies = allCookies.filter(c =>
    c.domain.includes("joinhandshake.com") || hostname.includes(c.domain.replace(/^\./, ''))
  );

  // 4. Upload
  try {
    const response = await fetch(`${API_BASE}/handshake/session/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ cookies: sessionCookies, originUrl: tabUrl })
    });
    if (response.ok) {
      // 5. Update persistence and UI
      await chrome.storage.local.set({ [`last_sync_${hostname}`]: Date.now() });
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: "ERR" });
  }
}