async function updateStatus() {
  const appDot = document.getElementById('app-dot');
  const appText = document.getElementById('app-text');
  const hsDot = document.getElementById('hs-dot');
  const hsText = document.getElementById('hs-text');

  // 1. Check App Connection (Localhost Tab)
  const tabs = await chrome.tabs.query({ url: "http://localhost/*" });

  if (tabs.length > 0) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getToken" }, (response) => {
      if (response && response.token) {
        appDot.className = 'status-dot active';
        appText.innerText = 'Connected to App';
      } else {
        appDot.className = 'status-dot error';
        appText.innerText = 'Logged out of App';
      }
    });
  } else {
    appDot.className = 'status-dot error';
    appText.innerText = 'App Tab Not Open';
  }

  // 2. Check Handshake Sync Status (From Background Badge)
  chrome.action.getBadgeText({}, (text) => {
    if (text === "ON") {
      hsDot.className = 'status-dot active';
      hsText.innerText = 'Handshake: Synced';
    } else if (text === "ERR") {
      hsDot.className = 'status-dot error';
      hsText.innerText = 'Handshake: Sync Error';
    } else {
      hsDot.className = 'status-dot';
      hsText.innerText = 'Handshake: Not Synced';
    }
  });
}

// Run immediately
updateStatus();