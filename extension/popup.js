var urlInput = document.getElementById("url");
var keyInput = document.getElementById("key");
var statusNode = document.getElementById("status");
var image = document.querySelector(".mark img");

image.addEventListener("error", function () {
  document.querySelector(".mark").classList.add("use-fallback");
});

function describe(state) {
  if (!state || state.ok === false) return state && state.error ? state.error : "Не удалось прочитать состояние";
  var parts = [];
  if (state.shift && state.shift.active) {
    parts.push("Смена идёт: " + state.shift.workerName);
  } else {
    parts.push("Активной смены нет");
  }
  if (!state.configured) {
    parts.push(state.pending
      ? "В очереди " + state.pending + " — не отправлено, ключи пустые"
      : "Ключи не заданы, события будут копиться локально");
  } else if (state.pending) {
    parts.push("В очереди " + state.pending + ", ещё не отправлено");
  } else {
    parts.push("Очередь пустая");
  }
  if (state.lastError) parts.push(state.lastError);
  return parts.join(". ") + ".";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "getState" }, function (state) {
    statusNode.textContent = describe(state);
  });
  chrome.storage.local.get("settings", function (data) {
    var settings = data.settings || {};
    if (document.activeElement !== urlInput) urlInput.value = settings.url || "";
    if (document.activeElement !== keyInput) keyInput.value = settings.key || "";
  });
}

function ensureHost(url) {
  var clean = String(url || "").trim();
  if (!/^https:\/\//i.test(clean) || !chrome.permissions || !chrome.permissions.request) {
    return Promise.resolve();
  }
  var origin;
  try {
    origin = new URL(clean).origin + "/*";
  } catch (error) {
    return Promise.resolve();
  }
  return chrome.permissions.contains({ origins: [origin] }).then(function (has) {
    if (has) return;
    return chrome.permissions.request({ origins: [origin] });
  }).catch(function () {
    return null;
  });
}

document.getElementById("save").addEventListener("click", function () {
  ensureHost(urlInput.value).then(function () {
    chrome.runtime.sendMessage({
      type: "saveSettings",
      url: urlInput.value,
      key: keyInput.value
    }, function (state) {
      statusNode.textContent = describe(state);
    });
  });
});

document.getElementById("flush").addEventListener("click", function () {
  ensureHost(urlInput.value).then(function () {
    chrome.runtime.sendMessage({ type: "flush" }, function (state) {
      statusNode.textContent = describe(state);
    });
  });
});

refresh();
