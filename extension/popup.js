function openApp() {
  var url = chrome.runtime.getURL("app.html");
  // Без «*» в конце Chrome не находит вкладку по полному адресу и открывает
  // страницу заново при каждом нажатии на значок.
  chrome.tabs.query({ url: url + "*" }, function (tabs) {
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
