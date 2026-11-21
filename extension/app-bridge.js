(function (root) {
  function blobToData(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      var type = "image/png";
      return "data:" + type + ";base64," + btoa(binary);
    });
  }

  function imagesOf(row) {
    if (!row || !row.querySelectorAll) return Promise.resolve([]);
    var urls = [];
    row.querySelectorAll("img[src]").forEach(function (image) {
      var src = image.getAttribute("src") || "";
      if (/^https?:|^\//.test(src) && urls.indexOf(src) === -1) urls.push(src);
    });
    return Promise.all(urls.slice(0, 5).map(function (src) {
      return blobToData(src).catch(function () { return ""; });
    })).then(function (list) {
      return list.filter(Boolean);
    });
  }

  function topbar() {
    var nodes = document.querySelectorAll(".user-link-name, .user-link-name span, .media-user-name");
    var user = "";
    for (var i = 0; i < nodes.length; i += 1) {
      var text = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length <= 64) { user = text; break; }
    }
    var balanceNode = document.querySelector(".badge-balance, .balance-value, .navbar-balance");
    var balance = balanceNode ? (balanceNode.textContent || "").replace(/\s+/g, " ").trim() : "";
    return { user: user, balance: balance };
  }

  function balanceTable() {
    if (!/\/account\/balance/.test(location.pathname)) return [];
    var table = document.querySelector("table");
    if (!table) return [];
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (row) {
      if (row.querySelector("th")) return;
      var cells = Array.prototype.map.call(row.cells, function (cell) {
        return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
      });
      if (cells.length < 2) return;
      var text = row.innerText || row.textContent || "";
      rows.push({ cells: cells, text: text, amounts: text.match(/[+-]?\s?\d[\d\s]*(?:[.,]\d{1,2})?\s*₽/g) || [] });
    });
    return rows;
  }

  function lotsForImport(rows) {
    var form = document.querySelector("form[action*='/lots/'], form.lot-form");
    if (!form) return Promise.resolve({ ok: false, created: 0, error: "Откройте страницу создания лота на FunPay: нужна форма раздела." });
    var source = null;
    for (var i = 0; i < rows.length && !source; i += 1) {
      var found = root.LLVLots.rowById ? root.LLVLots.rowById(document, rows[i].id) : null;
      if (found) source = found;
    }
    var seed = source || document.querySelector(".tc-item[data-offer]");
    var created = 0;
    var pictures = null;
    var chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () {
        var lot = { id: row.id, title: row.title || "", price: row.price || "", currency: row.currency || "₽" };
        if (!pictures) pictures = seed ? imagesOf(seed) : Promise.resolve([]);
        return pictures.then(function (list) {
          lot.images = list;
          return root.LLVLots.cloneLot(lot, location, fetch, "");
        });
      }).then(function (result) {
        if (result && result.ok) created += 1;
      }, function () { /* один лот с ошибкой не останавливает остальные */ });
    });
    return chain.then(function () {
      return { ok: created > 0, created: created, error: created ? "" : "FunPay не принял ни одного лота" };
    });
  }

  function snapshot() {
    var lots = { lots: [], foreign: [] };
    try { lots = root.LLVLots.collectLots(document); } catch (error) { lots = { lots: [], foreign: [] }; }
    var orders = [];
    try { orders = root.LLVSales ? root.LLVSales.collect(document, []) : []; } catch (error) { orders = []; }
    return {
      url: location.href,
      path: location.pathname,
      lots: lots.lots.map(cleanLot).concat(lots.foreign.map(cleanLot)),
      orders: orders,
      balance: balanceTable()
    };
  }

  function cleanLot(lot) {
    return { id: lot.id, title: lot.title, price: lot.price, currency: lot.currency || "₽" };
  }

  var methods = {
    snapshot: snapshot,
    topbar: topbar,
    settings: function () {
      if (!root.LLV) return { ok: false, error: "Настройки не загрузились" };
      if (root.LLVPage && root.LLVPage.refresh) root.LLVPage.refresh();
      return { ok: true };
    },
    raise: function () {
      if (root.LLVBackground) return root.LLVBackground.raise();
      return { ok: false, error: "Фоновый модуль не загрузился" };
    },
    reviewPage: function () {
      if (root.LLVReview && root.LLVReview.onPage) return root.LLVReview.onPage() || { ok: false, error: "На странице нет формы ответа на отзыв" };
      return { ok: false, error: "Модуль отзывов не загрузился" };
    },
    supportForms: function () {
      if (root.LLVReview && root.LLVReview.pushOnPage) {
        return root.LLVReview.pushOnPage().then(function (answer) {
          return answer && answer.ok ? { ok: true, sent: answer.sent || 0 } : { ok: false, error: (answer && answer.error) || "Не удалось" };
        });
      }
      return { ok: false, error: "Модуль отзывов не загрузился" };
    },
    importLots: function (payload) {
      var rows = (payload && payload.rows) || [];
      if (!rows.length) return { ok: false, created: 0, error: "Список лотов пуст" };
      return root.LLVLots.eachLot ? lotsForImport(rows) : { ok: false, created: 0, error: "Модуль лотов не загрузился" };
    },
    bulk: function () {
      var toggle = document.querySelector("[data-cmd='select']");
      if (toggle) { toggle.click(); return { ok: true }; }
      var panel = document.getElementById("llv-profile-panel");
      if (panel) {
        var select = panel.querySelector("[data-cmd='select']");
        if (select) { select.click(); return { ok: true }; }
      }
      if (location.pathname.indexOf("/lots/") === 0 || /\/users\//.test(location.pathname)) {
        if (root.LLVLotsUI && root.LLVLotsUI.open) { root.LLVLotsUI.open(); return { ok: true }; }
      }
      return { ok: false, error: "Откройте страницу своих лотов или профиля" };
    }
  };

  if (root.__LLV_APP_BRIDGE__) return;
  root.__LLV_APP_BRIDGE__ = true;

  if (!root.chrome || !root.chrome.runtime || !root.chrome.runtime.onMessage) return;
  try {
    root.chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || message.type !== "llvApp") return;
      var method = methods[message.fn];
      if (!method) { sendResponse({ ok: false, error: "Неизвестное действие" }); return; }
      var result;
      try {
        result = method(message.payload || {});
      } catch (error) {
        sendResponse({ ok: false, error: (error && error.message) || "Ошибка" });
        return;
      }
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(function (data) {
          sendResponse({ ok: true, data: data });
        }, function (error) {
          sendResponse({ ok: false, error: (error && error.message) || "Ошибка" });
        });
        return true;
      }
      sendResponse({ ok: true, data: result });
    });
  } catch (error) {
    // Слушатель уже стоял от прошлой инъекции — это нормально.
    if (root.console) console.warn("LLV: мост уже подключён", error);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
