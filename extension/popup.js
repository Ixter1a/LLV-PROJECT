function settingsUrl(current) {
  try {
    var next = new URL(current || "https://funpay.com/");
    next.hash = "llv-settings";
    return next.href;
  } catch (error) {
    return "https://funpay.com/#llv-settings";
  }
}

function openFunPaySettings() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs.query({ url: "https://funpay.com/*" }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab) {
      chrome.tabs.create({ url: "https://funpay.com/#llv-settings" });
      window.close();
      return;
    }
    chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId && chrome.windows && chrome.windows.update) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
    chrome.tabs.sendMessage(tab.id, { type: "openSettings" }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        chrome.tabs.update(tab.id, { url: settingsUrl(tab.url) });
      }
      window.close();
    });
  });
}

openFunPaySettings();
