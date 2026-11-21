(function (root) {
  var KEY = "llvSeller";

  var REVIEWS = { "1": "", "2": "", "3": "", "4": "", "5": "" };

  function defaults() {
    return {
      autoRaise: false,
      raiseMinutes: 30,
      raiseNotice: true,
      raiseBackground: true,
      quietOn: false,
      quietFrom: "23",
      quietTo: "8",
      highlight: false,
      promo: false,
      showPromo: false,
      commission: "",
      realPrice: false,
      exactOn: true,
      showCard: true,
      costs: {},
      currencies: {},
      quick: [],
      emoji: true,
      welcomeOn: false,
      welcome: "",
      welcomeTimeout: 24,
      autoSend: false,
      keywordsOn: false,
      keywords: [],
      thanksOn: false,
      thanks: "",
      reviews: Object.assign({}, REVIEWS),
      reviewsAuto: false,
      reviewAi: false,
      aiBase: "https://api.openai.com/v1",
      aiModel: "gpt-4o-mini",
      aiKey: "",
      tranBase: "https://libretranslate.com",
      tranKey: "",
      salesStats: true,
      salesExport: true,
      unpaidCopy: true,
      salesSupport: true,
      purchasesStats: true,
      purchasesExport: true,
      hideBalance: false,
      financeStats: true,
      theme: "light",
      background: "",
      backgroundVideo: "",
      glass: false,
      randomTheme: false,
      privacy: false,
      hideNickStyles: false,
      hideNotificationSound: false,
      notifyOrder: true,
      noticeSound: "",
      sound: "",
      dark: false
    };
  }

  var settings = null;
  var queue = [];

  function clean(value) {
    var base = defaults();
    var next = Object.assign(base, value || {});
    next.reviews = Object.assign({}, REVIEWS, (value && value.reviews) || {});
    next.costs = (value && value.costs) || {};
    next.currencies = (value && value.currencies) || {};
    next.quick = (value && value.quick) || [];
    next.keywords = (value && value.keywords) || [];
    if (value && value.showCard === undefined) next.showCard = true;
    if (value && value.exactOn === undefined) next.exactOn = true;
    if (value && value.theme === undefined) next.theme = value.dark ? "dark" : "light";
    next.dark = next.theme === "dark" || next.theme === "midnight";
    return next;
  }

  function current() {
    if (!settings) return clean(null);
    return settings;
  }

  // Настройки записаны другим окном (например, страницей LLV): принимаем их
  // без обратной записи в storage. Если здесь есть незаписанные правки, они
  // идут сверху: иначе запоздавший ответ storage откатил бы только что
  // сохранённое значение и следующая правка затёрла бы его своим снимком.
  function reload(value) {
    var fresh = clean(value);
    settings = queue.length ? Object.assign({}, fresh, settings) : fresh;
    loaded = true;
    emit(settings);
    return settings;
  }

  function storage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.local;
  }

  function flushWrite() {
    if (!queue.length) return;
    var payload = {};
    payload[KEY] = settings;
    queue = [];
    var local = storage();
    if (local && local.set) local.set(payload);
  }

  var writeTimer = null;

  function save() {
    queue.push(1);
    if (writeTimer) return;
    writeTimer = setTimeout(function () {
      writeTimer = null;
      flushWrite();
    }, 250);
  }

  function saveNow() {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    queue.push(1);
    flushWrite();
  }

  function patch(changes) {
    settings = Object.assign({}, current(), changes || {});
    save();
    return settings;
  }

  var listeners = [];

  function on(handler) {
    listeners.push(handler);
    return function () {
      listeners = listeners.filter(function (item) { return item !== handler; });
    };
  }

  function emit(next) {
    listeners.forEach(function (handler) {
      try { handler(next); } catch (error) { /* модуль упал, остальные должны продолжить */ }
    });
    try { document.dispatchEvent(new CustomEvent("llv-settings")); } catch (error) { /* страница может запретить */ }
  }

  var loading = false;
  var loaded = false;
  var waiting = [];

  function load(done) {
    if (loaded) {
      if (done) done(settings);
      return;
    }
    waiting.push(done);
    if (loading) return;
    loading = true;
    var local = storage();
    function finish(value) {
      loading = false;
      var merged = clean(value);
      if (settings) merged = Object.assign({}, merged, settings);
      settings = merged;
      loaded = true;
      var list = waiting;
      waiting = [];
      list.forEach(function (fn) { if (fn) fn(settings); });
    }
    if (!local || !local.get) {
      finish(null);
      return;
    }
    local.get(KEY, function (data) {
      finish(data && data[KEY]);
    });
  }

  function watch() {
    var local = storage();
    if (!local || !local.onChanged || local.__llvWatched) return;
    local.__llvWatched = true;
    local.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[KEY]) return;
      // Во время отложенной записи сюда приходят и наши же правки: заменять
      // ими снимок нельзя, в нём уже есть более свежие значения (см. reload).
      if (writeTimer) return;
      reload(changes[KEY].newValue);
    });
  }

  function feeRate() {
    var value = Number(String(current().commission).replace(",", "."));
    if (!isFinite(value) || value <= 0 || value >= 100) return 0;
    return value;
  }

  function money(value) {
    var number = Math.round(Number(value) * 100) / 100;
    if (!isFinite(number)) return "—";
    return String(number).replace(".", ",");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function clip(text, limit) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    var max = limit || 120;
    return value.length > max ? value.slice(0, max) + "…" : value;
  }

  function visibleText(node) {
    return ((node && (node.innerText || node.textContent)) || "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function slot() {
    return document.querySelector("#llv-shift-root .llv-panel") ||
      document.querySelector("main, #content, .container") ||
      document.body;
  }

  function toast(text) {
    if (!text) return;
    var node = document.createElement("p");
    node.className = "llv-toast";
    node.textContent = text;
    var card = document.querySelector("#llv-shift-root .llv-panel");
    (card || slot()).appendChild(node);
    setTimeout(function () { node.remove(); }, 3500);
  }

  function copyText(text) {
    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        toast("Скопировано");
      } catch (error) {
        toast("Не удалось скопировать");
      }
      area.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Скопировано"); }, fallback);
      return;
    }
    fallback();
  }

  function downloadBlob(name, blob) {
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
  }

  function download(name, content, type) {
    downloadBlob(name, new Blob([content], { type: type || "application/json" }));
  }

  function readFile(file, limit, asText, done) {
    if (!file) return;
    if (limit && file.size > limit) {
      toast("Файл больше допустимого");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      done(asText ? String(reader.result || "") : String(reader.result || ""), file);
    };
    if (asText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  }

  function once(key) {
    var bag = {};
    try { bag = JSON.parse(sessionStorage.getItem("llvOnce") || "{}"); } catch (error) { bag = {}; }
    if (bag[key]) return false;
    bag[key] = 1;
    sessionStorage.setItem("llvOnce", JSON.stringify(bag));
    return true;
  }

  function forget(key) {    var bag = {};
    try { bag = JSON.parse(sessionStorage.getItem("llvOnce") || "{}"); } catch (error) { bag = {}; }
    if (!bag[key]) return;
    delete bag[key];
    sessionStorage.setItem("llvOnce", JSON.stringify(bag));
  }

  function hash(text) {
    var value = String(text || "");
    var h = 5381;
    for (var i = 0; i < value.length; i += 1) {
      h = ((h << 5) + h + value.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  function today(offsetDays) {
    var date = new Date();
    if (offsetDays) date.setDate(date.getDate() + offsetDays);
    return date;
  }

  function stamp(date) {
    var value = date || new Date();
    function pad(part) { return part < 10 ? "0" + part : String(part); }
    return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
  }

  function formField(area, text) {
    var start = area.selectionStart == null ? area.value.length : area.selectionStart;
    var end = area.selectionEnd == null ? start : area.selectionEnd;
    area.value = area.value.slice(0, start) + text + area.value.slice(end);
    area.selectionStart = area.selectionEnd = start + text.length;
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function submitChat(area) {
    var form = area && area.closest && area.closest("form");
    var button = form && form.querySelector("button[type='submit'], button[name='send'], .chat-form-button, button");
    if (button && !/куп/i.test(button.textContent || "")) {
      button.click();
      return true;
    }
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    var enter = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
    area.dispatchEvent(enter);
    return false;
  }

  function when(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return "";
    var pad = function (part) { return part < 10 ? "0" + part : String(part); };
    return pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear() + " " +
      pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function applyTheme() {
    var theme = root.LLVThemes;
    if (!theme) return;
    if (!document.documentElement) return;
    var all = theme.list();
    all.forEach(function (name) {
      document.documentElement.classList.remove("llv-theme-" + name);
      document.documentElement.removeAttribute("data-llv-theme-" + name);
    });
    if (!settings) {
      if (root.LLV && root.LLV.load) root.LLV.load(function () { applyTheme(); });
      return;
    }
    var name = theme.resolve(current());
    document.documentElement.classList.add("llv-themed");
    document.documentElement.classList.toggle("llv-show-promo", !!current().showPromo);
    if (name && name !== "light" && name !== "mono") {
      document.documentElement.classList.add("llv-theme-" + name);
      document.documentElement.style.setProperty("--llv-accent", theme.accent(name));
    } else {
      document.documentElement.style.removeProperty("--llv-accent");
    }
    theme.paintBackground(current());
  }

  root.LLV = {
    KEY: KEY,
    defaults: defaults,
    clean: clean,
    current: current,
    reload: reload,
    patch: patch,
    save: save,
    saveNow: saveNow,
    load: load,
    watch: watch,
    on: on,
    emit: emit,
    feeRate: feeRate,
    money: money,
    escapeHtml: escapeHtml,
    clip: clip,
    visibleText: visibleText,
    slot: slot,
    toast: toast,
    copyText: copyText,
    download: download,
    downloadBlob: downloadBlob,
    readFile: readFile,
    once: once,
    forget: forget,
    hash: hash,
    today: today,
    stamp: stamp,
    formField: formField,
    submitChat: submitChat,
    when: when,
    applyTheme: applyTheme
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
