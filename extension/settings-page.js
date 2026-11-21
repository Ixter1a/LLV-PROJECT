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

  function card(title, hint) {
    var node = el("article", "llv-set-card");
    node.appendChild(el("h3", "", title));
    if (hint) node.appendChild(note(hint));
    return node;
  }

  function disabledCard(title, reason) {
    var node = card(title, reason);
    node.classList.add("is-disabled");
    var row = el("label", "llv-set-toggle is-disabled");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = true;
    input.setAttribute("aria-label", title);
    row.appendChild(input);
    row.appendChild(el("span", "", "Недоступно"));
    node.appendChild(row);
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
    var shiftCard = card("Смена", "Имя берётся из шапки FunPay. Если его нет, впишите его здесь.");
    var status = el("p", "llv-set-note", "Состояние смены читается…");
    var name = field("Имя сотрудника", accountName(), function () {});
    var nameInput = name.querySelector("input");
    var shiftButton = button("Начать смену", function () {});
    shiftCard.appendChild(status);
    shiftCard.appendChild(name);
    shiftCard.appendChild(shiftButton);
    main.appendChild(shiftCard);

    var goalCard = card("Цель смены", "Карточка над таблицей лотов показывает штуки, выручку, прибыль 10% и остаток до цели.");
    goalCard.appendChild(field("Цель, ₽", goal ? String(goal) : "", function (value) {
      goal = Number(String(value).replace(",", ".")) || 0;
      var local = storage();
      if (local && local.set) local.set({ llvShiftGoal: goal });
    }));
    main.appendChild(goalCard);

    var linkCard = card("Подключение", "URL и anon key Supabase. Очередь уходит после сохранения ключей.");
    linkCard.appendChild(field("URL Supabase", connection.url || "", function (value) { connection.url = value; }));
    linkCard.appendChild(field("Anon key", connection.key || "", function (value) { connection.key = value; }, "password"));
    linkCard.appendChild(button("Сохранить подключение", function () {
      root.chrome.runtime.sendMessage({ type: "saveSettings", url: connection.url, key: connection.key }, function (state) {
        status.textContent = describe(state);
      });
    }));
    linkCard.appendChild(button("Отправить очередь", function () {
      root.chrome.runtime.sendMessage({ type: "flush" }, function (state) {
        status.textContent = describe(state);
      });
    }, true));
    main.appendChild(linkCard);

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
    var raiseCard = card("Автоподнятие", "Пока эта вкладка открыта, LLV отправляет POST /lots/raise. Ключ сессии не читается. В тихие часы запрос не уходит.");
    raiseCard.appendChild(toggle("Поднимать предложения", seller.autoRaise, function (on) { seller.autoRaise = on; saveSeller(); }));
    raiseCard.appendChild(field("Интервал, минут (не меньше 5)", String(seller.raiseMinutes || 30), function (value) { seller.raiseMinutes = value; saveSeller(); }));
    raiseCard.appendChild(toggle("Тихие часы", seller.quietOn, function (on) { seller.quietOn = on; saveSeller(); }));
    var hours = el("div", "llv-set-pair");
    hours.appendChild(field("С часа", seller.quietFrom || "", function (value) { seller.quietFrom = value; saveSeller(); }));
    hours.appendChild(field("До часа", seller.quietTo || "", function (value) { seller.quietTo = value; saveSeller(); }));
    raiseCard.appendChild(hours);
    main.appendChild(raiseCard);

    var now = card("Поднять сейчас", "Тот же запрос, что у кнопки «Поднять» на странице продавца.");
    var nowNote = note("Запрос ещё не отправлялся.");
    now.appendChild(button("Поднять сейчас", function () {
      var run = root.LLVLots && (root.LLVLots.raiseByRequest || root.LLVLots.raiseOnPage);
      if (!run) { nowNote.textContent = "На этой странице нет модуля лотов"; return; }
      nowNote.textContent = "Отправляем /lots/raise…";
      Promise.resolve(run(document)).then(function (result) {
        if (result && result.ok) nowNote.textContent = result.message || "Запрос отправлен: /lots/raise";
        else nowNote.textContent = (result && result.error) || "Не удалось поднять";
      });
    }));
    now.appendChild(nowNote);
    main.appendChild(now);

    var cardToggle = card("Карточка над таблицей", "Экспорт, импорт, клон, замена слова в названии и описании, выбор, цена и удаление остаются на карточке.");
    cardToggle.appendChild(toggle("Показывать карточку", seller.showCard !== false, function (on) { seller.showCard = on; saveSeller(); }));
    main.appendChild(cardToggle);

    var highlight = card("Подсветка своих лотов");
    highlight.appendChild(toggle("Подсвечивать свои строки", seller.highlight, function (on) { seller.highlight = on; saveSeller(); }));
    main.appendChild(highlight);

    var promo = card("Значки промо");
    promo.appendChild(toggle("Показывать значки промо-лотов", seller.promo, function (on) { seller.promo = on; saveSeller(); }));
    main.appendChild(promo);

    var money = card("Комиссия и реальная цена");
    money.appendChild(field("Комиссия раздела, %", seller.commission || "", function (value) { seller.commission = value; saveSeller(); }));
    money.appendChild(toggle("Показывать цену после комиссии", seller.realPrice, function (on) { seller.realPrice = on; saveSeller(); }));
    main.appendChild(money);

    var exact = card("Точная цена");
    exact.appendChild(toggle("Поле точной цены на форме лота", seller.exactOn !== false, function (on) { seller.exactOn = on; saveSeller(); }));
    main.appendChild(exact);

    var costCard = card("Себестоимость", "Сумма хранится в браузере и видна на карточке лота.");
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
        costCard.appendChild(select);
        costCard.appendChild(cost);
      } else {
        costCard.appendChild(note("Откройте раздел со своими лотами, чтобы записать себестоимость."));
      }
    } else {
      costCard.appendChild(note("Откройте раздел со своими лотами, чтобы записать себестоимость."));
    }
    main.appendChild(costCard);
  }

  function paintMessages(main) {
    var send = card("Отправка шаблона", "Шаблоны сами не уходят, пока это выключено.");
    send.appendChild(toggle("Отправлять шаблон самой", seller.autoSend, function (on) { seller.autoSend = on; saveSeller(); }));
    main.appendChild(send);

    var welcome = card("Приветствие", "Текст в новый чат на открытой странице заказа.");
    welcome.appendChild(toggle("Приветственное сообщение", seller.welcomeOn, function (on) { seller.welcomeOn = on; saveSeller(); }));
    welcome.appendChild(field("Текст приветствия", seller.welcome || "", function (value) { seller.welcome = value; saveSeller(); }, "area"));
    main.appendChild(welcome);

    var rule = seller.keywords[0] || { word: "", text: "" };
    var keyword = card("Ответ по слову", "Если в чате есть это слово, подставляется ответ.");
    keyword.appendChild(toggle("Автоответ по слову", seller.keywordsOn, function (on) { seller.keywordsOn = on; saveSeller(); }));
    keyword.appendChild(field("Слово", rule.word || "", function (value) {
      seller.keywords[0] = seller.keywords[0] || { word: "", text: "" };
      seller.keywords[0].word = value;
      saveSeller();
    }));
    keyword.appendChild(field("Ответ на слово", rule.text || "", function (value) {
      seller.keywords[0] = seller.keywords[0] || { word: "", text: "" };
      seller.keywords[0].text = value;
      saveSeller();
    }, "area"));
    main.appendChild(keyword);

    var thanks = card("После подтверждения", "Текст после статуса «Подтверждён» на открытой странице.");
    thanks.appendChild(toggle("Сообщение после подтверждения", seller.thanksOn, function (on) { seller.thanksOn = on; saveSeller(); }));
    thanks.appendChild(field("Текст после подтверждения", seller.thanks || "", function (value) { seller.thanks = value; saveSeller(); }, "area"));
    main.appendChild(thanks);

    var quickName = "";
    var quickText = "";
    var quick = card("Быстрые сообщения", "В чате заказа они открываются по «/».");
    quick.appendChild(field("Имя", "", function (value) { quickName = value; }));
    quick.appendChild(field("Текст", "", function (value) { quickText = value; }, "area"));
    quick.appendChild(button("Сохранить быстрое сообщение", function () {
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
      quick.appendChild(list);
    }
    main.appendChild(quick);

    var emoji = card("Эмодзи в чате", "На странице заказа под полем сообщения появляется ряд эмодзи.");
    main.appendChild(emoji);

    main.appendChild(disabledCard("Перевод сообщения", "Нужна сеть перевода. LLV не отправляет текст наружу."));
    main.appendChild(disabledCard("Ответ нейросетью", "Нужна сеть нейросети. LLV не отправляет текст наружу."));
  }

  function paintReviews(main) {
    ["1", "2", "3", "4", "5"].forEach(function (star) {
      var box = card("Шаблон на " + star, "Текст ответа, если оценка " + star + ".");
      box.appendChild(field("Текст отзыва", seller.reviews[star] || "", function (value) {
        seller.reviews[star] = value;
        saveSeller();
      }, "area"));
      main.appendChild(box);
    });
    var reply = card("Ответ по шаблону", "Подставляет текст в форму отзыва, которая уже открыта на странице.");
    reply.appendChild(button("Ответить по шаблону", function () {
      var form = null;
      document.querySelectorAll("form").forEach(function (item) {
        if (form || (item.closest && item.closest("#llv-settings"))) return;
        if (/отзыв/i.test(item.innerText || "") && item.querySelector("textarea")) form = item;
      });
      if (!form) { reply.appendChild(note("На странице нет ответа на отзыв")); return; }
      var stars = (document.body.innerText.match(/([1-5])\s*(?:из\s*5|звезд)/i) || [])[1] || "5";
      var text = seller.reviews[stars] || "";
      if (!text) { reply.appendChild(note("Нет шаблона для оценки " + stars)); return; }
      form.querySelector("textarea").value = text;
      reply.appendChild(note("Текст подставлен для оценки " + stars));
    }));
    main.appendChild(reply);
  }

  function paintSales(main) {
    var rows = visibleOrders();
    var sum = 0;
    var paid = [];
    rows.forEach(function (row) {
      if (row.amount !== null) sum += row.amount;
      if (row.paid) paid.push(row.id);
    });
    var stats = card("Заказы на экране", "Считаются только ссылки на заказы, которые уже видны.");
    stats.appendChild(note(rows.length + " заказов, " + Math.round(sum) + " ₽. Неподтверждённых: " + paid.length));
    main.appendChild(stats);

    var exportCard = card("Экспорт продаж", "JSON по заказам с этой страницы.");
    exportCard.appendChild(button("Экспорт продаж", function () { download("orders.json", JSON.stringify(rows, null, 2)); }));
    main.appendChild(exportCard);

    var unpaid = card("Неподтверждённые", "Номера заказов со статусом «Оплачен» копируются в буфер.");
    unpaid.appendChild(button("Скопировать неподтверждённые", function () {
      if (!paid.length) { unpaid.appendChild(note("Неподтверждённых на экране нет")); return; }
      copyText(paid.join("\n"));
      unpaid.appendChild(note("Скопировано: " + paid.length));
    }));
    main.appendChild(unpaid);

    var chartCard = card("График по дням", "Суммы заказов, которые видны на странице.");
    chartCard.appendChild(button("Показать график", function () {
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
      var old = chartCard.querySelector(".llv-chart");
      if (old) old.remove();
      chartCard.appendChild(chart);
    }, true));
    main.appendChild(chartCard);

    var support = card("Текст для поддержки", "Заявка не отправляется: текст только копируется.");
    support.appendChild(button("Скопировать текст", function () {
      var id = (location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/) || [])[1] || paid[0] || "";
      if (!id) { support.appendChild(note("Нет номера заказа")); return; }
      copyText("Прошу подтвердить выполнение заказа #" + id);
      support.appendChild(note("Текст скопирован."));
    }));
    main.appendChild(support);
  }

  function paintPurchases(main) {
    var foreign = root.LLVLots ? root.LLVLots.collectLots(document).foreign.length : 0;
    var count = card("Чужие лоты", "LLV считает только строки, которые уже видны в таблице.");
    count.appendChild(note("На экране чужих лотов: " + foreign + "."));
    main.appendChild(count);
    main.appendChild(disabledCard("Оформлять покупки", "LLV не нажимает «Купить»."));
  }

  function paintFinance(main) {
    var hide = card("Баланс на странице");
    hide.appendChild(toggle("Скрыть баланс", seller.hideBalance, function (on) { seller.hideBalance = on; saveSeller(); }));
    main.appendChild(hide);
    var tableCard = card("Операции", "Таблица со страницы баланса сохраняется в JSON.");
    tableCard.appendChild(button("Экспорт операций", function () {
      var table = document.querySelector("table");
      var around = location.pathname + " " + (document.body.innerText || "").slice(0, 400);
      if (!table || !/balance|финанс|баланс/i.test(around) || (table.closest && table.closest("#llv-settings"))) {
        tableCard.appendChild(note("Откройте страницу баланса"));
        return;
      }
      var lines = [];
      table.querySelectorAll("tr").forEach(function (row) {
        lines.push(Array.prototype.map.call(row.cells, function (cell) { return (cell.innerText || "").trim(); }));
      });
      download("balance.json", JSON.stringify(lines, null, 2));
    }));
    main.appendChild(tableCard);
  }

  function paintTheme(main) {
    var dark = card("Тёмная тема");
    dark.appendChild(toggle("Тёмная тема FunPay", seller.dark, function (on) { seller.dark = on; saveSeller(); }));
    main.appendChild(dark);
    var privacy = card("Приватность", "Прячет имя и суммы на открытой странице.");
    privacy.appendChild(toggle("Режим приватности", seller.privacy, function (on) { seller.privacy = on; saveSeller(); }));
    main.appendChild(privacy);
    var background = card("Свой фон");
    var file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.addEventListener("change", function () {
      readFile(file.files[0], 700000, function (url) {
        seller.background = url;
        saveSeller();
      });
    });
    background.appendChild(file);
    background.appendChild(button("Убрать фон", function () {
      seller.background = "";
      saveSeller();
      document.body.style.backgroundImage = "";
    }, true));
    main.appendChild(background);
  }

  function paintCustom(main) {
    var look = card("Оформление LLV", "Карточка лотов и эта страница остаются чёрными, со знаком LLV.");
    main.appendChild(look);
    main.appendChild(disabledCard("Стиль ника", "Нужен чужой сервис ника. LLV его не вызывает."));
    main.appendChild(disabledCard("Описание профиля", "Нужен чужой сервис профиля. LLV его не вызывает."));
  }

  function paintNotices(main) {
    var notice = card("Поднятие", "Короткая строка после запроса /lots/raise и в тихие часы.");
    notice.appendChild(toggle("Уведомление о поднятии", seller.raiseNotice, function (on) { seller.raiseNotice = on; saveSeller(); }));
    main.appendChild(notice);
    var sound = card("Звук нового заказа", "Файл хранится в браузере и играет, когда на странице появляется новый заказ.");
    var file = document.createElement("input");
    file.type = "file";
    file.accept = "audio/*";
    file.addEventListener("change", function () {
      readFile(file.files[0], 400000, function (url) {
        seller.sound = url;
        saveSeller();
      });
    });
    sound.appendChild(file);
    sound.appendChild(button("Проверить звук", function () {
      if (!seller.sound) { sound.appendChild(note("Сначала выберите звук")); return; }
      new Audio(seller.sound).play().catch(function () { sound.appendChild(note("Браузер не дал проиграть звук")); });
    }, true));
    main.appendChild(sound);
  }

  function paintApi(main) {
    var link = card("Supabase", "URL и anon key задаются в разделе «Смена».");
    link.appendChild(button("Открыть смену и подключение", function () {
      section = "shift";
      page.querySelectorAll("nav button").forEach(function (item) {
        item.classList.toggle("is-on", item.getAttribute("data-section") === "shift");
      });
      paintSection(page.querySelector(".llv-set-main"));
    }));
    main.appendChild(link);
    main.appendChild(disabledCard("Ключ сессии FunPay", "LLV не читает ключ сессии FunPay."));
    main.appendChild(disabledCard("Внешний API бота", "LLV работает на этой странице и с Supabase, который вы указали."));
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
