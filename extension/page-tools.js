(function (root) {
  var TAGS = ".tc-item, a[data-offer], .offer-list a, .tc-price, .user-link-name, .media-user-name, .order-header-id, .chat-msg-author";

  function config() {
    return root.LLV ? root.LLV.current() : {};
  }

  function ownIds() {
    if (!root.LLVLots) return {};
    var ids = {};
    root.LLVLots.collectLots(document).lots.forEach(function (lot) { ids[lot.id] = true; });
    return ids;
  }

  function ownRows() {
    var ids = ownIds();
    return Array.prototype.filter.call(
      document.querySelectorAll("a.tc-item[data-offer], .tc-item[data-offer]"),
      function (row) {
        if (row.closest && row.closest("#llv-shift-root, #llv-profile-panel")) return false;
        return !!ids[row.getAttribute("data-offer")];
      }
    );
  }

  function markHighlight() {
    var on = !!config().highlight;
    document.querySelectorAll(".llv-own, .llv-own-real").forEach(function (node) {
      node.classList.remove("llv-own", "llv-own-real");
    });
    if (!on) return;
    ownRows().forEach(function (row) { row.classList.add("llv-own"); });
  }

  function realPrice() {
    var settings = config();
    document.querySelectorAll(".llv-real").forEach(function (node) { node.remove(); });
    document.querySelectorAll(".llv-real-host").forEach(function (node) { node.classList.remove("llv-real-host"); });
    if (!settings.realPrice) return;
    var fee = 0;
    var raw = Number(String(settings.commission || "").replace(",", "."));
    if (isFinite(raw) && raw > 0 && raw < 99) fee = raw;
    ownRows().forEach(function (row) {
      var price = row.querySelector(".tc-price");
      if (!price) return;
      var match = (price.textContent || "").replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
      if (!match) return;
      var value = Number(match[1].replace(",", "."));
      if (!isFinite(value) || value <= 0) return;
      var net = fee ? value * (1 - fee / 100) : value * 0.9;
      var tail = document.createElement("span");
      tail.className = "llv-real";
      tail.textContent = "≈ " + root.LLV.money(Math.round(net * 100) / 100) + " ₽ на руки";
      price.classList.add("llv-real-host");
      price.appendChild(tail);
    });
  }

  function hideBalance() {
    var settings = config();
    var nodes = document.querySelectorAll(".badge-balance, .balance, .balance-value, .navbar-balance");
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.closest && node.closest("#llv-settings")) return;
      node.classList.toggle("llv-blurred", !!settings.hideBalance);
      if (settings.hideBalance) node.setAttribute("title", "Баланс скрыт: наведите, чтобы показать");
    });
  }

  function privacy() {
    var on = !!config().privacy;
    document.documentElement.classList.toggle("llv-private", on);
    if (!on) return;
    var targets = document.querySelectorAll(
      ".user-link-name, .media-user-name, .badge-balance, .balance, .order-header-id, .chat-msg-author, .tc-order"
    );
    Array.prototype.forEach.call(targets, function (node) {
      if (node.closest && node.closest("#llv-settings")) return;
      node.classList.add("llv-private-text");
    });
  }

  function nickColor() {
    var settings = config();
    var nodes = document.querySelectorAll("[data-llv-nick]");
    Array.prototype.forEach.call(nodes, function (node) {
      node.style.removeProperty("--llv-nick");
      node.removeAttribute("data-llv-nick");
    });
    if (!settings.nickColor) return;
    var names = document.querySelectorAll(".user-link-name");
    Array.prototype.forEach.call(names, function (node) {
      var holder = node.closest("header, .navbar, #header");
      if (!holder) return;
      node.setAttribute("data-llv-nick", "own");
      node.style.color = settings.nickColor;
    });
  }

  function hideStyles() {
    if (!config().hideNickStyles) return;
    var nodes = document.querySelectorAll(".user-link-name[style], .media-user-name[style], .chat-msg-author[style]");
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.getAttribute("data-llv-nick")) return;
      node.classList.add("llv-flat-nick");
    });
  }

  function copyButton() {
    var settings = config();
    var existing = document.querySelector(".llv-copy-order");
    var match = location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
    if (!settings.unpaidCopy || !match || existing) return;
    var id = match[1];
    if (/^(trade|new|list|buy)$/i.test(id)) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "llv-copy-order";
    button.textContent = "#" + id + " ⧉";
    button.addEventListener("click", function () {
      root.LLV.copyText(id);
    });
    var head = document.querySelector(".page-header, h1, .order-header");
    (head && head.parentNode ? head : document.querySelector("main, .container, body")).appendChild(button);
  }

  function supportButton() {
    var settings = config();
    var match = location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
    if (!settings.salesSupport || !match || document.querySelector(".llv-support")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "llv-support";
    button.textContent = "Заявка в поддержку";
    button.addEventListener("click", function () {
      root.LLVMarket.supportRequest(match[1]).then(function () {
        root.LLV.toast("Текст заявки подставлен в форму поддержки");
      }, function () {
        root.LLV.copyText("Прошу подтвердить выполнение заказа #" + match[1] + ". Покупатель не подтверждает заказ.");
        root.LLV.toast("Формы поддержки нет — текст заявки скопирован");
      });
    });
    var head = document.querySelector(".page-header, h1, .order-header");
    (head && head.parentNode ? head : document.querySelector("main, .container, body")).appendChild(button);
  }

  function statsCard() {
    var settings = config();
    var path = location.pathname;
    var host = document.querySelector(".page-header, h1") || document.querySelector("main, .container");
    if (!host) return;
    var old = document.querySelector(".llv-stats");
    if (old) old.remove();
    var kinds = null;
    var title = "";
    if (/\/orders\/trade/.test(path)) {
      if (!settings.salesStats) return;
      kinds = /подтвержд|выполн|закрыт|заверш|возврат|спор|оплач/i;
      title = "Статистика продаж";
    } else if (/\/orders\//.test(path) && !/\/orders\/(trade|new)/.test(path)) {
      return;
    } else if (/\/orders/.test(path) && settings.purchasesStats) {
      kinds = /./;
      title = "Статистика покупок";
    } else if (/balance/.test(path) && settings.financeStats) {
      return balanceCard(host);
    } else {
      return;
    }
    var rows = root.LLVSales.collect(document, kinds ? [kinds] : []);
    if (!rows.length) return;
    var stats = root.LLVSales.stats(rows);
    var card = document.createElement("section");
    card.className = "llv-stats";
    card.innerHTML = '<h3></h3><p class="llv-stats-line"></p><div class="llv-chart"></div>';
    card.querySelector("h3").textContent = title;
    card.querySelector(".llv-stats-line").textContent =
      rows.length + " заказов · " + root.LLV.money(stats.sum) + " ₽";
    root.LLVSales.chart(card.querySelector(".llv-chart"), stats.days);
    if (/\/orders\/trade/.test(path) && settings.unpaidCopy) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "llv-set-btn is-quiet";
      button.textContent = "Скопировать ID неподтверждённых";
      button.addEventListener("click", function () {
        var ids = rows.filter(function (row) {
          return /оплач|paid/i.test(row.status) && !/подтвержд|выполн|закрыт|заверш/i.test(row.status);
        }).map(function (row) { return row.id; });
        if (!ids.length) { root.LLV.toast("Неподтверждённых на странице нет"); return; }
        root.LLV.copyText(ids.join("\n"));
      });
      card.appendChild(button);
    }
    if (/\/orders\/trade/.test(path) && settings.salesExport) {
      var exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = "llv-set-btn is-quiet";
      exportButton.textContent = "Экспорт продаж (CSV)";
      exportButton.addEventListener("click", function () {
        root.LLV.download("sales.csv", root.LLVSales.toCsv(rows, [
          ["id", "ID"], ["title", "Название"], ["status", "Статус"], ["date", "Дата"], ["amount", "Сумма"]
        ]), "text/csv;charset=utf-8");
      });
      card.appendChild(exportButton);
    }
    host.parentNode.insertBefore(card, host.nextSibling);
  }

  function balanceCard(host) {
    var table = document.querySelector("table");
    if (!table) return;
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (row) {
      if (row.querySelector("th")) return;
      var cells = Array.prototype.map.call(row.cells, function (cell) { return (cell.innerText || "").trim(); });
      if (cells.length < 2) return;
      rows.push({ cells: cells, amounts: (row.innerText || "").match(/[+-]?\s?\d[\d\s]*(?:[.,]\d{1,2})?\s*₽/g) || [] });
    });
    if (!rows.length) return;
    var income = 0;
    var expense = 0;
    var days = {};
    rows.forEach(function (row) {
      var date = (row.cells.join(" ").match(/\d{1,2}\.\d{1,2}\.\d{2,4}/) || [""])[0];
      row.amounts.forEach(function (raw) {
        var value = Number(raw.replace(/\s/g, "").replace("₽", "").replace(",", "."));
        if (!isFinite(value)) return;
        if (value < 0) expense += -value;
        else income += value;
        if (date) days[date] = (days[date] || 0) + value;
      });
    });
    var card = document.createElement("section");
    card.className = "llv-stats";
    card.innerHTML = '<h3>Финансы</h3><p class="llv-stats-line"></p><div class="llv-chart"></div>';
    card.querySelector(".llv-stats-line").textContent =
      "Поступления " + root.LLV.money(income) + " ₽ · Расходы " + root.LLV.money(expense) +
      " ₽ · Чистый поток " + root.LLV.money(income - expense) + " ₽ · Операций " + rows.length;
    root.LLVSales.chart(card.querySelector(".llv-chart"), days);
    var out = document.createElement("button");
    out.type = "button";
    out.className = "llv-set-btn is-quiet";
    out.textContent = "Экспорт операций (CSV)";
    out.addEventListener("click", function () {
      var lines = rows.map(function (row) {
        return row.cells.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(";");
      });
      root.LLV.download("balance.csv", "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
    });
    card.appendChild(out);
    host.parentNode.insertBefore(card, host.nextSibling);
  }

  function profilePanel() {
    var settings = config();
    var old = document.getElementById("llv-profile-panel");
    if (!settings.showCard || !/\/users\//.test(location.pathname)) {
      if (old) old.remove();
      return;
    }
    if (old || document.getElementById("llv-shift-root")) return;
    var host = document.querySelector(".page-header, .profile-header, h1, .container");
    if (!host) return;
    var panel = document.createElement("section");
    panel.id = "llv-profile-panel";
    var mine = root.LLVMarket.isOwnProfile();
    var lots = root.LLVMarket.foreignLots(document);
    panel.innerHTML =
      '<div class="llv-head"><div class="llv-title">Управление лотами</div>' +
      '<button class="llv-link llv-profile-close" type="button" aria-label="Скрыть">×</button></div>' +
      '<input class="llv-search" type="search" placeholder="Поиск лотов, раздел или название" autocomplete="off" />' +
      '<div class="llv-profile-info"></div><div class="llv-commands"></div><div class="llv-work" hidden></div>';
    panel.querySelector(".llv-profile-info").textContent =
      (mine ? "Ваш профиль" : "Профиль продавца") + " · лотов на странице: " + lots.length +
      (mine ? "" : " · клонирование создаёт копию из вашего лота в том же разделе");
    var search = panel.querySelector(".llv-search");
    search.addEventListener("input", function () {
      var query = search.value.trim().toLowerCase();
      lots.forEach(function (lot) {
        var row = root.LLVLots.rowById(document, lot.id);
        if (row) row.classList.toggle("llv-filtered", !!query && (lot.title || "").toLowerCase().indexOf(query) === -1);
      });
    });
    var commands = panel.querySelector(".llv-commands");
    var buttons = mine
      ? [["export", "Экспорт лотов"], ["import", "Импорт лотов"], ["raise", "Поднять все предложения"]]
      : [["view", "Лоты покупателя"], ["clone", "Клонировать лоты"]];
    buttons.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "llv-cmd";
      button.textContent = item[1];
      button.addEventListener("click", function () {
        if (item[0] === "export") root.LLVLotsUI.exportLots("json");
        else if (item[0] === "import") importPanel(panel);
        else if (item[0] === "raise" && root.LLVBackground) root.LLVBackground.raise();
        else if (item[0] === "view") viewPanel(panel, lots);
        else if (item[0] === "clone") clonePanel(panel, lots);
      });
      commands.appendChild(button);
    });
    panel.querySelector(".llv-profile-close").addEventListener("click", function () { panel.remove(); });
    host.parentNode.insertBefore(panel, host.nextSibling);
  }

  function importPanel(panel, text) {
    if (typeof text === "string") {
      root.LLVLotsUI.importLots(text, function (message) {
        var note = panel.querySelector(".llv-work");
        note.hidden = false;
        note.innerHTML = '<p class="llv-note"></p>';
        note.querySelector(".llv-note").textContent = message;
      });
      return;
    }
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,.csv";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      root.LLV.readFile(file, 2000000, true, function (data) { importPanel(panel, data); });
    });
    input.click();
  }

  function viewPanel(panel, lots) {
    var work = panel.querySelector(".llv-work");
    work.hidden = false;
    work.innerHTML = "";
    var head = document.createElement("p");
    head.className = "llv-kicker";
    head.textContent = "Лоты продавца: " + lots.length;
    work.appendChild(head);
    lots.forEach(function (lot) {
      var row = document.createElement("p");
      row.className = "llv-pair";
      row.innerHTML = "<span></span><span></span>";
      row.children[0].textContent = lot.title || lot.id;
      row.children[1].textContent = (lot.price || "—") + " " + (lot.currency || "");
      work.appendChild(row);
    });
  }

  function clonePanel(panel, lots) {
    var work = panel.querySelector(".llv-work");
    var mine = root.LLVLots.collectLots(document).lots;
    work.hidden = false;
    work.innerHTML = "";
    if (!mine.length) {
      var none = document.createElement("p");
      none.className = "llv-note";
      none.textContent = "На странице нет вашего лота в этом разделе: создавать копию не из чего.";
      work.appendChild(none);
      return;
    }
    var pick = document.createElement("select");
    pick.className = "llv-set-select";
    mine.forEach(function (lot) {
      var option = document.createElement("option");
      option.value = lot.id;
      option.textContent = lot.title || lot.id;
      pick.appendChild(option);
    });
    work.appendChild(pick);
    var go = document.createElement("button");
    go.type = "button";
    go.className = "llv-btn";
    go.textContent = "Клонировать " + lots.length + " лот(ов)";
    go.addEventListener("click", function () {
      var template = null;
      mine.forEach(function (lot) { if (lot.id === pick.value) template = lot; });
      root.LLVLots.eachLot(lots, function (lot) {
        return root.LLVLots.createFromTemplate(template, location, fetch, {
          title: lot.title,
          price: lot.price,
          currency: lot.currency,
          description: ""
        });
      }).then(function (results) {
        var ok = results.filter(function (row) { return row.ok; }).length;
        root.LLV.toast("Создано лотов: " + ok + " из " + results.length);
      });
    });
    work.appendChild(go);
  }

  function editFormTools() {
    var settings = config();
    var form = document.querySelector("form[action*='offerEdit'], form[action*='offer']");
    if (!form) return;
    if (settings.exactOn !== false && !form.querySelector(".llv-exact")) {
      var price = form.querySelector("[name='price'], input[name*='price']");
      if (price) {
        var wrap = document.createElement("label");
        wrap.className = "llv-set-field llv-exact";
        wrap.innerHTML = "<span>Цена для покупателя</span><input type='text' />";
        wrap.querySelector("input").value = price.value || "";
        wrap.querySelector("input").addEventListener("input", function () {
          var raw = Number(String(this.value).replace(",", "."));
          if (!isFinite(raw) || raw <= 0) return;
          price.value = String(settings.realPrice ? Math.round(raw * 0.9 * 100) / 100 : raw);
        });
        price.parentNode.insertBefore(wrap, price.parentNode);
      }
    }
    if (!form.querySelector(".llv-tools")) {
      var tools = document.createElement("div");
      tools.className = "llv-tools";
      tools.innerHTML =
        '<button type="button" class="llv-cmd" data-tool="english">Перевести на английский</button>' +
        '<button type="button" class="llv-cmd" data-tool="ai">Написать текст лота</button>';
      tools.addEventListener("click", function (event) {
        var button = event.target.closest("[data-tool]");
        if (!button) return;
        tool(button.getAttribute("data-tool"), form);
      });
      form.appendChild(tools);
    }
  }

  function tool(kind, form) {
    var title = form.querySelector("[name='summary'], input[name*='title']");
    var desc = form.querySelector("textarea[name*='desc'], textarea");
    if (!title) return;
    if (kind === "english") {
      root.LLVTranslate.english(title.value, config()).then(function (translated) {
        var dialog = preview(form, "Перевод на английский", translated, desc ? "" : "");
        if (dialog && desc) {
          root.LLVTranslate.english(desc.value, config()).then(function (text) {
            dialog.querySelector("textarea").value = text;
          });
        }
      });
      return;
    }
    if (!root.LLVAi.ready()) {
      root.LLV.toast("Сначала задайте ключ нейросети в настройках");
      return;
    }
    root.LLVAi.lot(title.value, desc ? desc.value : "").then(function (result) {
      if (!result) { root.LLV.toast("Нейросеть не ответила"); return; }
      preview(form, "Результат нейросети", result.title, result.description);
    });
  }

  function preview(form, caption, title, description) {
    var old = document.querySelector(".llv-preview");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "llv-preview";
    box.innerHTML =
      '<p class="llv-kicker"></p>' +
      '<label class="llv-set-field"><span>Название</span><input /></label>' +
      '<label class="llv-set-field is-area"><span>Описание</span><textarea></textarea></label>' +
      '<button type="button" class="llv-btn" data-act="apply">Применить</button>' +
      '<button type="button" class="llv-link" data-act="close">Закрыть</button>';
    box.querySelector(".llv-kicker").textContent = caption;
    box.querySelector("input").value = title;
    box.querySelector("textarea").value = description || "";
    box.querySelector("[data-act='close']").addEventListener("click", function () { box.remove(); });
    box.querySelector("[data-act='apply']").addEventListener("click", function () {
      var head = form.querySelector("[name='summary'], input[name*='title']");
      var body = form.querySelector("textarea[name*='desc'], textarea");
      if (head) {
        head.value = box.querySelector("input").value;
        head.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (body) {
        body.value = box.querySelector("textarea").value;
        body.dispatchEvent(new Event("input", { bubbles: true }));
      }
      box.remove();
    });
    form.appendChild(box);
    return box;
  }

  function quickMenu() {
    var settings = config();
    var area = document.querySelector("textarea[name='message'], .chat-form textarea");
    if (!area || area.dataset.llvQuick) return;
    area.dataset.llvQuick = "1";
    area.addEventListener("keydown", function (event) {
      if (event.key !== "/" || !settings.quick.length) return;
      var menu = document.createElement("div");
      menu.className = "llv-quick-menu";
      settings.quick.forEach(function (item) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = item.title;
        button.addEventListener("mousedown", function (fire) {
          fire.preventDefault();
          area.value = item.text;
          area.dispatchEvent(new Event("input", { bubbles: true }));
          menu.remove();
          if (settings.autoSend) {
            area.closest("form").dataset.llvSending = "1";
            root.LLV.submitChat(area);
          }
        });
        menu.appendChild(button);
      });
      area.parentNode.appendChild(menu);
      setTimeout(function () { menu.remove(); }, 6000);
    });
  }

  function refresh() {
    markHighlight();
    realPrice();
    hideBalance();
    privacy();
    nickColor();
    hideStyles();
    copyButton();
    supportButton();
    statsCard();
    profilePanel();
    editFormTools();
    quickMenu();
  }

  var timer = null;
  var observer = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  }

  function start() {
    if (root.LLV && root.LLV.load) {
      root.LLV.load(function () { refresh(); });
    } else {
      refresh();
    }
    if (!document.documentElement) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("llv-settings", schedule);
    if (root.LLV && root.LLV.on) root.LLV.on(schedule);
  }

  root.LLVPage = { refresh: refresh, start: start };
})(typeof globalThis !== "undefined" ? globalThis : this);
