chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getToken") {
        const token = localStorage.getItem('token'); // or your specific key name
        sendResponse({ token: token });
    }
});