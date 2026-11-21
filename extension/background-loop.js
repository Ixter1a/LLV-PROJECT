(function (root) {
  // Вспомогательный слой на странице: разовый подъём по кнопке, звуки и
  // автоответы. Расписание автоподнятия живёт в service worker (background.js),
  // иначе таймеры в двух местах поднимали бы лоты дважды.

  var workerKey = "background";
  var work = { busy: false };

  function current() {
    return root.LLV ? root.LLV.current() : {};
  }

  function tabId() {
    try {
      if (root.chrome && chrome.runtime && chrome.runtime.id) return "page:" + location.href;
    } catch (error) { /* не расширение */ }
    return "";
  }

  function isDisabled() {
    return !tabId();
  }

  function send(type, payload) {
    return new Promise(function (resolve) {
      if (isDisabled()) { resolve({ ok: false, error: "Приватный режим: фон выключен" }); return; }
      try {
        chrome.runtime.sendMessage(Object.assign({ type: type, tab: tabId() }, payload || {}), function (reply) {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: "Нет связи с расширением" }); return; }
          resolve(reply || { ok: false, error: "Пустой ответ" });
        });
      } catch (error) {
        resolve({ ok: false, error: "Нет связи с расширением" });
      }
    });
  }

  function quiet() {
    var config = current();
    if (!config.quietOn) return false;
    return root.LLVLots.withinHours(new Date().getHours(), config.quietFrom, config.quietTo);
  }

  function claim() {
    if (work.busy) return null;
    if (isDisabled()) return null;
    work.busy = true;
    return function () { work.busy = false; };
  }

  async function raise() {
    var release = claim();
    if (!release) return null;
    try {
      var target = root.LLVLots.raiseTarget(document, location);
      if (!target) return { ok: true, skipped: true, error: "На этой странице нет кнопки раздела" };
      var result = await send("raise", {
        gameId: target.gameId,
        nodeId: target.nodeId,
        path: root.LLVLots.raiseRequestPath(document)
      });
      if (result && result.ok) {
        if (current().raiseNotice) root.LLV.toast(result.message || "Раздел: поднято");
        try { document.dispatchEvent(new CustomEvent("llv-raised")); } catch (error) { /* страница может запретить */ }
      } else if (current().raiseNotice) {
        root.LLV.toast(result.error || "Не удалось поднять");
      }
      return result;
    } catch (error) {
      return { ok: false, error: error.message || "Ошибка поднятия" };
    } finally {
      release();
    }
  }

  function loop(settings) {
    settings = settings || current();
    if (!(settings.welcomeOn || settings.keywordsOn || settings.thanksOn)) return;
    if (root.LLVChat && root.LLVChat.tick) root.LLVChat.tick();
  }

  function start() {
    if (root.LLV && root.LLV.load) {
      root.LLV.load(function (settings) { loop(settings); });
    } else {
      loop();
    }
  }

  root.LLVBackground = {
    raise: raise,
    start: start,
    loop: loop,
    quiet: quiet,
    tabId: tabId
  };

  var cache = {};

  function play(url) {
    if (!url) return;
    try {
      var audio = cache[url];
      if (!audio) {
        audio = new Audio(url);
        audio.volume = 0.9;
        audio.preload = "auto";
        cache[url] = audio;
      }
      audio.currentTime = 0;
      var playing = audio.play();
      if (playing && playing.catch) playing.catch(function () { /* браузер требует жест */ });
    } catch (error) { /* старый браузер */ }
  }

  function orderSound() {
    var config = current();
    if (config.notifyOrder === false) return;
    play(config.sound);
  }

  function noticeSound(text) {
    var config = current();
    if (text) root.LLV.toast(text);
    if (config.hideNotificationSound) return;
    play(config.noticeSound);
  }

  document.addEventListener("llv-sale", orderSound);

  root.LLVNotify = {
    play: play,
    orderSound: orderSound,
    noticeSound: noticeSound
  };

  document.addEventListener("llv-settings", function () { loop(); });
})(typeof globalThis !== "undefined" ? globalThis : this);
