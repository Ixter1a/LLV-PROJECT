(function () {
  if (window.__LLV_SHIFT_OVERLAY__) return;
  window.__LLV_SHIFT_OVERLAY__ = true;

  var parser = window.LLVParser;
  var root;
  var button;
  var nameInput;
  var statusNode;
  var state = { shift: null, configured: false, pending: 0 };
  var baseline = new Set();
  var baselineShiftId = null;
  var localSeen = new Set();
  var inflight = new Set();
  var scanTimer = null;
  var observer = null;
  var lastSaleKey = null;

  function readAccountName() {
    var header = document.querySelector("header, .navbar, #header");
    var selectors = [
      ".user-link-name",
      "a.user-link-name",
      ".media-user-name"
    ];
    var scopes = header ? [header, document] : [document];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var i = 0; i < selectors.length; i += 1) {
        var node = scopes[s].querySelector(selectors[i]);
        if (!node || node.closest("#llv-shift-root")) continue;
        var name = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (name && name.length <= 64) return name;
      }
    }
    return "";
  }

  function visibleText(node) {
    return (node.innerText || node.textContent || "").replace(/[\u00a0\u202f]/g, " ");
  }

  function hrefsOf(node) {
    var links = [];
    if (node.matches && node.matches("a[href]")) links.push(node.getAttribute("href"));
    if (node.querySelectorAll) {
      node.querySelectorAll("a[href*='/orders/']").forEach(function (link) {
        links.push(link.getAttribute("href"));
      });
    }
    if (/\/orders\/[A-Za-z0-9_-]{4,}/.test(location.pathname)) links.push(location.pathname);
    return links;
  }

  function rowText(node) {
    var price = node.querySelector && node.querySelector(".tc-price");
    var status = node.querySelector && node.querySelector(".tc-status");
    if (price && status) {
      return [".tc-date", ".tc-date-time", ".tc-order", ".tc-desc", ".tc-price", ".tc-status"].map(function (selector) {
        var part = node.querySelector(selector);
        return part ? visibleText(part) : "";
      }).filter(Boolean).join("\n");
    }
    return visibleText(node);
  }

  function detailText() {
    var statusNode = null;
    document.querySelectorAll(".tc-status, .order-status").forEach(function (node) {
      if (statusNode || (node.closest && node.closest("#llv-shift-root"))) return;
      var text = visibleText(node);
      if (text.length < 80 && parser.isCompleted(text)) statusNode = node;
    });
    if (!statusNode) return "";
    var parent = statusNode;
    for (var depth = 0; depth < 8 && parent; depth += 1) {
      parent = parent.parentElement;
      if (!parent || (parent.closest && parent.id === "llv-shift-root")) break;
      var text = visibleText(parent);
      if (text.length > 1800) break;
      if (parser.parseRub(text) !== null) return text;
    }
    return "";
  }

  function findOrders() {
    var now = new Date();
    var orders = [];
    var seen = {};
    function add(text, hrefs) {
      if (!text || text.length > 4000) return;
      var order = parser.inspectBlock(text, hrefs, now);
      if (!order || seen[order.sourceKey]) return;
      seen[order.sourceKey] = true;
      orders.push(order);
    }
    document.querySelectorAll("a.tc-item, a[href*='/orders/']").forEach(function (link) {
      if (link.closest && link.closest("#llv-shift-root")) return;
      var href = link.getAttribute("href") || "";
      if (!/\/orders\/[A-Za-z0-9_-]{4,}/.test(href)) return;
      add(rowText(link), hrefsOf(link));
    });
    if (/\/orders\/[A-Za-z0-9_-]{4,}/.test(location.pathname)) {
      add(detailText(), [location.pathname]);
    }
    return orders;
  }

  function formatRub(value) {
    var number = Number(value) || 0;
    var digits = Math.round(Math.abs(number) * 100) % 100 === 0 ? 0 : 2;
    var formatted = new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
    return formatted + "\u00a0₽";
  }

  function netOf(amount) {
    return Math.round(Math.round(Number(amount) * 100) * 0.1) / 100;
  }

  function paint() {
    var active = !!(state.shift && state.shift.active);
    root.classList.toggle("is-active", active);
    button.textContent = active ? "Завершить смену" : "Начать смену";
    if (!active) root.classList.remove("show-name");
    var parts = [];
    if (active) {
      parts.push(state.shift.workerName);
      parts.push((state.shift.salesCount || 0) + " шт");
      parts.push(formatRub(state.shift.salesRub || 0));
      parts.push("прибыль " + formatRub(netOf(state.shift.salesRub || 0)));
    } else if (state.shift && state.shift.endedAt) {
      parts.push("Смена завершена");
    } else {
      var known = readAccountName();
      parts.push(known ? known : "Имя аккаунта не видно — укажите его");
    }
    if (!state.configured) {
      parts.push(state.pending
        ? "В очереди " + state.pending + ", не отправлено"
        : "Ключи Supabase не заданы, события останутся на этом компьютере");
    } else if (state.pending) {
      parts.push("В очереди " + state.pending + ", ещё не отправлено");
    }
    if (state.lastError) parts.push(state.lastError);
    statusNode.textContent = parts.join(" · ");
  }

  function rememberBaseline(shiftId) {
    if (baselineShiftId === shiftId) return;
    baseline = new Set();
    baselineShiftId = shiftId;
    var start = new Date(state.shift.startedAt).getTime() - 60000;
    findOrders().forEach(function (order) {
      var sold = order.soldAt ? new Date(order.soldAt).getTime() : null;
      if (sold === null || sold < start) baseline.add(order.sourceKey);
    });
  }

  function scan() {
    if (!state.shift || !state.shift.active) return;
    rememberBaseline(state.shift.shiftId);
    var start = new Date(state.shift.startedAt).getTime() - 60000;
    findOrders().forEach(function (order) {
      if (baseline.has(order.sourceKey) || localSeen.has(order.sourceKey) || inflight.has(order.sourceKey)) return;
      if (order.soldAt && new Date(order.soldAt).getTime() < start) return;
      inflight.add(order.sourceKey);
      chrome.runtime.sendMessage({ type: "sale", sale: order }, function (next) {
        inflight.delete(order.sourceKey);
        if (chrome.runtime.lastError || !next || next.ok === false) return;
        localSeen.add(order.sourceKey);
        var changed = lastSaleKey !== order.sourceKey;
        applyState(next);
        if (changed) {
          lastSaleKey = order.sourceKey;
          statusNode.classList.remove("flash");
          void statusNode.offsetWidth;
          statusNode.classList.add("flash");
        }
      });
    });
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }

  function watch() {
    if (observer || !state.shift || !state.shift.active || !document.body) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleScan();
  }

  function applyState(next) {
    if (!next) return;
    state = next;
    var still = state.shift && state.shift.active;
    if (!still && observer) {
      observer.disconnect();
      observer = null;
      baselineShiftId = null;
    }
    paint();
    if (still) watch();
  }

  function mount() {
    root = document.createElement("div");
    root.id = "llv-shift-root";
    root.innerHTML =
      '<div class="llv-panel">' +
        '<div class="llv-head">' +
          '<div class="llv-mark">' +
            '<img alt="" width="42" height="42" />' +
            '<span class="llv-fallback" aria-hidden="true"></span>' +
          '</div>' +
          '<div class="llv-title">LLV</div>' +
          '<button class="llv-link llv-hide" type="button">Скрыть</button>' +
        '</div>' +
        '<div class="llv-body">' +
          '<input class="llv-name" type="text" maxlength="64" placeholder="Имя на FunPay" autocomplete="off" />' +
          '<button class="llv-btn llv-shift" type="button">Начать смену</button>' +
          '<div class="llv-status"></div>' +
          '<div class="llv-commands"></div>' +
          '<div class="llv-work" hidden></div>' +
        '</div>' +
      '</div>' +
      '<button class="llv-tab" type="button" hidden>LLV</button>';
    document.documentElement.appendChild(root);
    var image = root.querySelector("img");
    image.src = chrome.runtime.getURL("icons/icon.png");
    image.addEventListener("error", function () {
      root.querySelector(".llv-mark").classList.add("use-fallback");
    });
    button = root.querySelector(".llv-shift");
    nameInput = root.querySelector(".llv-name");
    statusNode = root.querySelector(".llv-status");
    button.addEventListener("click", onClick);
    root.querySelector(".llv-hide").addEventListener("click", function () {
      root.classList.add("is-collapsed");
      root.querySelector(".llv-tab").hidden = false;
    });
    root.querySelector(".llv-tab").addEventListener("click", function () {
      root.classList.remove("is-collapsed");
      root.querySelector(".llv-tab").hidden = true;
    });
    nameInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") onClick();
    });
    paint();
    if (window.LLVLotsUI) window.LLVLotsUI.attach(root);
  }

  function onClick() {
    var active = state.shift && state.shift.active;
    if (active) {
      chrome.runtime.sendMessage({ type: "endShift" }, applyState);
      return;
    }
    var name = readAccountName();
    if (!name) {
      root.classList.add("show-name");
      name = nameInput.value.trim();
      if (!name) {
        statusNode.textContent = "Введите имя аккаунта FunPay";
        nameInput.focus();
        return;
      }
    }
    chrome.runtime.sendMessage({ type: "startShift", name: name }, function (next) {
      applyState(next);
      watch();
    });
  }

  mount();
  chrome.runtime.sendMessage({ type: "getState" }, function (next) {
    if (chrome.runtime.lastError) return;
    applyState(next);
  });
  chrome.storage.onChanged.addListener(function () {
    chrome.runtime.sendMessage({ type: "getState" }, function (next) {
      if (!chrome.runtime.lastError) applyState(next);
    });
  });
})();
