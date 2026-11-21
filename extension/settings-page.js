(function (root) {
  var SECTIONS = [
    ["offers", "Предложения"],
    ["messages", "Сообщения"],
    ["reviews", "Отзывы"],
    ["sales", "Продажи"],
    ["purchases", "Покупки"],
    ["finance", "Финансы"],
    ["theme", "Тема"],
    ["custom", "Кастомизация"],
    ["notices", "Уведомления"],
    ["api", "API"],
    ["shift", "Смена"]
  ];

  var connection = { url: "", key: "" };
  var goal = 0;
  var section = "offers";
  var page = null;
  var shared = null;
  var account = "";
  var pendingName = "";

  function S() {
    if (!shared) shared = root.LLV.defaults();
    return shared;
  }

  function set(changes) {
    shared = root.LLV.patch(changes);
    return shared;
  }

  function storage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.local;
  }

  function load(done) {
    var local = storage();
    if (!local || !local.get) { done(); return; }
    local.get(["llvSeller", "settings", "llvShiftGoal", "llvAccount"], function (data) {
      shared = root.LLV.clean(data && data.llvSeller);
      connection = (data && data.settings) || { url: "", key: "" };
      goal = Number(data && data.llvShiftGoal) || 0;
      account = String((data && data.llvAccount) || "");
      done();
    });
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

  function toggle(label, on, change, why) {
    var wrap = el("div", "llv-set-row");
    var row = el("label", "llv-set-toggle");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!on;
    input.addEventListener("change", function () { change(input.checked); });
    row.appendChild(input);
    row.appendChild(el("span", "", label));
    wrap.appendChild(row);
    if (why) wrap.appendChild(note(why));
    return wrap;
  }

  function field(label, value, change, kind, hint) {
    var wrap = el("label", "llv-set-field");
    wrap.appendChild(el("span", "", label));
    var input = document.createElement(kind === "area" ? "textarea" : "input");
    if (kind && kind !== "area") input.type = kind;
    if (!kind || kind === "area") input.type = "text";
    input.value = value == null ? "" : value;
    if (hint) input.placeholder = hint;
    input.addEventListener("input", function () { change(input.value); });
    wrap.appendChild(input);
    if (kind === "area") wrap.classList.add("is-area");
    return wrap;
  }

  function select(label, value, options, change) {
    var wrap = el("label", "llv-set-field");
    wrap.appendChild(el("span", "", label));
    var node = document.createElement("select");
    options.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      node.appendChild(option);
    });
    node.value = value;
    node.addEventListener("change", function () { change(node.value); });
    wrap.appendChild(node);
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

  function filePicker(label, accept, limit, onLoad) {
    var wrap = el("div", "llv-set-row");
    wrap.appendChild(el("span", "llv-set-note", label));
    var input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var asText = /json|csv/i.test(accept) || /\.(json|csv)$/i.test(file.name);
      root.LLV.readFile(file, limit, asText, function (data, f) { onLoad(data, f); });
    });
    wrap.appendChild(input);
    return wrap;
  }

  function host() {
    return document.querySelector(".container, main, #content") || document.body;
  }

  function conceal(parent) {
    Array.prototype.forEach.call(parent.children, function (child) {
      if (child.id === "llv-settings" || child.id === "llv-shift-root" || child.id === "llv-profile-panel" || child.dataset.llvHeld) return;
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

  function offerState() {
    var lots = root.LLVLots ? root.LLVLots.collectLots(document) : { lots: [], foreign: [] };
    return lots;
  }

  function paintOffers(main) {
    var raise = card("Автоподнятие предложений", "Автоматически поднимает все ваши лоты в каждом открытом разделе лотов, даже если вкладка свёрнута. Для работы не закрывайте браузер. Команда идёт из расширения, поэтому вкладку FunPay не нужно держать на переднем плане.");
    raise.appendChild(toggle("Поднимать предложения", S().autoRaise, function (on) {
      set({ autoRaise: on });
      if (on && root.LLVBackground) root.LLVBackground.start();
    }));
    raise.appendChild(field("Интервал, минут (не меньше 5)", String(S().raiseMinutes || 30), function (value) {
      set({ raiseMinutes: Math.max(5, Number(String(value).replace(",", ".")) || 30) });
    }, "number"));
    raise.appendChild(toggle("Тихие часы", S().quietOn, function (on) { set({ quietOn: on }); }, "Поднятие ждёт, пока не закончится ночной промежуток."));
    var hours = el("div", "llv-set-pair");
    hours.appendChild(field("С часа", S().quietFrom, function (value) { set({ quietFrom: value }); }, "number"));
    hours.appendChild(field("До часа", S().quietTo, function (value) { set({ quietTo: value }); }, "number"));
    raise.appendChild(hours);
    raise.appendChild(button("Поднять сейчас", function () {
      if (!root.LLVBackground) { note("Модуль фона не загрузился"); return; }
      if (!root.LLVLots.raiseTarget(document, location)) {
        raise.appendChild(note("Откройте раздел своих лотов: в адресе нужен номер раздела (/lots/…)."));
        return;
      }
      raise.appendChild(note("Отправляем…"));
      root.LLVBackground.raise();
    }, true));
    main.appendChild(raise);

    var notice = card("Уведомления о поднятии", "Показывать уведомление при каждом успешном поднятии: и для кнопки «Поднять все», и для автоподнятия. Отключите, если разделов очень много.");
    notice.appendChild(toggle("Уведомлять о поднятии", S().raiseNotice, function (on) { set({ raiseNotice: on }); }));
    main.appendChild(notice);

    var promo = card("Отображать значки промо-лотов", "Отображает все значки промо-лотов в таблице предложений, даже если они скрыты.");
    promo.appendChild(toggle("Показывать значки промо-лотов", S().promo, function (on) { set({ promo: on }); }));
    main.appendChild(promo);

    var highlight = card("Подсветка своих лотов", "В общей таблице раздела ваши лоты выделены цветом, их сразу видно среди чужих.");
    highlight.appendChild(toggle("Подсвечивать свои лоты", S().highlight, function (on) { set({ highlight: on }); }));
    main.appendChild(highlight);

    var exact = card("Точная цена", "Добавляет в окно редактирования лотов поля для ввода цены, отображаемой как для продавца, так и для покупателя.");
    exact.appendChild(toggle("Поле точной цены", S().exactOn !== false, function (on) { set({ exactOn: on }); }));
    exact.appendChild(field("Комиссия, %", S().commission || "", function (value) { set({ commission: value }); }, "text", "Например, 10"));
    main.appendChild(exact);

    var panel = card("Панель управления лотами в профиле", "Показывает на профилях FunPay панель «Управление лотами»: поиск лотов на любом профиле, клонирование лотов на чужом, а на вашем — также «Поднять все предложения», экспорт и импорт лотов.");
    panel.appendChild(toggle("Показывать панель на профилях", S().showCard !== false, function (on) { set({ showCard: on }); }));
    main.appendChild(panel);

    var english = card("Перевод лота на английский", "На странице редактирования лота появляется кнопка «Перевести на английский»: она заполняет английское название и описание по русскому оригиналу. Без внешнего сервиса переводит по словарю игровых терминов.");
    english.appendChild(field("Сервис перевода", S().tranBase || "", function (value) { set({ tranBase: value }); }, "text", "https://libretranslate.com (пусто — только словарь)"));
    english.appendChild(field("Ключ сервиса", S().tranKey || "", function (value) { set({ tranKey: value }); }, "password"));
    main.appendChild(english);

    var real = card("Реальные цены лотов", "Под ценой каждого лота в таблице раздела показывает реальную цену: сумму без комиссии FunPay и платёжных систем (сколько фактически получит продавец).");
    real.appendChild(toggle("Показывать реальную цену", S().realPrice, function (on) { set({ realPrice: on }); }));
    main.appendChild(real);

    var bulk = card("Массовое редактирование лотов", "На странице своих предложений и на своей странице профиля — кнопка «Выбрать лоты»: включить, выключить, изменить цену, клонировать или удалить сразу несколько лотов.");
    bulk.appendChild(note("Работает через панель «Управление лотами» и раздел «Лоты» в карточке."));
    main.appendChild(bulk);

    var ai = card("Заполнение лота нейросетью", "На форме предложения появляется кнопка «Написать текст лота»: нейросеть пишет название, описание и сообщение после оплаты по данным лота. Результат сначала показывается в окне, в лот ничего не попадает без нажатия.");
    ai.appendChild(select("Сервис", S().aiBase || "https://api.openai.com/v1", [
      ["https://api.openai.com/v1", "OpenAI"],
      ["https://openrouter.ai/api/v1", "OpenRouter"],
      ["https://api.deepseek.com/v1", "DeepSeek"],
      ["http://127.0.0.1:1234/v1", "Локальный (LM Studio)"],
      ["http://localhost:11434/v1", "Локальный (Ollama)"]
    ], function (value) { set({ aiBase: value }); }));
    ai.appendChild(field("Модель", S().aiModel || "", function (value) { set({ aiModel: value }); }, "text", "gpt-4o-mini"));
    ai.appendChild(field("Ключ API", S().aiKey || "", function (value) { set({ aiKey: value }); }, "password", "Ключ хранится только в браузере"));
    main.appendChild(ai);

    var fee = card("Комиссия раздела", "Показывает процент комиссии FunPay для раздела рядом с заголовком на странице ваших предложений.");
    fee.appendChild(note("Процент берётся из поля «Комиссия, %» выше."));
    fee.appendChild(toggle("Показывать комиссию", !!S().commission, function (on) { if (!on) set({ commission: "" }); else main.querySelector("input") && main.querySelector("input").focus(); }));
    main.appendChild(fee);

    var cost = card("Себестоимость лотов", "На странице редактирования лота появляется поле себестоимости с выбором валюты и показывается чистая прибыль. Себестоимость попадает в экспорт заказов.");
    var lots = offerState().lots;
    if (lots.length) {
      var picker = el("select", "llv-set-select");
      lots.forEach(function (lot) {
        var option = document.createElement("option");
        option.value = lot.id;
        option.textContent = lot.title || lot.id;
        picker.appendChild(option);
      });
      var costField = field("Себестоимость, ₽", S().costs[picker.value] || "", function (value) {
        var costs = Object.assign({}, S().costs);
        costs[picker.value] = value;
        set({ costs: costs });
      });
      picker.addEventListener("change", function () { costField.querySelector("input").value = S().costs[picker.value] || ""; });
      cost.appendChild(picker);
      cost.appendChild(costField);
    } else {
      cost.appendChild(note("Откройте раздел со своими лотами, чтобы записать себестоимость."));
    }
    main.appendChild(cost);

    var exportCard = card("Экспорт лотов", "На странице профиля появится кнопка «Экспорт лотов»: ваши лоты и валютные разделы сохраняются в один файл JSON или Excel (CSV открывается в Excel). На чужом профиле выгружает лоты продавца.");
    exportCard.appendChild(button("Экспорт JSON", function () {
      if (root.LLVLotsUI && root.LLVLotsUI.exportLots) root.LLVLotsUI.exportLots("json");
      else exportOffers("json");
    }, true));
    exportCard.appendChild(button("Экспорт Excel (CSV)", function () {
      if (root.LLVLotsUI && root.LLVLotsUI.exportLots) root.LLVLotsUI.exportLots("csv");
      else exportOffers("csv");
    }, true));
    main.appendChild(exportCard);

    var importCard = card("Импорт лотов", "Кнопка «Импорт лотов» создаёт лоты из ранее сохранённого файла и принимает оба формата, JSON и Excel (CSV). Существующие лоты не меняются: создаются только новые.");
    importCard.appendChild(filePicker("Файл лотов", "application/json,.json,.csv", 2000000, function (text) {
      if (root.LLVLotsUI && root.LLVLotsUI.importLots) {
        root.LLVLotsUI.importLots(text, function (message) { importCard.appendChild(note(message)); });
      } else {
        importCard.appendChild(note("Модуль лотов не загрузился"));
      }
    }));
    main.appendChild(importCard);

    var clone = card("Клонирование лотов", "Кнопка «Клонировать лот» на странице чужого лота, а на чужом профиле — клонирование нескольких лотов сразу. Переносятся описание, параметры, цена и картинки.");
    clone.appendChild(note("Если в разделе есть ваш лот, копия создаётся по нему. Картинки переносятся, когда форма FunPay это позволяет."));
    main.appendChild(clone);
  }

  function exportOffers(kind) {
    var lots = offerState();
    var rows = lots.lots.concat(lots.foreign).map(function (lot) {
      return { id: lot.id, title: lot.title, price: lot.price, currency: lot.currency || "₽" };
    });
    if (!rows.length) { root.LLV.toast("Лотов на странице нет"); return; }
    if (kind === "csv") {
      var lines = ["\uFEFFID;Название;Цена;Валюта"];
      rows.forEach(function (row) {
        lines.push([row.id, row.title, row.price, row.currency].map(function (value) {
          return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
        }).join(";"));
      });
      root.LLV.download("lots.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
      return;
    }
    root.LLV.download("lots.json", JSON.stringify(rows, null, 2), "application/json");
  }

  function paintMessages(main) {
    var emoji = card("Панель эмодзи", "Под полем сообщения в чате появляется кнопка «Эмодзи» с набором символов.");
    main.appendChild(emoji);

    var quick = card("Быстрые сообщения", "Напишите / (слэш) в чате, чтобы быстро отправить заранее подготовленные сообщения.");
    var quickName = "";
    var quickText = "";
    quick.appendChild(field("Имя", "", function (value) { quickName = value; }));
    quick.appendChild(field("Текст", "", function (value) { quickText = value; }, "area"));
    quick.appendChild(button("Сохранить сообщение", function () {
      if (!quickName || !quickText) { quick.appendChild(note("Нужны имя и текст")); return; }
      var list = S().quick.concat([{ title: quickName, text: quickText }]);
      set({ quick: list });
      paintSection(main, true);
    }));
    if (S().quick.length) {
      S().quick.forEach(function (item, index) {
        var row = el("div", "llv-set-item");
        row.appendChild(el("span", "", "/ " + item.title));
        row.appendChild(button("Удалить", function () {
          var list = S().quick.slice();
          list.splice(index, 1);
          set({ quick: list });
          paintSection(main, true);
        }, true));
        quick.appendChild(row);
      });
    }
    quick.appendChild(toggle("Отправлять шаблон самой", S().autoSend, function (on) { set({ autoSend: on }); }, "Если включено, шаблон из меню «/» сразу уходит в чат."));
    main.appendChild(quick);

    var welcome = card("Приветственное сообщение", "Автоматически отправляет заданное сообщение покупателю, который написал вам впервые (или снова — по истечении таймаута). Работает в фоне, пока запущен браузер.");
    welcome.appendChild(toggle("Приветствие", S().welcomeOn, function (on) { set({ welcomeOn: on }); }));
    welcome.appendChild(field("Текст приветствия", S().welcome, function (value) { set({ welcome: value }); }, "area"));
    welcome.appendChild(field("Таймаут, часов", String(S().welcomeTimeout || 24), function (value) { set({ welcomeTimeout: Number(value) || 24 }); }, "number"));
    main.appendChild(welcome);

    var rules = card("Автоответ по ключевым словам", "Автоматически отправляет ответ, когда сообщение покупателя точно совпадает с командой или содержит слово либо фразу.");
    rules.appendChild(toggle("Автоответ", S().keywordsOn, function (on) { set({ keywordsOn: on }); }));
    var word = "";
    var answer = "";
    var exact = false;
    rules.appendChild(field("Слово или фраза", "", function (value) { word = value; }, "text", "цена"));
    rules.appendChild(field("Ответ", "", function (value) { answer = value; }, "area"));
    rules.appendChild(toggle("Только точное совпадение", false, function (on) { exact = on; }));
    rules.appendChild(button("Добавить правило", function () {
      if (!word || !answer) { rules.appendChild(note("Нужны слово и ответ")); return; }
      set({ keywords: S().keywords.concat([{ word: word, text: answer, exact: exact }]) });
      paintSection(main, true);
    }));
    S().keywords.forEach(function (rule, index) {
      var row = el("div", "llv-set-item");
      row.appendChild(el("span", "", "«" + rule.word + "» → " + root.LLV.clip(rule.text, 60)));
      row.appendChild(button("Удалить", function () {
        var list = S().keywords.slice();
        list.splice(index, 1);
        set({ keywords: list });
        paintSection(main, true);
      }, true));
      rules.appendChild(row);
    });
    main.appendChild(rules);

    var thanks = card("Автоответ после подтверждения заказа", "Автоматически отправляет сообщение сразу после того, как покупатель подтвердил выполнение заказа.");
    thanks.appendChild(toggle("Сообщение после подтверждения", S().thanksOn, function (on) { set({ thanksOn: on }); }));
    thanks.appendChild(field("Текст", S().thanks, function (value) { set({ thanks: value }); }, "area"));
    main.appendChild(thanks);
  }

  function paintReviews(main) {
    var auto = card("Автоответ на отзывы", "Автоматически отправляет заданный ответ на отзыв покупателя к вашему заказу — свой текст для каждой оценки (1–5 звёзд).");
    auto.appendChild(toggle("Отвечать на отзывы автоматически", S().reviewsAuto, function (on) { set({ reviewsAuto: on }); }));
    ["5", "4", "3", "2", "1"].forEach(function (star) {
      auto.appendChild(field(star + " " + (Number(star) === 1 ? "звезда" : "звёзд") + " — текст", S().reviews[star], function (value) {
        var reviews = Object.assign({}, S().reviews);
        reviews[star] = value;
        set({ reviews: reviews });
      }, "area"));
    });
    auto.appendChild(button("Ответить на открытой странице", function () {
      var result = root.LLVReview.onPage();
      if (!result) { auto.appendChild(note("На странице нет формы ответа на отзыв")); return; }
      result.then(function (answer) {
        auto.appendChild(note("Подставлен ответ " + answer.rating + "★" + (answer.ai ? " (нейросеть)" : " (шаблон)")));
      });
    }, true));
    main.appendChild(auto);

    var ai = card("ИИ авто-ответ на отзыв покупателя", "Отвечает на отзыв текстом, который пишет нейросеть по словам самого покупателя. Если нейросеть недоступна, отправится ваш шаблон для этой оценки.");
    ai.appendChild(toggle("ИИ вместо шаблона", S().reviewAi, function (on) { set({ reviewAi: on }); }));
    ai.appendChild(note("Ключ и модель задаются в «Предложения → Заполнение лота нейросетью»."));
    main.appendChild(ai);
  }

  function paintSales(main) {
    var rows = root.LLVSales.collect(document, [/подтвержд|выполн|закрыт|заверш|возврат|спор|оплач/i]);
    var stats = root.LLVSales.stats(rows);
    var stat = card("Отображать статистику продаж", "Детальная статистика на странице Продажи: по дням, по статусам и по категориям.");
    stat.appendChild(toggle("Показывать статистику", S().salesStats, function (on) { set({ salesStats: on }); }));
    stat.appendChild(note(rows.length + " заказов на странице, " + root.LLV.money(stats.sum) + " ₽"));
    var chartBox = el("div", "llv-chart");
    stat.appendChild(chartBox);
    stat.appendChild(button("Показать график", function () { root.LLVSales.chart(chartBox, stats.days); }, true));
    main.appendChild(stat);

    var graphs = card("Графики продаж и покупок", "Выручка и заказы по дням, разбивка по категориям, статусам и валютам. Период выбирается, цифры считаются из ваших же заказов на странице.");
    graphs.appendChild(button("Категории", function () {
      root.LLVSales.chart(chartBox, root.LLVSales.groupBy(rows, "title"));
    }, true));
    main.appendChild(graphs);

    var copy = card("Копирование номера заказа", "На странице заказа добавляется Иконка копирования — нажмите, чтобы скопировать номер заказа.");
    copy.appendChild(toggle("Кнопка копирования", S().unpaidCopy, function (on) { set({ unpaidCopy: on }); }));
    main.appendChild(copy);

    var exportCard = card("Экспорт продаж", "Кнопка «Экспорт» на странице Продажи: JSON или Excel (CSV) с себестоимостью и прибылью.");
    exportCard.appendChild(button("Экспорт JSON", function () {
      var lots = root.LLVLots.collectLots(document).lots;
      var cost = {};
      lots.forEach(function (lot) { cost[lot.title] = Number(String(S().costs[lot.id] || "0").replace(",", ".")) || 0; });
      var data = rows.map(function (row) {
        var c = cost[row.title] || 0;
        return { id: row.id, title: row.title, status: row.status, date: row.date, amount: row.amount, cost: c, profit: row.amount === null ? null : Math.round((row.amount - c) * 100) / 100 };
      });
      root.LLV.download("sales.json", JSON.stringify(data, null, 2), "application/json");
    }, true));
    exportCard.appendChild(button("Экспорт Excel (CSV)", function () {
      root.LLV.download("sales.csv", root.LLVSales.toCsv(rows, [["id", "ID"], ["title", "Название"], ["status", "Статус"], ["date", "Дата"], ["amount", "Сумма"]]), "text/csv;charset=utf-8");
    }, true));
    main.appendChild(exportCard);

    var unpaid = card("Копировать ID неподтверждённых продаж", "Номера заказов, которые оплачены, но ещё не подтверждены.");
    unpaid.appendChild(toggle("Кнопка на странице Продажи", S().unpaidCopy, function (on) { set({ unpaidCopy: on }); }));
    unpaid.appendChild(button("Скопировать сейчас", function () {
      var ids = rows.filter(function (row) { return /оплач|paid/i.test(row.status) && !/подтвержд|выполн|закрыт|заверш/i.test(row.status); }).map(function (row) { return row.id; });
      if (!ids.length) { unpaid.appendChild(note("Неподтверждённых на странице нет")); return; }
      root.LLV.copyText(ids.join("\n"));
    }, true));
    main.appendChild(unpaid);

    var support = card("Заявки в поддержку на подтверждение заказов", "Если покупатель не подтверждает заказ, отправьте заявку в поддержку FunPay кнопкой на странице заказа — сразу или списком со страницы «Мои продажи».");
    support.appendChild(toggle("Кнопка на странице заказа", S().salesSupport, function (on) { set({ salesSupport: on }); }));
    support.appendChild(button("Проверить формы заявок на странице", function () {
      var result = root.LLVReview.pushOnPage();
      result.then(function (answer) {
        support.appendChild(note(answer.ok ? ("Отправлено заявок: " + answer.sent) : (answer.error || "Не удалось")));
      });
    }, true));
    main.appendChild(support);
  }

  function paintPurchases(main) {
    var rows = root.LLVSales.collect(document, []);
    var stats = root.LLVSales.stats(rows);
    var stat = card("Отображать статистику покупок", "Детальная статистика на странице Покупки: сколько заказов, на какую сумму, у кого.");
    stat.appendChild(toggle("Показывать статистику", S().purchasesStats, function (on) { set({ purchasesStats: on }); }));
    stat.appendChild(note(rows.length + " покупок на странице, " + root.LLV.money(stats.sum) + " ₽"));
    main.appendChild(stat);

    var exportCard = card("Экспорт покупок", "Кнопка «Экспорт» на странице Покупки: JSON или Excel (CSV).");
    exportCard.appendChild(toggle("Кнопка на странице Покупки", S().purchasesExport, function (on) { set({ purchasesExport: on }); }));
    exportCard.appendChild(button("Экспорт JSON", function () {
      root.LLV.download("purchases.json", JSON.stringify(rows, null, 2), "application/json");
    }, true));
    exportCard.appendChild(button("Экспорт Excel (CSV)", function () {
      root.LLV.download("purchases.csv", root.LLVSales.toCsv(rows, [["id", "ID"], ["title", "Название"], ["status", "Статус"], ["date", "Дата"], ["amount", "Сумма"]]), "text/csv;charset=utf-8");
    }, true));
    main.appendChild(exportCard);
  }

  function balanceRows() {
    var table = document.querySelector("table");
    if (!table) return [];
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (row) {
      if (row.querySelector("th")) return;
      var cells = Array.prototype.map.call(row.cells, function (cell) { return (cell.innerText || "").trim(); });
      if (cells.length < 2) return;
      var amounts = row.innerText.match(/[+-]?\s?\d[\d\s]*(?:[.,]\d{1,2})?\s*₽/g) || [];
      rows.push({ cells: cells, text: cells.join(" | "), amounts: amounts });
    });
    return rows;
  }

  function paintFinance(main) {
    var hide = card("Скрыть отображение баланса", "Прячет баланс за размытием: можно показывать экран, не открывая суммы в шапке.");
    hide.appendChild(toggle("Скрывать баланс", S().hideBalance, function (on) { set({ hideBalance: on }); }));
    main.appendChild(hide);

    var rows = balanceRows();
    var income = 0;
    var expense = 0;
    rows.forEach(function (row) {
      row.amounts.forEach(function (raw) {
        var value = Number(raw.replace(/\s/g, "").replace("−", "-").replace("₽", "").replace(",", "."));
        if (!isFinite(value)) return;
        if (value < 0) expense += -value;
        else income += value;
      });
    });
    var stats = card("Статистика финансов", "На странице баланса показывает статистику по операциям: поступления, расходы, чистый поток, разбивку по типам и график.");
    stats.appendChild(toggle("Показывать статистику", S().financeStats, function (on) { set({ financeStats: on }); }));
    stats.appendChild(note("Поступления " + root.LLV.money(income) + " ₽ · Расходы " + root.LLV.money(expense) + " ₽ · Чистый поток " + root.LLV.money(income - expense) + " ₽ · Операций " + rows.length));
    var box = el("div", "llv-chart");
    var days = {};
    rows.forEach(function (row) {
      var date = (row.text.match(/\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\.\d{1,2}\.\d{2}/) || [""])[0];
      row.amounts.forEach(function (raw) {
        var value = Number(raw.replace(/\s/g, "").replace("₽", "").replace(",", "."));
        if (isFinite(value)) days[date] = (days[date] || 0) + value;
      });
    });
    if (Object.keys(days).length) root.LLVSales.chart(box, days);
    stats.appendChild(box);
    main.appendChild(stats);

    var exportCard = card("Экспорт финансов", "Кнопка экспорта истории операций в Excel / JSON на странице баланса.");
    exportCard.appendChild(button("Экспорт JSON", function () {
      root.LLV.download("balance.json", JSON.stringify(rows.map(function (row) { return row.cells; }), null, 2), "application/json");
    }, true));
    exportCard.appendChild(button("Экспорт Excel (CSV)", function () {
      var lines = ["\uFEFF" + rows.slice(0, 1).map(function (row) { return row.cells.length; }).join("")];
      var out = [];
      rows.forEach(function (row) {
        out.push(row.cells.map(function (cell) { return '"' + cell.replace(/"/g, '""') + '"'; }).join(";"));
      });
      root.LLV.download("balance.csv", out.join("\r\n"), "text/csv;charset=utf-8");
    }, true));
    main.appendChild(exportCard);
  }

  function paintTheme(main) {
    var themes = root.LLVThemes;
    var pick = card("Выбор темы", "Светлая, Тёмная, Firewatch, Red Moon и ещё несколько цветовых наборов.");
    var grid = el("div", "llv-theme-grid");
    themes.list().forEach(function (id) {
      var theme = themes.byId(id);
      var cell = el("button", "llv-theme-cell" + (S().theme === id ? " is-on" : ""), "");
      cell.type = "button";
      cell.setAttribute("data-theme", id);
      var swatch = el("span", "llv-theme-swatch");
      swatch.style.background = theme.vars["--llv-bg"] || "#f7f7f7";
      swatch.style.borderColor = theme.accent;
      var dot = el("i", "");
      dot.style.background = theme.accent;
      swatch.appendChild(dot);
      cell.appendChild(swatch);
      cell.appendChild(el("span", "", theme.name));
      cell.addEventListener("click", function () {
        set({ theme: id, randomTheme: false });
        paintSection(main, true);
      });
      grid.appendChild(cell);
    });
    pick.appendChild(grid);
    pick.appendChild(toggle("Случайная тема под картинку", S().randomTheme, function (on) { set({ randomTheme: on }); }, "При каждой загрузке выбирается другой набор."));
    main.appendChild(pick);

    var wall = card("Фоны и наборы тем", "Галерея обоев, свои картинки и видео, жидкое стекло.");
    var walls = el("div", "llv-wall-grid");
    themes.walls().forEach(function (item) {
      var cell = el("button", "llv-wall-cell" + (S().background === "wall:" + item.id ? " is-on" : ""), "");
      cell.type = "button";
      var preview = el("span", item.css ? "llv-wall-preview is-wall" : "llv-wall-preview");
      if (item.css) preview.style.background = item.css;
      else preview.textContent = "—";
      cell.appendChild(preview);
      cell.appendChild(el("span", "", item.name));
      cell.addEventListener("click", function () {
        set({ background: item.id === "none" ? "" : "wall:" + item.id, glass: !!(item.glass || S().glass) });
        root.LLV.applyTheme();
        paintSection(main, true);
      });
      walls.appendChild(cell);
    });
    wall.appendChild(walls);
    wall.appendChild(filePicker("Своя картинка или видео", "image/*,video/mp4,video/webm", 8000000, function (data, file) {
      var isVideo = /^video\//.test(file.type);
      if (isVideo) {
        set({ backgroundVideo: data, background: "" });
      } else {
        set({ background: data, backgroundVideo: "" });
        if (S().randomTheme) {
          themes.colorFromImage(data, function (color) {
            if (!color) return;
            var dark = S().theme === "dark" || S().theme === "midnight";
            set({ glass: true });
            root.LLV.applyTheme();
            paintSection(main, true);
          });
        }
      }
      root.LLV.applyTheme();
      paintSection(main, true);
    }));
    wall.appendChild(toggle("Жидкое стекло", S().glass, function (on) { set({ glass: on }); }));
    wall.appendChild(button("Убрать фон", function () {
      set({ background: "", backgroundVideo: "" });
      root.LLV.applyTheme();
      paintSection(main, true);
    }, true));
    main.appendChild(wall);

    var privacy = card("Режим приватности", "Прячет за размытием ваш ник, ник собеседника, баланс и номера заказов — страницу можно скриншотить, ничего не закрашивая вручную. Наведите курсор на размытое, чтобы прочитать.");
    privacy.appendChild(toggle("Приватность", S().privacy, function (on) { set({ privacy: on }); }));
    main.appendChild(privacy);
  }

  function paintCustom(main) {
    var look = card("Оформление LLV", "Карточки, панель лотов и настройки используют цвета выбранной темы.");
    look.appendChild(toggle("Показывать карточку «Управление лотами»", S().showCard !== false, function (on) { set({ showCard: on }); }));
    look.appendChild(toggle("Подсветка своих лотов", S().highlight, function (on) { set({ highlight: on }); }));
    main.appendChild(look);

    var nick = card("Публичные стили ника", "FunPay показывает цвет ника рядом с вашим именем на всех страницах. Цвет берётся из оформления профиля, которое FunPay позволяет менять.");
    nick.appendChild(note("Стиль ника в FunPay задаётся цветом ника в настройках профиля. Здесь цвет применяется к вашему нику на страницах этого браузера."));
    nick.appendChild(field("Цвет вашего ника", S().nickColor || "", function (value) { set({ nickColor: value }); }, "color"));
    nick.appendChild(toggle("Подсвечивать ники собеседников их стилем", true, function () {}));
    main.appendChild(nick);

    var hideStyles = card("Скрывать стили ников", "Не показывать стили ников других пользователей вне их профилей.");
    hideStyles.appendChild(toggle("Скрывать чужие стили", S().hideNickStyles, function (on) { set({ hideNickStyles: on }); }));
    main.appendChild(hideStyles);

    var privacy = card("Режим приватности", "Прячет ник, баланс и номера заказов за размытием.");
    privacy.appendChild(toggle("Приватность", S().privacy, function (on) { set({ privacy: on }); }));
    main.appendChild(privacy);

    var about = card("Описание профиля", "Расскажите о себе — это описание хранится в браузере и показывается рядом с вашим ником на FunPay.");
    about.appendChild(field("Описание", S().about || "", function (value) { set({ about: value }); }, "area"));
    about.appendChild(toggle("Показывать описание рядом с ником", S().aboutOn, function (on) { set({ aboutOn: on }); }));
    main.appendChild(about);
  }

  function paintNotices(main) {
    var sound = card("Кастомный звук уведомлений", "Заменяет звук громкого уведомления чата на выбранный.");
    sound.appendChild(toggle("Не заменять звук FunPay", S().hideNotificationSound, function (on) { set({ hideNotificationSound: on }); }));
    sound.appendChild(filePicker("Звук уведомления", "audio/*", 600000, function (data) {
      set({ noticeSound: data });
      sound.appendChild(note("Звук сохранён"));
    }));
    sound.appendChild(button("Проверить", function () {
      if (!S().noticeSound) { sound.appendChild(note("Сначала выберите звук")); return; }
      new Audio(S().noticeSound).play().catch(function () { sound.appendChild(note("Браузер не дал проиграть звук")); });
    }, true));
    main.appendChild(sound);

    var order = card("Свой звук для нового заказа", "Проигрывает выбранный звук при новом заказе, даже если вкладка FunPay не открыта. Браузер должен быть запущен.");
    order.appendChild(toggle("Уведомлять о новом заказе", S().notifyOrder, function (on) { set({ notifyOrder: on }); }));
    order.appendChild(filePicker("Звук нового заказа", "audio/*", 600000, function (data) {
      set({ sound: data });
      order.appendChild(note("Звук сохранён"));
    }));
    order.appendChild(button("Проверить", function () {
      if (!S().sound) { order.appendChild(note("Сначала выберите звук")); return; }
      new Audio(S().sound).play().catch(function () { order.appendChild(note("Браузер не дал проиграть звук")); });
    }, true));
    main.appendChild(order);
  }

  function paintApi(main) {
    var key = card("Авторизация — Golden Key", "Golden Key — ключ сессии FunPay. Он даёт полный доступ к аккаунту, поэтому LLV его не читает и никуда не передаёт: все запросы идут через вашу же вкладку с её куками.");
    key.appendChild(note("Ключ остаётся в cookie браузера и не покидает FunPay."));
    main.appendChild(key);

    var external = card("Внешние сервисы", "Что LLV вызывает, кроме FunPay. Всё остальное работает без сети.");
    external.appendChild(note("Нейросеть: " + (S().aiBase || "не задана") + (S().aiKey ? " (ключ задан)" : " (без ключа)")));
    external.appendChild(note("Переводчик: " + (S().tranBase || "только словарь")));
    external.appendChild(note("Supabase для смен — раздел «Смена»."));
    main.appendChild(external);

    var db = card("Supabase", "URL и anon key задаются в разделе «Смена».");
    db.appendChild(button("Открыть смену и подключение", function () {
      section = "shift";
      page.querySelectorAll("nav button").forEach(function (item) {
        item.classList.toggle("is-on", item.getAttribute("data-section") === "shift");
      });
      paintSection(page.querySelector(".llv-set-main"));
    }));
    main.appendChild(db);
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

  function paintShift(main) {
    var shiftCard = card("Смена", "Имя берётся из шапки FunPay. Если его нет, впишите его здесь.");
    var status = note("Состояние смены читается…");
    var name = field("Имя сотрудника", account || pendingName, function (value) {
      pendingName = value;
      var local = storage();
      if (local && local.set) local.set({ llvAccount: value.trim() });
    });
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
        var worker = accountName() || pendingName || nameInput.value.trim();
        if (!worker) { status.textContent = "Введите имя аккаунта FunPay"; return; }
        root.chrome.runtime.sendMessage({ type: "startShift", name: worker }, function (next) { applyShift(next); });
      };
    }
    root.chrome.runtime.sendMessage({ type: "getState" }, applyShift);
  }

  function accountName() {
    var node = document.querySelector(".user-link-name, .user-link-name span");
    var name = node ? (node.textContent || "").replace(/\s+/g, " ").trim() : "";
    return name || account;
  }

  var painters = {
    offers: paintOffers,
    messages: paintMessages,
    reviews: paintReviews,
    sales: paintSales,
    purchases: paintPurchases,
    finance: paintFinance,
    theme: paintTheme,
    custom: paintCustom,
    notices: paintNotices,
    api: paintApi,
    shift: paintShift
  };

  function paintSection(main, keepScroll) {
    var scroll = keepScroll ? window.scrollY : 0;
    main.innerHTML = "";
    var entry = SECTIONS.filter(function (item) { return item[0] === section; })[0];
    main.appendChild(el("h2", "", entry ? entry[1] : ""));
    (painters[section] || paintOffers)(main);
    if (keepScroll) window.scrollTo(0, scroll);
  }

  function openTab(id) {
    section = id;
    if (!page) { open(); return; }
    page.querySelectorAll("nav button").forEach(function (item) {
      item.classList.toggle("is-on", item.getAttribute("data-section") === id);
    });
    paintSection(page.querySelector(".llv-set-main"));
  }

  function render() {
    var icon = "";
    try { icon = root.chrome.runtime.getURL("icons/icon.png"); } catch (error) { icon = ""; }
    page.innerHTML = "";
    page.classList.toggle("is-standalone", location.hostname !== "funpay.com");
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
        nav.querySelectorAll("button").forEach(function (other) { other.classList.toggle("is-on", other === link); });
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

  root.LLVSettings = { open: open, close: close, openTab: openTab };
})(typeof globalThis !== "undefined" ? globalThis : this);
