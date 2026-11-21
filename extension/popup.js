function openApp() {
  var url = chrome.runtime.getURL("app.html");
  chrome.tabs.query({ url: url }, function (tabs) {
    var tab = tabs && tabs[0];
    if (tab) {
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId && chrome.windows && chrome.windows.update) chrome.windows.update(tab.windowId, { focused: true });
      window.close();
      return;
    }
    chrome.tabs.create({ url: url });
    window.close();
  });
}

openApp();
