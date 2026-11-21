(function (root) {
  var SECTIONS = [
    ["shift", "Смена"],
    ["offers", "Предложения"],
    ["messages", "Сообщения"],
    ["reviews", "Отзывы"],
    ["sales", "Продажи"],
    ["purchases", "Покупки"],
    ["finance", "Финансы"],
    ["theme", "Тема"],
    ["custom", "Кастомизация"],
    ["notices", "Уведомления"],
    ["api", "API"]
  ];

  var seller = {};
  var connection = { url: "", key: "" };
  var goal = 0;
  var section = "shift";
  var page = null;

  function defaults() {
    return {
      autoRaise: false,
      raiseMinutes: 30,
      raiseNotice: true,
      quietOn: false,
      quietFrom: "23",
      quietTo: "8",
      highlight: false,
      promo: false,
      commission: "",
      realPrice: false,
      exactOn: true,
      showCard: true,
      costs: {},
      quick: [],
      welcomeOn: false,
      welcome: "",
      keywordsOn: false,
      keywords: [],
      thanksOn: false,
      thanks: "",
      autoSend: false,
      reviews: { "1": "", "2": "", "3": "", "4": "", "5": "" },
      hideBalance: false,
      privacy: false,
      dark: false,
      background: "",
      sound: ""
    };
  }

  function storage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.local;
  }

  function load(done) {
    var local = storage();
    seller = defaults();
    if (!local || !local.get) { done(); return; }
    local.get(["llvSeller", "settings", "llvShiftGoal"], function (data) {
      seller = Object.assign(defaults(), (data && data.llvSeller) || {});
      seller.reviews = Object.assign(defaults().reviews, seller.reviews || {});
      seller.costs = seller.costs || {};
      seller.quick = seller.quick || [];
      seller.keywords = seller.keywords || [];
      if (seller.showCard === undefined) seller.showCard = true;
      if (seller.exactOn === undefined) seller.exactOn = true;
      connection = (data && data.settings) || { url: "", key: "" };
      goal = Number(data && data.llvShiftGoal) || 0;
      done();
    });
  }

  function saveSeller() {
    var local = storage();
    if (local && local.set) local.set({ llvSeller: seller });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function note(text) {
    return el("p", "llv-set-note", text);
  }

  function toggle(label, on, change, disabled, why) {
    var row = el("label", "llv-set-toggle" + (disabled ? " is-disabled" : ""));
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!on;
    input.disabled = !!disabled;
    if (!disabled) input.addEventListener("change", function () { change(input.checked); });
    row.appendChild(input);
    row.appendChild(el("span", "", label));
    var wrap = el("div", "llv-set-row");
    wrap.appendChild(row);
    if (why) wrap.appendChild(note(why));
    return wrap;
  }

  function field(label, value, change, kind) {
    var wrap = el("label", "llv-set-field");
    wrap.appendChild(el("span", "", label));
    var input = document.createElement(kind === "area" ? "textarea" : "input");
    if (kind !== "area") input.type = kind || "text";
    input.value = value || "";
    input.addEventListener("input", function () { change(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function button(label, onClick, quiet) {
    var node = el("button", "llv-set-btn" + (quiet ? " is-quiet" : ""), label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function host() {
    return document.querySelector(".container, main, #content") || document.body;
  }

  function conceal(parent) {
    Array.prototype.forEach.call(parent.children, function (child) {
      if (child.id === "llv-settings" || child.id === "llv-shift-root" || child.dataset.llvHeld) return;
      child.dataset.llvHeld = child.hidden ? "hidden" : "shown";
      child.hidden = true;
    });
  }

  function reveal() {
    document.querySelectorAll("[data-llv-held]").forEach(function (child) {
      if (child.dataset.llvHeld !== "hidden") child.hidden = false;
      delete child.dataset.llvHeld;
    });
  }

  function accountName() {
    var node = document.querySelector(".user-link-name, .user-link-name span");
    return node ? (node.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function visibleOrders() {
    var rows = [];
    var seen = {};
    document.querySelectorAll("a[href*='/orders/']").forEach(function (link) {
      if (link.closest && (link.closest("#llv-settings") || link.closest("#llv-shift-root"))) return;
      var href = link.getAttribute("href") || "";
      var match = href.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
      if (!match || /^(trade|new|list|buy)$/i.test(match[1]) || seen[match[1]]) return;
      seen[match[1]] = true;
      var text = (link.innerText || "").replace(/\s+/g, " ").trim();
      var amount = root.LLVParser ? root.LLVParser.parseRub(text) : null;
      var completed = root.LLVParser ? root.LLVParser.isCompleted(text) : false;
      rows.push({ id: match[1], text: text, amount: amount, paid: /оплачен/i.test(text) && !completed });
    });
    return rows;
  }

  function download(name, content) {
    var blob = new Blob([content], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) { /* страница может запретить */ }
    area.remove();
  }

  function readFile(file, limit, done) {
    if (!file) return;
    if (file.size > limit) return;
    var reader = new FileReader();
    reader.onload = function () { done(String(reader.result || "")); };
    reader.readAsDataURL(file);
  }

  function paintSection(main) {
    main.innerHTML = "";
    var title = SECTIONS.filter(function (item) { return item[0] === section; })[0];
    main.appendChild(el("h2", "", title ? title[1] : ""));
    if (section === "shift") paintShift(main);
    else if (section === "offers") paintOffers(main);
    else if (section === "messages") paintMessages(main);
    else if (section === "reviews") paintReviews(main);
    else if (section === "sales") paintSales(main);
    else if (section === "purchases") paintPurchases(main);
    else if (section === "finance") paintFinance(main);
    else if (section === "theme") paintTheme(main);
    else if (section === "custom") paintCustom(main);
    else if (section === "notices") paintNotices(main);
    else paintApi(main);
  }

  function paintShift(main) {
    var status = el("p", "llv-set-note", "Состояние смены читается…");
    main.appendChild(status);
    var name = field("Имя, если его нет в шапке", accountName(), function () {});
    var nameInput = name.querySelector("input");
    main.appendChild(name);
    var shiftButton = button("Начать смену", function () {});
    main.appendChild(shiftButton);
    main.appendChild(field("Цель смены, ₽", goal ? String(goal) : "", function (value) {
      goal = Number(String(value).replace(",", ".")) || 0;
      var local = storage();
      if (local && local.set) local.set({ llvShiftGoal: goal });
    }));
    main.appendChild(note("Карточка над таблицей лотов тоже показывает штуки, выручку, прибыль 10% и остаток до цели."));
    var url = field("URL Supabase", connection.url || "", function (value) { connection.url = value; });
    var key = field("Anon key", connection.key || "", function (value) { connection.key = value; }, "password");
    main.appendChild(url);
    main.appendChild(key);
    main.appendChild(button("Сохранить подключение", function () {
      root.chrome.runtime.sendMessage({ type: "saveSettings", url: connection.url, key: connection.key }, function (state) {
        status.textContent = describe(state);
      });
    }));
    main.appendChild(button("Отправить очередь", function () {
      root.chrome.runtime.sendMessage({ type: "flush" }, function (state) {
        status.textContent = describe(state);
      });
    }, true));
    function applyShift(state) {
      var active = state && state.shift && state.shift.active;
      shiftButton.textContent = active ? "Завершить смену" : "Начать смену";
      status.textContent = describe(state);
      shiftButton.onclick = function () {
        if (active) {
          root.chrome.runtime.sendMessage({ type: "endShift" }, function (next) { applyShift(next); });
          return;
        }
        var worker = accountName() || nameInput.value.trim();
        if (!worker) { status.textContent = "Введите имя аккаунта FunPay"; return; }
        root.chrome.runtime.sendMessage({ type: "startShift", name: worker }, function (next) { applyShift(next); });
      };
    }
    root.chrome.runtime.sendMessage({ type: "getState" }, applyShift);
  }

  function describe(state) {
    if (!state) return "Нет ответа от расширения";
    if (state.ok === false) return state.error || "Не удалось прочитать состояние";
    var parts = [];
    parts.push(state.shift && state.shift.active ? ("Смена идёт: " + state.shift.workerName) : "Активной смены нет");
    if (!state.configured) parts.push(state.pending ? ("В очереди " + state.pending) : "Ключи не заданы, события копятся на этом компьютере");
    else if (state.pending) parts.push("В очереди " + state.pending);
    if (state.lastError) parts.push(state.lastError);
    return parts.join(". ") + ".";
  }

  function paintOffers(main) {
    main.appendChild(toggle("Автоподнятие предложений", seller.autoRaise, function (on) { seller.autoRaise = on; saveSeller(); }));
    main.appendChild(field("Интервал, минут", String(seller.raiseMinutes || 30), function (value) { seller.raiseMinutes = value; saveSeller(); }));
    main.appendChild(toggle("Тихие часы", seller.quietOn, function (on) { seller.quietOn = on; saveSeller(); }));
    main.appendChild(field("С часа", seller.quietFrom || "", function (value) { seller.quietFrom = value; saveSeller(); }));
    main.appendChild(field("До часа", seller.quietTo || "", function (value) { seller.quietTo = value; saveSeller(); }));
    main.appendChild(toggle("Подсветка своих лотов", seller.highlight, function (on) { seller.highlight = on; saveSeller(); }));
    main.appendChild(toggle("Значки промо-лотов", seller.promo, function (on) { seller.promo = on; saveSeller(); }));
    main.appendChild(field("Комиссия раздела, %", seller.commission || "", function (value) { seller.commission = value; saveSeller(); }));
    main.appendChild(toggle("Реальная цена", seller.realPrice, function (on) { seller.realPrice = on; saveSeller(); }));
    main.appendChild(toggle("Точная цена на форме лота", seller.exactOn !== false, function (on) { seller.exactOn = on; saveSeller(); }));
    main.appendChild(toggle("Карточка над таблицей лотов", seller.showCard !== false, function (on) { seller.showCard = on; saveSeller(); }));
    main.appendChild(note("Экспорт, импорт, клон, замена названия и описания и отметки лотов остаются на карточке над таблицей."));
    main.appendChild(button("Поднять сейчас", function () {
      var result = root.LLVLots && root.LLVLots.raiseOnPage(document);
      main.appendChild(note(result && result.ok ? "Раздел: поднято" : "На этой странице нет кнопки «Поднять»"));
    }));
    if (root.LLVLots) {
      var lots = root.LLVLots.collectLots(document).lots;
      if (lots.length) {
        var select = document.createElement("select");
        select.className = "llv-set-select";
        lots.forEach(function (lot) {
          var option = document.createElement("option");
          option.value = lot.id;
          option.textContent = lot.title || lot.id;
          select.appendChild(option);
        });
        var cost = field("Себестоимость выбранного лота", seller.costs[select.value] || "", function (value) {
          seller.costs[select.value] = value;
          saveSeller();
        });
        select.addEventListener("change", function () { cost.querySelector("input").value = seller.costs[select.value] || ""; });
        main.appendChild(select);
        main.appendChild(cost);
      }
    }
  }

  function paintMessages(main) {
    main.appendChild(toggle("Отправлять шаблон самой", seller.autoSend, function (on) { seller.autoSend = on; saveSeller(); }));
    main.appendChild(toggle("Приветственное сообщение", seller.welcomeOn, function (on) { seller.welcomeOn = on; saveSeller(); }));
    main.appendChild(field("Текст приветствия", seller.welcome || "", function (value) { seller.welcome = value; saveSeller(); }, "area"));
    main.appendChild(toggle("Автоответ по слову", seller.keywordsOn, function (on) { seller.keywordsOn = on; saveSeller(); }));
    var rule = seller.keywords[0] || { word: "", text: "" };
    main.appendChild(field("Слово", rule.word || "", function (value) {
      seller.keywords[0] = seller.keywords[0] || { word: "", text: "" };
      seller.keywords[0].word = value;
      saveSeller();
    }));
    main.appendChild(field("Ответ на слово", rule.text || "", function (value) {
      seller.keywords[0] = seller.keywords[0] || { word: "", text: "" };
      seller.keywords[0].text = value;
      saveSeller();
    }, "area"));
    main.appendChild(toggle("Сообщение после подтверждения", seller.thanksOn, function (on) { seller.thanksOn = on; saveSeller(); }));
    main.appendChild(field("Текст после подтверждения", seller.thanks || "", function (value) { seller.thanks = value; saveSeller(); }, "area"));
    var quickName = "";
    var quickText = "";
    main.appendChild(field("Быстрое сообщение: имя", "", function (value) { quickName = value; }));
    main.appendChild(field("Быстрое сообщение: текст", "", function (value) { quickText = value; }, "area"));
    main.appendChild(button("Сохранить быстрое сообщение", function () {
      if (!quickName || !quickText) return;
      seller.quick.push({ title: quickName, text: quickText });
      saveSeller();
      paintSection(main);
    }));
    if (seller.quick.length) {
      var list = el("ul", "llv-set-list");
      seller.quick.forEach(function (item) {
        list.appendChild(el("li", "", (item.title || "") + " — " + (item.text || "")));
      });
      main.appendChild(list);
    }
    main.appendChild(note("В чате на странице заказа появляется ряд эмодзи. Быстрые сообщения открываются по «/»."));
    main.appendChild(toggle("Перевод сообщения", false, function () {}, true, "Нужна сеть перевода. LLV не отправляет текст наружу."));
    main.appendChild(toggle("Ответ нейросетью", false, function () {}, true, "Нужна сеть нейросети. LLV не отправляет текст наружу."));
  }

  function paintReviews(main) {
    ["1", "2", "3", "4", "5"].forEach(function (star) {
      main.appendChild(field("Отзыв на " + star, seller.reviews[star] || "", function (value) {
        seller.reviews[star] = value;
        saveSeller();
      }, "area"));
    });
    main.appendChild(button("Ответить по шаблону", function () {
      var form = null;
      document.querySelectorAll("form").forEach(function (item) {
        if (form || (item.closest && item.closest("#llv-settings"))) return;
        if (/отзыв/i.test(item.innerText || "") && item.querySelector("textarea")) form = item;
      });
      if (!form) { main.appendChild(note("На странице нет ответа на отзыв")); return; }
      var stars = (document.body.innerText.match(/([1-5])\s*(?:из\s*5|звезд)/i) || [])[1] || "5";
      var text = seller.reviews[stars] || "";
      if (!text) { main.appendChild(note("Нет шаблона для оценки " + stars)); return; }
      form.querySelector("textarea").value = text;
    }));
  }

  function paintSales(main) {
    var rows = visibleOrders();
    var sum = 0;
    var paid = [];
    rows.forEach(function (row) {
      if (row.amount !== null) sum += row.amount;
      if (row.paid) paid.push(row.id);
    });
    main.appendChild(note("На экране: " + rows.length + " заказов, " + Math.round(sum) + " ₽. Неподтверждённых: " + paid.length));
    main.appendChild(button("Экспорт продаж", function () { download("orders.json", JSON.stringify(rows, null, 2)); }));
    main.appendChild(button("Скопировать неподтверждённые", function () {
      if (!paid.length) { main.appendChild(note("Неподтверждённых на экране нет")); return; }
      copyText(paid.join("\n"));
    }, true));
    main.appendChild(button("График по дням", function () {
      var days = {};
      rows.forEach(function (row) {
        var sold = root.LLVParser && root.LLVParser.parseSoldAt(row.text, new Date());
        var key = sold ? sold.toISOString().slice(0, 10) : "без даты";
        days[key] = (days[key] || 0) + (row.amount || 0);
      });
      var chart = el("div", "llv-chart");
      var keys = Object.keys(days);
      var max = Math.max.apply(null, keys.map(function (key) { return days[key]; }).concat([1]));
      if (!keys.length) chart.textContent = "На экране нет сумм";
      keys.forEach(function (key) {
        var line = el("div", "");
        var bar = el("span", "");
        bar.style.width = Math.max(8, Math.round(days[key] / max * 160)) + "px";
        line.appendChild(bar);
        line.appendChild(document.createTextNode(" " + key + " · " + days[key] + " ₽"));
        chart.appendChild(line);
      });
      var old = main.querySelector(".llv-chart");
      if (old) old.remove();
      main.appendChild(chart);
    }, true));
    main.appendChild(button("Текст для поддержки", function () {
      var id = (location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/) || [])[1] || paid[0] || "";
      if (!id) { main.appendChild(note("Нет номера заказа")); return; }
      copyText("Прошу подтвердить выполнение заказа #" + id);
    }, true));
    main.appendChild(note("Заявка в поддержку не отправляется: текст только копируется."));
  }

  function paintPurchases(main) {
    var foreign = root.LLVLots ? root.LLVLots.collectLots(document).foreign.length : 0;
    main.appendChild(note("На экране чужих лотов: " + foreign + ". LLV считает только то, что уже видно."));
    main.appendChild(toggle("Оформлять покупки", false, function () {}, true, "LLV не нажимает «Купить»."));
  }

  function paintFinance(main) {
    main.appendChild(toggle("Скрыть баланс", seller.hideBalance, function (on) { seller.hideBalance = on; saveSeller(); }));
    main.appendChild(button("Экспорт операций", function () {
      var table = document.querySelector("table");
      var around = location.pathname + " " + (document.body.innerText || "").slice(0, 400);
      if (!table || !/balance|финанс|баланс/i.test(around) || (table.closest && table.closest("#llv-settings"))) {
        main.appendChild(note("Откройте страницу баланса"));
        return;
      }
      var lines = [];
      table.querySelectorAll("tr").forEach(function (row) {
        lines.push(Array.prototype.map.call(row.cells, function (cell) { return (cell.innerText || "").trim(); }));
      });
      download("balance.json", JSON.stringify(lines, null, 2));
    }));
  }

  function paintTheme(main) {
    main.appendChild(toggle("Тёмная тема", seller.dark, function (on) { seller.dark = on; saveSeller(); }));
    main.appendChild(toggle("Режим приватности", seller.privacy, function (on) { seller.privacy = on; saveSeller(); }));
    var background = document.createElement("input");
    background.type = "file";
    background.accept = "image/*";
    background.addEventListener("change", function () {
      readFile(background.files[0], 700000, function (url) {
        seller.background = url;
        saveSeller();
      });
    });
    main.appendChild(el("p", "llv-set-note", "Свой фон страницы"));
    main.appendChild(background);
    main.appendChild(button("Убрать фон", function () {
      seller.background = "";
      saveSeller();
      document.body.style.backgroundImage = "";
    }, true));
  }

  function paintCustom(main) {
    main.appendChild(note("Карточка лотов и эта страница остаются чёрными, со знаком LLV."));
    main.appendChild(toggle("Стиль ника", false, function () {}, true, "Нужен чужой сервис ника. LLV его не вызывает."));
    main.appendChild(toggle("Описание профиля", false, function () {}, true, "Нужен чужой сервис профиля. LLV его не вызывает."));
  }

  function paintNotices(main) {
    main.appendChild(toggle("Уведомление о поднятии", seller.raiseNotice, function (on) { seller.raiseNotice = on; saveSeller(); }));
    var sound = document.createElement("input");
    sound.type = "file";
    sound.accept = "audio/*";
    sound.addEventListener("change", function () {
      readFile(sound.files[0], 400000, function (url) {
        seller.sound = url;
        saveSeller();
      });
    });
    main.appendChild(el("p", "llv-set-note", "Звук нового заказа"));
    main.appendChild(sound);
    main.appendChild(button("Проверить звук", function () {
      if (!seller.sound) { main.appendChild(note("Сначала выберите звук")); return; }
      new Audio(seller.sound).play().catch(function () { main.appendChild(note("Браузер не дал проиграть звук")); });
    }, true));
  }

  function paintApi(main) {
    main.appendChild(note("URL и anon key Supabase задаются в разделе «Смена»."));
    main.appendChild(button("Открыть смену и подключение", function () {
      section = "shift";
      page.querySelectorAll("nav button").forEach(function (button) {
        button.classList.toggle("is-on", button.getAttribute("data-section") === "shift");
      });
      paintSection(page.querySelector(".llv-set-main"));
    }, true));
    main.appendChild(toggle("Ключ сессии FunPay", false, function () {}, true, "LLV не читает ключ сессии FunPay."));
    main.appendChild(toggle("Внешний API бота", false, function () {}, true, "LLV работает на этой странице и с Supabase, который вы указали."));
  }

  function render() {
    var icon = "";
    try { icon = root.chrome.runtime.getURL("icons/icon.png"); } catch (error) { icon = ""; }
    page.innerHTML = "";
    var head = el("header", "llv-set-head");
    var mark = el("div", "llv-set-mark");
    if (icon) {
      var image = document.createElement("img");
      image.src = icon;
      image.alt = "";
      image.width = 28;
      image.height = 28;
      mark.appendChild(image);
    }
    head.appendChild(mark);
    head.appendChild(el("div", "llv-set-brand", "LLV"));
    head.appendChild(el("p", "", "Настройки на FunPay"));
    head.appendChild(button("Закрыть", close, true));
    var body = el("div", "llv-set-body");
    var nav = el("nav", "");
    SECTIONS.forEach(function (item) {
      var link = el("button", item[0] === section ? "is-on" : "", item[1]);
      link.type = "button";
      link.setAttribute("data-section", item[0]);
      link.addEventListener("click", function () {
        section = item[0];
        nav.querySelectorAll("button").forEach(function (button) { button.classList.toggle("is-on", button === link); });
        paintSection(main);
      });
      nav.appendChild(link);
    });
    var main = el("div", "llv-set-main");
    body.appendChild(nav);
    body.appendChild(main);
    page.appendChild(head);
    page.appendChild(body);
    paintSection(main);
  }

  function open() {
    var parent = host();
    page = document.getElementById("llv-settings");
    if (!page) {
      page = el("section", "");
      page.id = "llv-settings";
      parent.insertBefore(page, parent.firstChild);
    }
    conceal(parent);
    page.hidden = false;
    load(render);
    if (location.hash !== "#llv-settings") {
      try { history.replaceState(null, "", location.pathname + location.search + "#llv-settings"); } catch (error) { /* адрес может быть закрыт */ }
    }
  }

  function close() {
    var node = document.getElementById("llv-settings");
    if (node) node.remove();
    page = null;
    reveal();
    if (location.hash === "#llv-settings") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (error) { /* адрес может быть закрыт */ }
    }
  }

  root.LLVSettings = { open: open, close: close };
})(typeof globalThis !== "undefined" ? globalThis : this);
