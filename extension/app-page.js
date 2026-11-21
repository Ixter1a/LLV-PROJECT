(function (root) {
  var registry = root.LLVRegistry;
  var active = "offers";

  var ICON_PATHS = {
    lab: "M12 3a3 3 0 013 3v5.2l4.4 7.1A2 2 0 0117.7 21H6.3a2 2 0 01-1.7-2.7L9 11.2V6a3 3 0 013-3z",
    lot: "M4 7h16M4 12h16M4 17h10",
    drop: "M12 3l4.6 5.6a6 6 0 11-9.2 0z",
    slider: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
    bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 20h4",
    wallet: "M3 8h18v11H3zM3 8l3-4h12l3 4M16 13h3",
    cash: "M3 6h18v12H3zM12 12h.01M7 12h.01M17 12h.01",
    chat: "M4 5h16v11H9l-5 4z",
    star: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z",
    cart: "M3 4h2l2.4 11h10.2L20 7H6M9 20h.01M18 20h.01",
    bag: "M5 8h14v12H5zM9 8V6a3 3 0 016 0v2",
    palette: "M12 3a9 9 0 100 18h1.5a2 2 0 001.5-3.3 2 2 0 011.5-3.3H19a3 3 0 003-3A9 9 0 0012 3zM8 9h.01M12 7h.01M7.5 13h.01",
    plug: "M9 3v5M15 3v5M6 8h12v4a6 6 0 01-12 0zM12 18v3",
    clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
    tools: "M4 20l7-7M14 4l6 6-3 3-6-6zM4 4l4 4"
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function S() {
    return root.LLV.current();
  }

  // Единая точка записи настроек. Пока Chrome не присылает изменение,
  // LLV.current() отдаёт старый снимок: вторая правка подряд взяла бы его и
  // затёрла первую. Поэтому заодно обновляем снимок через LLV.reload().
  function save(changes) {
    var next = Object.assign({}, S());
    Object.keys(changes).forEach(function (key) { next[key] = changes[key]; });
    // Сначала новое значение, потом storage: LLV.patch() сам сообщает
    // подписчикам, и они должны увидеть уже свежий снимок.
    if (root.LLV.reload) root.LLV.reload(next);
    return root.LLV.patch(changes);
  }

  function getValue(key) {
    if (!key) return undefined;
    if (key.indexOf(".") === -1) return S()[key];
    var head = key.split(".")[0];
    var tail = key.split(".")[1];
    var bucket = S()[head];
    return bucket ? bucket[tail] : undefined;
  }

  function setField(key, value) {
    var changes = {};
    if (key.indexOf(".") === -1) {
      changes[key] = value;
    } else {
      var head = key.split(".")[0];
      var tail = key.split(".")[1];
      changes[head] = Object.assign({}, S()[head] || {});
      changes[head][tail] = value;
    }
    save(changes);
  }

  // Действия, которые выполняются на открытой вкладке FunPay: у нас нет DOM
  // сайта, поэтому каждое из них — сообщение в content-скрипт.
  var appActions = {
    snapshot: function () { return inFunpay("snapshot"); },
    topbar: function () { return inFunpay("topbar"); },
    settings: function (changes) { return inFunpay("settings", { changes: changes }); },
    raise: function () { return inFunpay("raise"); },
    bulk: function () { return inFunpay("bulk"); }
  };

  function once(fn) {
    var done = false;
    return function () {
      if (done) return;
      done = true;
      return fn.apply(null, arguments);
    };
  }

  function toast(text) {
    var node = document.getElementById("llv-app-toast");
    if (!node) {
      node = el("div", "llv-app-toast");
      node.id = "llv-app-toast";
      document.body.appendChild(node);
    }
    node.textContent = text;
    node.classList.add("is-on");
    clearTimeout(node.__timer);
    node.__timer = setTimeout(function () { node.classList.remove("is-on"); }, 3200);
  }

  function contentUrl(name) {
    try { return root.chrome.runtime.getURL(name); } catch (error) { return name; }
  }

  /* ---------- Синхронизация со вкладкой FunPay ---------- */

  function funpayTab() {
    return new Promise(function (resolve) {
      if (!root.chrome || !root.chrome.tabs || !root.chrome.tabs.query) { resolve(null); return; }
      root.chrome.tabs.query({ url: "https://funpay.com/*" }, function (tabs) {
        var list = tabs || [];
        var best = null;
        list.forEach(function (tab) {
          if (!best && /\/lots\/\d+/.test(tab.url || "")) best = tab;
        });
        resolve(best || list[0] || null);
      });
    });
  }

  function inFunpay(fn, payload) {
    return funpayTab().then(function (tab) {
      if (!tab) return { ok: false, error: "Откройте FunPay в соседней вкладке — эта страница работает без сайта." };
      return new Promise(function (resolve) {
        var finish = once(resolve);
        root.chrome.tabs.sendMessage(tab.id, { type: "llvApp", fn: fn, payload: payload || {} }, function (response) {
          if (root.chrome.runtime.lastError || !response) {
            finish({ ok: false, error: "Вкладка FunPay не ответила. Обновите её и попробуйте снова." });
            return;
          }
          finish(response);
        });
      });
    });
  }

  // Обработчика ошибки нет: если storage не ответил, колбэк всё равно придёт
  // с lastError, а done вызывается здесь.
  function loadExtras(done) {
    var local = root.chrome && root.chrome.storage && root.chrome.storage.local;
    if (!local || !local.get) { done(); return; }
    local.get(["settings", "llvShiftGoal", "llvAccount"], function (data) {
      if (root.chrome.runtime && root.chrome.runtime.lastError) { done(); return; }
      connection = (data && data.settings) || { url: "", key: "" };
      goal = Number(data && data.llvShiftGoal) || 0;
      account = String((data && data.llvAccount) || "");
      done();
    });
  }

  // Без колбэка Chrome выбрасывает ошибку «The message port closed»,
  // если service worker проснулся и не успел ответить.
  function tell(message, done) {
    if (!root.chrome || !root.chrome.runtime || !root.chrome.runtime.sendMessage) return;
    root.chrome.runtime.sendMessage(message, function (answer) {
      if (root.chrome.runtime.lastError) { if (done) done(null); return; }
      if (done) done(answer || null);
    });
  }

  var connection = { url: "", key: "" };
  var goal = 0;
  var account = "";

  function storage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.local;
  }

  /* ---------- Сборка блоков ---------- */

  // Иконки в SVG: у самого svg размер нужен явно, иначе Chrome
  // растягивает его на всю ширину ячейки.
  function iconFor(name) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "19");
    svg.setAttribute("height", "19");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.slider);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  // Ядро тумблера: <label> со вложенным чекбоксом и треком. Оформление не
  // тут, а в app.css — карточка снимает класс llv-app-switch и ведёт тумблер
  // по классам llv-app-card-switch, поля и трек при этом остаются прежними.
  function switchCore(on, change) {
    var label = document.createElement("label");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!on;
    label.addEventListener("change", function (event) {
      if (event.target === input) change(input.checked);
    });
    label.appendChild(input);
    var track = el("span", "llv-app-track");
    track.appendChild(el("i"));
    label.appendChild(track);
    return label;
  }

  function toggleRow(label, on, change, hint) {
    // Строка — <label>: в Chrome клик по треку или подписи переключает
    // вложенный чекбокс сам, приходит одно событие change. Второй обработчик
    // click здесь не нужен — он только переключал бы тумблер дважды.
    var row = switchCore(on, change);
    row.className = "llv-app-switch";
    row.insertBefore(el("span", "llv-app-switch-text", label), row.lastChild);
    if (hint) {
      var wrap = el("div", "llv-app-toggle-wrap");
      wrap.appendChild(row);
      wrap.appendChild(el("p", "llv-app-hint", hint));
      return wrap;
    }
    return row;
  }

  function inputRow(spec) {
    var wrap = el("div", "llv-app-field" + (spec.half ? " is-half" : ""));
    wrap.appendChild(el("span", "", spec.label));
    var input;
    if (spec.kind === "area") input = document.createElement("textarea");
    else if (spec.kind === "select") input = document.createElement("select");
    else input = document.createElement("input");
    if (spec.kind === "number") input.type = "number";
    else if (spec.kind === "password") input.type = "password";
    else if (spec.kind === "color") input.type = "color";
    if (spec.kind === "select") {
      (spec.options || []).forEach(function (item) {
        var option = document.createElement("option");
        option.value = item[0];
        option.textContent = item[1];
        input.appendChild(option);
      });
    }
    var value = getValue(spec.key);
    if (value === undefined || value === null) value = spec.def !== undefined ? spec.def : "";
    input.value = spec.kind === "color" && !/^#/.test(String(value)) ? "#7c3aed" : value;
    if (spec.hint) input.placeholder = spec.hint;
    input.addEventListener(spec.kind === "select" ? "change" : "input", function () {
      var next = spec.parse ? spec.parse(input.value) : input.value;
      setField(spec.key, next);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function buttonRow(label, onClick, tone) {
    var node = el("button", "llv-app-btn" + (tone ? " is-" + tone : ""), label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function filePicker(spec, onLoad) {
    var wrap = el("label", "llv-app-file");
    wrap.appendChild(el("span", "", spec.label));
    var input = document.createElement("input");
    input.type = "file";
    input.accept = spec.accept;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var asText = /json|csv/i.test(spec.accept) || /\.(json|csv)$/i.test(file.name);
      root.LLV.readFile(file, 8000000, asText, function (data, picked) { onLoad(data, picked); });
      input.value = "";
    });
    wrap.appendChild(input);
    return wrap;
  }

  function listRow(label, onRemove) {
    var row = el("div", "llv-app-list-row");
    row.appendChild(el("span", "", label));
    row.appendChild(buttonRow("Удалить", onRemove, "quiet"));
    return row;
  }

  function miniRow(label, value) {
    var row = el("div", "llv-app-mini");
    row.appendChild(el("span", "", label));
    row.appendChild(el("b", "", value));
    return row;
  }

  // В приложении нет DOM FunPay, поэтому перерисовку после переключения
  // запускаем здесь через вкладку. Ответ не ждём: настроек достаточно.
  function refreshFunpay(changes) {
    (function push(attempt) {
      appActions.settings(changes).then(function (answer) {
        if (answer && answer.ok) return;
        if (attempt < 2) {
          setTimeout(function () { push(attempt + 1); }, 600 * (attempt + 1));
        }
      }, function () { /* вкладки нет — применится при следующей загрузке */ });
    })(0);
  }

  /* ---------- Виджеты ---------- */

  var painters = {
    widgetToggle: function (box) {
      var spec = box.__cardSpec || {};
      var value = box.__cardValue;
      box.appendChild(toggleRow(spec.label || "", value, function (on) {
        var changes = {};
        changes[spec.key] = on;
        save(changes);
        refreshFunpay(changes);
      }));
    },

    quick: function (box) {
      var name = "";
      var text = "";
      function add() {
        if (!name || !text) { toast("Нужны имя и текст"); return; }
        save({ quick: S().quick.concat([{ title: name, text: text }]) });
        repaint();
      }
      var nameWrap = el("label", "llv-app-field");
      nameWrap.appendChild(el("span", "", "Имя"));
      var nameInput = document.createElement("input");
      nameInput.placeholder = "Доставка";
      nameInput.addEventListener("input", function () { name = nameInput.value; });
      nameWrap.appendChild(nameInput);
      box.appendChild(nameWrap);
      var textInput = document.createElement("textarea");
      textInput.placeholder = "Текст сообщения";
      textInput.addEventListener("input", function () { text = textInput.value; });
      var textWrap = el("label", "llv-app-field");
      textWrap.appendChild(el("span", "", "Текст"));
      textWrap.appendChild(textInput);
      box.appendChild(textWrap);
      box.appendChild(buttonRow("Сохранить сообщение", add));
      S().quick.forEach(function (item, index) {
        box.appendChild(listRow("/ " + item.title, function () {
          var list = S().quick.slice();
          list.splice(index, 1);
          save({ quick: list });
          repaint();
        }));
      });
    },

    keywords: function (box) {
      var word = "";
      var answer = "";
      var exact = false;
      var wordWrap = el("label", "llv-app-field");
      wordWrap.appendChild(el("span", "", "Слово или фраза"));
      var wordInput = document.createElement("input");
      wordInput.placeholder = "цена";
      wordInput.addEventListener("input", function () { word = wordInput.value; });
      wordWrap.appendChild(wordInput);
      box.appendChild(wordWrap);
      var answerWrap = el("label", "llv-app-field");
      answerWrap.appendChild(el("span", "", "Ответ"));
      var answerInput = document.createElement("textarea");
      answerInput.addEventListener("input", function () { answer = answerInput.value; });
      answerWrap.appendChild(answerInput);
      box.appendChild(answerWrap);
      box.appendChild(toggleRow("Только точное совпадение", false, function (on) { exact = on; }));
      box.appendChild(buttonRow("Добавить правило", function () {
        if (!word || !answer) { toast("Нужны слово и ответ"); return; }
        save({ keywords: S().keywords.concat([{ word: word, text: answer, exact: exact }]) });
        repaint();
      }));
      S().keywords.forEach(function (rule, index) {
        box.appendChild(listRow("«" + rule.word + "» → " + root.LLV.clip(rule.text, 60), function () {
          var list = S().keywords.slice();
          list.splice(index, 1);
          save({ keywords: list });
          repaint();
        }));
      });
    },

    costs: function (box) {
      var options = [];
      if (window.__LLV_LIVE_LOTS) window.__LLV_LIVE_LOTS.forEach(function (lot) { options.push(lot); });
      if (!options.length) {
        box.appendChild(el("p", "llv-app-hint", "Откройте на FunPay раздел со своими лотами — кнопка слева «Лоты на странице». Тогда список лотов появится здесь с адресами."));
      } else {
        var picker = document.createElement("select");
        options.forEach(function (lot) {
          var option = document.createElement("option");
          option.value = lot.id;
          option.textContent = lot.title || lot.id;
          picker.appendChild(option);
        });
        box.appendChild(picker);
      }
      var saved = options.length ? options.filter(function (lot) { return S().costs[lot.id] !== undefined; }) : [];
      saved.forEach(function (lot) {
        box.appendChild(miniRow(lot.title || lot.id, root.LLV.money(S().costs[lot.id] || 0) + " ₽"));
      });
      if (!saved.length) box.appendChild(el("p", "llv-app-hint", "Себестоимость задаётся на открытой FunPay прямо на форме лота."));
    },

    salesChart: function (box) {
      var rows = liveRows();
      var stats = root.LLVSales.stats(rows);
      box.appendChild(miniRow(rows.length + " заказов на странице FunPay", root.LLV.money(stats.sum) + " ₽"));
      var chart = el("div", "llv-app-chart");
      box.appendChild(chart);
      if (Object.keys(stats.days || {}).length) root.LLVSales.chart(chart, stats.days);
      else box.appendChild(el("p", "llv-app-hint", "Откройте страницу «Продажи» на FunPay, чтобы увидеть график по дням."));
    },

    purchasesLine: function (box) {
      var rows = liveRows();
      var stats = root.LLVSales.stats(rows);
      box.appendChild(miniRow("Покупок на странице FunPay", String(rows.length)));
      box.appendChild(miniRow("Сумма", root.LLV.money(stats.sum) + " ₽"));
    },

    financeLine: function (box) {
      var data = balanceTotals();
      box.appendChild(miniRow("Поступления", root.LLV.money(data.income) + " ₽"));
      box.appendChild(miniRow("Расходы", root.LLV.money(data.expense) + " ₽"));
      box.appendChild(miniRow("Чистый поток", root.LLV.money(data.income - data.expense) + " ₽"));
      box.appendChild(miniRow("Операций", String(data.rows.length)));
      if (!data.rows.length) box.appendChild(el("p", "llv-app-hint", "Откройте страницу баланса на FunPay, чтобы посчитать операции."));
    },

    external: function (box) {
      box.appendChild(miniRow("Нейросеть", (S().aiBase || "не задана") + (S().aiKey ? " · ключ есть" : " · без ключа")));
      box.appendChild(miniRow("Переводчик", S().tranBase || "только словарь"));
      box.appendChild(miniRow("Supabase", connection.url ? "задан" : "не задан"));
    },

    promo: function (box) {
      box.appendChild(toggleRow("Показывать значки промо-лотов", S().showPromo || S().promo, function (on) {
        save({ showPromo: on, promo: on });
        refreshFunpay({ showPromo: on, promo: on });
      }));
      box.appendChild(el("p", "llv-app-hint", "На открытой вкладке FunPay значки промо тоже станут видны."));
    },

    highlight: function (box) {
      box.appendChild(toggleRow("Подсвечивать свои лоты", S().highlight, function (on) {
        save({ highlight: on });
        refreshFunpay({ highlight: on });
      }));
      box.appendChild(el("p", "llv-app-hint", "Ваши лоты в общей таблице раздела выделяются рамкой."));
    },

    themeGrid: function (box) {
      var themes = root.LLVThemes;
      var grid = el("div", "llv-app-themes");
      themes.list().forEach(function (id) {
        var theme = themes.byId(id);
        var cell = el("button", "llv-app-theme" + (S().theme === id ? " is-on" : ""));
        cell.type = "button";
        var swatch = el("span", "llv-app-swatch");
        swatch.style.background = theme.vars["--llv-bg"] || "#f4f4f5";
        swatch.appendChild(el("i")).style.background = theme.accent;
        cell.appendChild(swatch);
        cell.appendChild(el("span", "", theme.name));
        cell.addEventListener("click", function () {
          save({ theme: id, randomTheme: false });
          applyChrome();
          repaint();
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    },

    wallGrid: function (box) {
      var grid = el("div", "llv-app-walls");
      root.LLVThemes.walls().forEach(function (item) {
        var cell = el("button", "llv-app-wall" + (S().background === "wall:" + item.id ? " is-on" : ""));
        cell.type = "button";
        var preview = el("span", "llv-app-wall-preview");
        if (item.css) preview.style.background = item.css;
        else preview.classList.add("is-none");
        cell.appendChild(preview);
        cell.appendChild(el("span", "", item.name));
        cell.addEventListener("click", function () {
          save({ background: item.id === "none" ? "" : "wall:" + item.id, glass: !!(item.glass || S().glass) });
          applyChrome();
          repaint();
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    },

    shift: function (box) {
      var status = el("p", "llv-app-status", "Состояние смены читается…");
      var button = buttonRow("Начать смену", function () {}, "primary");
      var nameInput = document.createElement("input");
      nameInput.placeholder = "Имя сотрудника FunPay";
      nameInput.value = account;
      nameInput.addEventListener("input", function () {
        account = nameInput.value;
        var local = storage();
        if (local && local.set) local.set({ llvAccount: nameInput.value.trim() });
      });
      var nameWrap = el("label", "llv-app-field");
      nameWrap.appendChild(el("span", "", "Имя сотрудника"));
      nameWrap.appendChild(nameInput);
      box.appendChild(nameWrap);
      box.appendChild(status);
      box.appendChild(button);

      function apply(state) {
        var active = state && state.shift && state.shift.active;
        button.textContent = active ? "Завершить смену" : "Начать смену";
        button.className = "llv-app-btn " + (active ? "is-danger" : "is-primary");
        status.textContent = describeShift(state);
        var progress = box.querySelector(".llv-app-progress");
        if (progress) progress.remove();
        var note = box.querySelector(".llv-app-goal-line");
        if (note) note.remove();
        if (active && goal > 0) {
          var rub = Number(state.shift.salesRub || 0);
          var share = Math.max(0, Math.min(1, rub / goal));
          var line = el("div", "llv-app-progress");
          var bar = el("span", "llv-app-progress-bar");
          bar.style.width = Math.round(share * 100) + "%";
          line.appendChild(bar);
          box.appendChild(line);
          var info = el("p", "llv-app-hint llv-app-goal-line",
            (state.shift.salesCount || 0) + " шт · " + root.LLV.money(rub) + " ₽ · прибыль " +
            root.LLV.money(Math.round(rub * 0.1 * 100) / 100) + " ₽ · " +
            (rub >= goal ? "цель достигнута" : ("осталось " + root.LLV.money(goal - rub) + " ₽")));
          box.appendChild(info);
        }
        button.onclick = function () {
          if (active) { tell({ type: "endShift" }, apply); return; }
          var worker = nameInput.value.trim() || account;
          if (!worker) { status.textContent = "Введите имя аккаунта FunPay"; nameInput.focus(); return; }
          tell({ type: "startShift", name: worker }, apply);
        };
      }
      tell({ type: "getState" }, apply);
    },

    goal: function (box) {
      var input = document.createElement("input");
      input.type = "number";
      input.value = goal ? String(goal) : "";
      input.placeholder = "Например, 50000";
      input.addEventListener("input", function () {
        goal = Number(String(input.value).replace(",", ".")) || 0;
        var local = storage();
        if (local && local.set) local.set({ llvShiftGoal: goal });
      });
      var wrap = el("label", "llv-app-field");
      wrap.appendChild(el("span", "", "Цель, ₽"));
      wrap.appendChild(input);
      box.appendChild(wrap);
    },

    supabase: function (box) {
      var urlInput = document.createElement("input");
      urlInput.placeholder = "https://xxxx.supabase.co";
      urlInput.value = connection.url || "";
      urlInput.addEventListener("input", function () { connection.url = urlInput.value; });
      var keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.placeholder = "anon key";
      keyInput.value = connection.key || "";
      keyInput.addEventListener("input", function () { connection.key = keyInput.value; });
      var urlWrap = el("label", "llv-app-field");
      urlWrap.appendChild(el("span", "", "URL Supabase"));
      urlWrap.appendChild(urlInput);
      var keyWrap = el("label", "llv-app-field");
      keyWrap.appendChild(el("span", "", "Anon key"));
      keyWrap.appendChild(keyInput);
      var status = el("p", "llv-app-status", "");
      box.appendChild(urlWrap);
      box.appendChild(keyWrap);
      box.appendChild(buttonRow("Сохранить подключение", function () {
        tell({ type: "saveSettings", url: connection.url, key: connection.key }, function (state) {
          status.textContent = describeShift(state);
        });
      }, "primary"));
      box.appendChild(buttonRow("Отправить очередь", function () {
        tell({ type: "flush" }, function (state) {
          status.textContent = describeShift(state);
        });
      }, "quiet"));
      box.appendChild(status);
    }
  };

  function describeShift(state) {
    if (!state) return "Нет ответа от расширения";
    if (state.ok === false) return state.error || "Не удалось прочитать состояние";
    var parts = [];
    parts.push(state.shift && state.shift.active ? ("Смена идёт: " + state.shift.workerName) : "Активной смены нет");
    if (!state.configured) parts.push(state.pending ? ("В очереди " + state.pending) : "Ключи не заданы, события копятся на этом компьютере");
    else if (state.pending) parts.push("В очереди " + state.pending);
    if (state.lastError) parts.push(state.lastError);
    return parts.join(". ") + ".";
  }

  /* ---------- Живые данные из вкладки FunPay ---------- */

  var live = {
    lots: [],
    orders: [],
    balance: { income: 0, expense: 0, rows: [] },
    ready: false
  };

  window.__LLV_LIVE_LOTS = live.lots;

  function liveRows() {
    return live.orders || [];
  }

  function balanceTotals() {
    return live.balance || { income: 0, expense: 0, rows: [] };
  }

  function parseBalance(rows) {
    var income = 0;
    var expense = 0;
    (rows || []).forEach(function (row) {
      (row.amounts || []).forEach(function (raw) {
        var value = Number(String(raw).replace(/\s/g, "").replace("−", "-").replace("₽", "").replace(",", "."));
        if (!isFinite(value)) return;
        if (value < 0) expense += -value;
        else income += value;
      });
    });
    return { income: income, expense: expense, rows: rows || [] };
  }

  function pullLive() {
    return inFunpay("snapshot").then(function (response) {
      if (!response || !response.ok || !response.data) return;
      live.lots = response.data.lots || [];
      live.orders = response.data.orders || [];
      live.balance = parseBalance(response.data.balance || []);
      window.__LLV_LIVE_LOTS = live.lots;
      live.ready = true;
      var main = document.getElementById("llv-app-main");
      // Перерисовка не должна портить шапку и список, если данные неполные.
      if (main) {
        try {
          paintSection(main);
        } catch (error) {
          if (root.console && console.error) console.error("LLV: раздел", error);
        }
      }
    });
  }

  /* ---------- Действия ---------- */

  var actions = {
    lotsJson: function () { exportLots("json", live.lots); },
    lotsCsv: function () { exportLots("csv", live.lots); },
    pageLotsJson: function () { exportLots("json", live.lots); },
    pageLotsCsv: function () { exportLots("csv", live.lots); },

    importLots: function (data, file) {
      var text = typeof data === "string" ? data : "";
      if (!text) { toast("Файл прочитан как картинка. Нужен JSON или CSV"); return; }
      var parsed;
      try {
        if (/^\s*[\[{]/.test(text)) parsed = JSON.parse(text);
        else parsed = parseCsvLots(text);
      } catch (error) {
        toast("Не удалось прочитать файл: " + (error.message || "ошибка"));
        return;
      }
      var rows = Array.isArray(parsed) ? parsed : (parsed && parsed.lots) || [];
      if (!rows.length) { toast("В файле нет лотов"); return; }
      toast("Лотов в файле: " + rows.length + ". Открываю FunPay для создания.");
      inFunpay("importLots", { rows: rows }).then(function (response) {
        toast(response && response.ok ? ("Создано лотов: " + response.created) : ((response && response.error) || "Не удалось импортировать"));
      });
    },

    reviewPage: function () {
      toast("Открываю форму отзыва на FunPay и подставляю текст");
      inFunpay("reviewPage").then(function (response) {
        toast(response && response.ok ? ("Подставлен ответ " + response.rating + "★" + (response.ai ? " (нейросеть)" : " (шаблон)")) : ((response && response.error) || "Не удалось"));
      });
    },

    chartDays: function () { toast("График по дням строится в карточке «Статистика продаж»"); },
    chartTitles: function () { toast("Категории видны на странице продаж FunPay"); },

    salesJson: function () {
      var cost = costsByTitle();
      var data = live.orders.map(function (row) {
        var c = cost[row.title] || 0;
        return { id: row.id, title: row.title, status: row.status, date: row.date, amount: row.amount, cost: c, profit: row.amount === null ? null : Math.round((row.amount - c) * 100) / 100 };
      });
      if (!data.length) { toast("Откройте страницу «Продажи» на FunPay"); return; }
      root.LLV.download("sales.json", JSON.stringify(data, null, 2), "application/json");
    },

    salesCsv: function () {
      if (!live.orders.length) { toast("Откройте страницу «Продажи» на FunPay"); return; }
      root.LLV.download("sales.csv", root.LLVSales.toCsv(live.orders, [["id", "ID"], ["title", "Название"], ["status", "Статус"], ["date", "Дата"], ["amount", "Сумма"]]), "text/csv;charset=utf-8");
    },

    unpaidIds: function () {
      var ids = live.orders.filter(function (row) {
        return /оплач|paid/i.test(row.status) && !/подтвержд|выполн|закрыт|заверш/i.test(row.status);
      }).map(function (row) { return row.id; });
      if (!ids.length) { toast("Неподтверждённых на странице нет"); return; }
      root.LLV.copyText(ids.join("\n"));
    },

    supportForms: function () {
      inFunpay("supportForms").then(function (response) {
        toast(response && response.ok ? ("Отправлено заявок: " + response.sent) : ((response && response.error) || "Не удалось"));
      });
    },

    buyJson: function () {
      if (!live.orders.length) { toast("Откройте страницу «Покупки» на FunPay"); return; }
      root.LLV.download("purchases.json", JSON.stringify(live.orders, null, 2), "application/json");
    },

    buyCsv: function () {
      if (!live.orders.length) { toast("Откройте страницу «Покупки» на FunPay"); return; }
      root.LLV.download("purchases.csv", root.LLVSales.toCsv(live.orders, [["id", "ID"], ["title", "Название"], ["status", "Статус"], ["date", "Дата"], ["amount", "Сумма"]]), "text/csv;charset=utf-8");
    },

    moneyJson: function () {
      var rows = (live.balance.rows || []).map(function (row) { return row.cells; });
      if (!rows.length) { toast("Откройте страницу баланса на FunPay"); return; }
      root.LLV.download("balance.json", JSON.stringify(rows, null, 2), "application/json");
    },

    moneyCsv: function () {
      var rows = live.balance.rows || [];
      if (!rows.length) { toast("Откройте страницу баланса на FunPay"); return; }
      var out = rows.map(function (row) {
        return row.cells.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(";");
      });
      root.LLV.download("balance.csv", "\uFEFF" + out.join("\r\n"), "text/csv;charset=utf-8");
    },

    wall: function (data, file) {
      var isVideo = /^video\//.test(file.type);
      if (isVideo) save({ backgroundVideo: data, background: "" });
      else save({ background: data, backgroundVideo: "" });
      applyChrome();
      repaint();
    },

    wallNone: function () {
      save({ background: "", backgroundVideo: "" });
      applyChrome();
      repaint();
    },

    noticeSound: function (data) {
      save({ noticeSound: data });
      toast("Звук уведомления сохранён");
    },

    orderSound: function (data) {
      save({ sound: data });
      toast("Звук заказа сохранён");
    },

    testNotice: function () {
      if (!S().noticeSound) { toast("Сначала выберите звук"); return; }
      root.LLVNotify.play(S().noticeSound);
    },

    testOrder: function () {
      if (!S().sound) { toast("Сначала выберите звук"); return; }
      root.LLVNotify.play(S().sound);
    },

    raise: function () {
      inFunpay("raise").then(function (response) {
        toast(response && response.ok ? (response.message || "Раздел поднят") : ((response && response.error) || "Не удалось поднять"));
      });
    },

    bulk: function () {
      funpayTab().then(function (tab) {
        if (!tab) { toast("Откройте FunPay и зайдите в раздел своих лотов"); return; }
        if (tab.id != null && root.chrome.tabs.update) root.chrome.tabs.update(tab.id, { active: true });
        setTimeout(function () {
          inFunpay("bulk").then(function (response) {
            toast(response && response.ok ? "Включён выбор лотов на странице FunPay" : ((response && response.error) || "Не удалось"));
          });
        }, 400);
      });
    }
  };

  function costsByTitle() {
    var map = {};
    var ids = {};
    live.lots.forEach(function (lot) {
      var cost = Number(String(S().costs[lot.id] || "0").replace(",", ".")) || 0;
      map[lot.title] = cost;
      ids[lot.id] = cost;
    });
    return map;
  }

  function parseCsvLots(text) {
    var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) { return line.trim(); });
    if (lines.length < 2) return [];
    var head = splitLine(lines[0]).map(function (cell) { return cell.toLowerCase(); });
    var at = function (names) {
      for (var i = 0; i < names.length; i += 1) {
        var index = head.indexOf(names[i]);
        if (index !== -1) return index;
      }
      return -1;
    };
    var iId = at(["id", "ид"]);
    var iTitle = at(["название", "title", "name"]);
    var iPrice = at(["цена", "price"]);
    var iCur = at(["валюта", "currency"]);
    var rows = [];
    lines.slice(1).forEach(function (line) {
      var cells = splitLine(line);
      rows.push({
        id: iId === -1 ? "" : cells[iId],
        title: iTitle === -1 ? "" : cells[iTitle],
        price: iPrice === -1 ? "" : cells[iPrice],
        currency: iCur === -1 ? "₽" : cells[iCur]
      });
    });
    return rows;
  }

  function splitLine(line) {
    var cells = [];
    var current = "";
    var quoted = false;
    for (var i = 0; i < line.length; i += 1) {
      var char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === ";" && !quoted) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  }

  function exportLots(kind, lots) {
    if (!lots || !lots.length) {
      toast("Лотов нет. Откройте свой раздел лотов на FunPay");
      return;
    }
    if (kind === "csv") {
      var lines = ["\uFEFFID;Название;Цена;Валюта"];
      lots.forEach(function (lot) {
        lines.push([lot.id, lot.title, lot.price, lot.currency || "₽"].map(function (value) {
          return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
        }).join(";"));
      });
      root.LLV.download("lots.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
      return;
    }
    var rows = lots.map(function (lot) {
      return { id: lot.id, title: lot.title, price: lot.price, currency: lot.currency || "₽" };
    });
    root.LLV.download("lots.json", JSON.stringify(rows, null, 2), "application/json");
  }

  /* ---------- Отрисовка ---------- */

  function toneFor(section) {
    return section.tone || "#71717a";
  }

  function paintSide() {
    var list = document.getElementById("llv-app-list");
    if (!list) return;
    list.innerHTML = "";
    registry.sections.forEach(function (section) {
      var item = el("button", "llv-app-item" + (section.id === active ? " is-on" : ""));
      item.type = "button";
      item.style.setProperty("--tone", toneFor(section));
      item.appendChild(iconFor(section.icon)).className += " llv-app-item-icon";
      var body = el("span", "llv-app-item-body");
      body.appendChild(el("b", "", section.name));
      body.appendChild(el("small", "", section.hint || ""));
      item.appendChild(body);
      item.addEventListener("click", function () {
        active = section.id;
        paintSide();
        paintSection(document.getElementById("llv-app-main"));
      });
      list.appendChild(item);
    });
  }

  function paintSection(main) {
    if (!main) return;
    var section = registry.sectionById(active);
    main.innerHTML = "";
    main.style.setProperty("--tone", toneFor(section));
    var head = el("header", "llv-app-section-head");
    var title = el("div", "llv-app-section-title");
    title.appendChild(el("h1", "", section.name));
    title.appendChild(el("p", "", section.live ? "Действия на открытой вкладке FunPay" : ("Функции: " + section.cards.length + ". Выключите то, что вам не нужно — страница FunPay сразу станет чище.")));
    head.appendChild(title);
    main.appendChild(head);

    if (section.live) {
      var status = el("p", "llv-app-live-status");
      status.id = "llv-app-live-status";
      status.textContent = live.ready
        ? ("Подключено: лотов " + live.lots.length + ", заказов " + live.orders.length)
        : "Вкладка FunPay не найдена. Откройте funpay.com в соседней вкладке.";
      head.appendChild(status);
    }

    var grid = el("div", "llv-app-cards");
    section.cards.forEach(function (card, index) {
      grid.appendChild(paintCard(card, index));
    });
    main.appendChild(grid);
  }

  // Появление карточки. Кадры задаёт JS, а не CSS: у анимации из таблицы
  // стилей есть кадр «from» с opacity: 0, и недосчитанная анимация оставляет
  // именно его — карточки выглядят пропавшими. Здесь же первый кадр при
  // отказе сразу конечный, а если вкладка не на экране, анимация не заводится:
  // в фоне браузер её не ведёт, и карточка осталась бы невидимой.
  function appear(node, index) {
    if (!node.animate || document.hidden) return;
    try {
      var rule = new KeyframeEffect(node, [{ transform: "translateY(6px)" }, { transform: "none" }], {
        duration: 220,
        delay: Math.min(index, 8) * 18,
        easing: "ease"
      });
      var anim = node.animate(rule);
      // Если анимация не дошла до конца (закрытая вкладка, сбой), карточка
      // всё равно на месте: двигается только transform.
      if (anim && anim.cancel) {
        var clear = function () { node.style.transform = ""; };
        anim.onfinish = clear;
        anim.oncancel = clear;
      }
    } catch (error) {
      node.style.transform = "";
    }
  }

  function paintCard(card, index) {
    // В реестре тумблер — это либо имя painters (widget:…), либо флаг настроек.
    // Сравнение с «widget:» отделяет одно от другого, чтобы обработчик
    // переключения не создавался дважды для одной и той же карточки.
    var hasSwitch = !!card.key;
    var widget = hasSwitch && String(card.key).indexOf("widget:") === 0 ? card.widget : null;
    var state = cardState(card);
    var value = state ? state.on : false;

    var node = el("article", "llv-app-card");
    appear(node, index);
    if (card.css) node.classList.add("llv-css-" + card.css);

    var top = el("div", "llv-app-card-top");
    var text = el("div", "llv-app-card-text");
    text.appendChild(el("h3", "", card.title));
    text.appendChild(el("p", "", card.text || ""));
    top.appendChild(text);

    if (hasSwitch && !widget) {
      var switchBox = switchCore(value, function (on) {
        var changes = {};
        changes[card.key] = on;
        save(changes);
        refreshFunpay(changes);
        // Перерисовываем сразу: карточку заменяет render(), и старый чекбокс
        // иначе остаётся на экране со знанием, что он выключен.
        repaint();
      });
      switchBox.className = "llv-app-card-switch";
      top.appendChild(switchBox);
      node.classList.toggle("is-off", !value);
    }
    node.appendChild(top);
    if (hasSwitch && !widget) {
      // meetSwitch: нажали по карточке, но не по тумблеру. Клик, который после
      // этого дойдёт до <label>, пришёл «мимо» и переключать его не должен.
      var meetSwitch = false;
      node.addEventListener("pointerdown", function (event) {
        meetSwitch = !event.target.closest(".llv-app-card-switch");
      });
      node.addEventListener("click", function (event) {
        if (meetSwitch && !event.target.closest(".llv-app-card-switch")) event.preventDefault();
        meetSwitch = false;
      });
    }

    if (widget) {
      var host = el("div", "llv-app-widget");
      host.__cardValue = value;
      host.__cardSpec = card.spec || {};
      painters[widget](host, card);
      node.appendChild(host);
    }
    syncEmulation(card);
    (card.fields || []).forEach(function (spec) { if (!spec.half) node.appendChild(inputRow(spec)); });
    if (card.fields2) {
      var pair = el("div", "llv-app-pair");
      card.fields2.forEach(function (spec) { pair.appendChild(inputRow(spec)); });
      node.appendChild(pair);
    }
    (card.toggles || []).forEach(function (spec) {
      node.appendChild(toggleRow(spec.label, !!getValue(spec.key), function (on) {
        var changes = {};
        changes[spec.key] = on;
        save(changes);
        refreshFunpay(changes);
        // Перерисовываем целиком: у узла в `node` снимок настроек до правки,
        // и следующая правка в этой же карточке затёрла бы только что
        // сохранённую настройку.
        repaint();
      }, spec.note));
    });
    if (card.note) node.appendChild(el("p", "llv-app-hint", card.note));
    if (!widget && card.widget && painters[card.widget]) painters[card.widget](node, card);
    else if (card.css && !hasSwitch) node.classList.add("is-off");
    if (card.picker) {
      node.appendChild(filePicker(card.picker, function (data, file) {
        if (actions[card.picker.run]) actions[card.picker.run](data, file);
      }));
    }
    if (card.buttons) {
      var bar = el("div", "llv-app-buttons");
      card.buttons.forEach(function (spec) {
        bar.appendChild(buttonRow(spec.label, function () {
          if (actions[spec.run]) actions[spec.run]();
        }, "quiet"));
      });
      node.appendChild(bar);
    }
    if (card.liveButtons) {
      var liveBar = el("div", "llv-app-buttons");
      card.liveButtons.forEach(function (spec) {
        liveBar.appendChild(buttonRow(spec.label, function () {
          if (spec.href) { root.chrome.tabs.create({ url: spec.href }); return; }
          if (actions[spec.run]) actions[spec.run]();
        }, "primary"));
      });
      node.appendChild(liveBar);
    }
    return node;
  }

  function repaint() {
    var main = document.getElementById("llv-app-main");
    paintSection(main);
    paintTopbar();
  }

  // В реестре три вида тумблера: прямой флаг, группа флагов (toggles)
  // и виджет, который сам переключает свой ключ. Итог для счётчика и
  // подсветки карточки считаем здесь, чтобы не дублировать логику.
  function cardState(card) {
    if (!card.key) return null;
    if (card.key.indexOf("widget:") === 0) {
      var spec = card.spec || {};
      if (card.key === "widget:promo") return { on: !!(S().showPromo || S().promo), key: "showPromo" };
      if (card.key === "widget:highlight") return { on: !!S().highlight, key: "highlight" };
      return { on: spec.on ? getValue(spec.key) !== false : !!getValue(spec.key), key: spec.key };
    }
    return { on: card.on ? getValue(card.key) !== false : !!getValue(card.key), key: card.key };
  }

  function syncEmulation(card) {
    if (!card.emulate) return;
    var state = cardState(card);
    var name = "llv-" + card.emulate;
    document.documentElement.classList.toggle(name, !!(state && state.on));
  }

  /* ---------- Отрисовка ---------- */

  /* ---------- Шапка ---------- */

  var topbarUser = "";
  var topbarBalance = "";

  function readTopbar() {
    inFunpay("topbar").then(function (response) {
      if (!response || !response.ok || !response.data) return;
      topbarUser = response.data.user || "";
      topbarBalance = response.data.balance || "";
      paintTopbar();
    });
  }

  function paintTopbar() {
    var user = document.getElementById("llv-app-user");
    if (user) {
      user.textContent = topbarUser || "FunPay";
      user.hidden = false;
    }
    var balance = document.getElementById("llv-app-balance");
    if (balance && topbarBalance) {
      balance.textContent = topbarBalance;
      balance.hidden = false;
    }
  }

  function applyChrome() {
    var theme = root.LLVThemes;
    if (!theme) return;
    var id = theme.resolve(S());
    var vars = theme.byId(id).vars || {};
    var style = document.documentElement.style;
    var map = ["--llv-bg", "--llv-panel", "--llv-panel-2", "--llv-text", "--llv-muted", "--llv-line", "--llv-field"];
    map.forEach(function (name) {
      if (vars[name]) style.setProperty(name, vars[name]);
      else style.removeProperty(name);
    });
    if (!vars["--llv-bg"]) style.setProperty("--llv-bg", id === "light" ? "#f5f6f8" : "#141414");
    document.documentElement.setAttribute("data-app-theme", id);
    document.documentElement.classList.toggle("llv-app-dark", theme.isDark(id));
    var bg = S().background || "";
    var video = S().backgroundVideo || "";
    var wall = document.getElementById("llv-app-wall");
    var media = document.getElementById("llv-app-wall-video");
    if (video) {
      if (!media) {
        media = document.createElement("video");
        media.id = "llv-app-wall-video";
        media.muted = true;
        media.loop = true;
        media.autoplay = true;
        media.setAttribute("aria-hidden", "true");
        document.body.insertBefore(media, document.body.firstChild);
      }
      media.src = video;
      var playing = media.play();
      if (playing && playing.catch) playing.catch(function () { /* автоплей требует жеста */ });
      if (wall) wall.style.backgroundImage = "";
    } else {
      if (media) media.remove();
      if (wall) {
        if (bg && /^wall:/.test(bg)) {
          var item = theme.walls().filter(function (w) { return w.id === bg.slice(5); })[0];
          wall.style.backgroundImage = item && item.css ? item.css : "";
        } else if (bg && /^(data:|https?:)/.test(bg)) {
          wall.style.backgroundImage = 'url("' + bg.replace(/"/g, "%22") + '")';
        } else {
          wall.style.backgroundImage = "none";
        }
      }
    }
    document.documentElement.classList.toggle("llv-app-glass", !!S().glass);
  }

  function paintStatus() {
    var node = document.getElementById("llv-app-counter");
    if (!node) return;
    var on = 0;
    var all = 0;
    registry.sections.forEach(function (section) {
      section.cards.forEach(function (card) {
        if (!card.key) return;
        all += 1;
        var value = card.on ? getValue(card.key) !== false : !!getValue(card.key);
        if (value) on += 1;
      });
    });
    node.textContent = "Включено " + on + " из " + all;
  }

  function render() {
    if (!registry || !registry.sections) {
      throw new Error("Список функций LLV не загрузился: проверьте, что ui-registry.js на месте");
    }
    applyChrome();
    paintSide();
    paintSection(document.getElementById("llv-app-main"));
    paintStatus();
    paintTopbar();
    loadLiveHint();
  }

  function loadLiveHint() {
    funpayTab().then(function (tab) {
      var node = document.getElementById("llv-app-tab");
      if (!node) return;
      if (tab) {
        node.textContent = "FunPay открыта";
        node.classList.add("is-on");
      } else {
        node.textContent = "FunPay закрыта";
        node.classList.remove("is-on");
      }
    });
  }

  // Chrome не перерисовывает открытую страницу сам. Периодически смотрим в
  // storage: настройки могли поменять из вкладки FunPay или из старого окна
  // настроек — тогда забираем их (LLV.reload не пишет обратно), чтобы следующая
  // правка не затёрла чужое значение своим снимком.
  var pendingSync = false;
  function resyncFromStorage() {
    if (pendingSync || !root.LLV || !root.LLV.reload) return;
    var local = root.chrome && root.chrome.storage && root.chrome.storage.local;
    if (!local || !local.get) return;
    pendingSync = true;
    // Откладываем: синхронный ответ storage запустил бы перерисовку посреди
    // обработчика клика, и следующий клик попал бы в удалённый узел.
    setTimeout(function () {
      local.get("llvSeller", function (data) {
        pendingSync = false;
        if (root.chrome.runtime && root.chrome.runtime.lastError) return;
        if (!data || !data.llvSeller) return;
        if (JSON.stringify(data.llvSeller) === JSON.stringify(S())) return;
        root.LLV.reload(data.llvSeller);
      });
    }, 0);
  }

  function start() {
    var reload = document.getElementById("llv-app-reload");
    if (reload) {
      reload.addEventListener("click", function (event) {
        event.preventDefault();
        root.location.reload();
      });
    }
    var link = document.getElementById("llv-app-open");
    if (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        funpayTab().then(function (tab) {
          if (tab) {
            root.chrome.tabs.update(tab.id, { active: true });
            return;
          }
          root.chrome.tabs.create({ url: "https://funpay.com/" });
        });
      });
    }
    // Ошибка в одном шаге не должна оставлять страницу пустой: рисуем,
    // что можем, а остальное дорисует следующая отрисовка.
    function step(name, fn) {
      try {
        fn();
      } catch (error) {
        if (root.console && console.error) console.error("LLV: " + name, error);
        // Ошибку показываем на экране: иначе сбой выглядит как пустой раздел.
        if (name === "render" || name === "repaint") toast("Сбой отрисовки: " + ((error && error.message) || error));
      }
    }
    var icon = document.getElementById("llv-app-mark");
    if (icon) icon.src = contentUrl("icons/icon.png");
    root.LLV.watch();
    // Каждое событие настроек — после нажатия пользователя. Рисуем синхронно,
    // чтобы браузер визуально переключил чекбокс сразу; resyncFromStorage()
    // сам откладывает работу, чтобы не попасть в этот же поток.
    root.LLV.on(function () {
      step("paintStatus", paintStatus);
      step("applyChrome", applyChrome);
      step("repaint", repaint);
      resyncFromStorage();
    });
    // Раз в секунду сверяемся со storage: вкладка FunPay или старое окно
    // настроек могли записать новые значения.
    setInterval(resyncFromStorage, 1000);
    // Первая отрисовка — сразу, не дожидаясь вкладки FunPay и storage:
    // иначе на медленном ответе страница выглядит пустой.
    step("render", render);
    // Живые данные сначала: тогда первая отрисовка уже со статистикой,
    // а «Лоты на странице» не мигает надписью «вкладка не найдена».
    pullLive().then(function () {
      loadExtras(function () {
        step("readTopbar", readTopbar);
        root.LLV.load(function () {
          step("render", render);
        });
      });
    }, function () {
      // Вкладки FunPay нет или она не ответила — всё равно показываем настройки.
      loadExtras(function () {
        root.LLV.load(function () {
          step("render", render);
        });
      });
    });
    setInterval(readTopbar, 60000);
    // Вкладка снова на экране — проверяем, не поменяли ли настройки извне.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      // Вернулись на вкладку: у карточек мог остаться недосчитанный кадр
      // появления. Перерисовываем, чтобы анимация началась заново.
      render();
      resyncFromStorage();
    });
  }

  root.LLVApp = {
    start: start,
    // Перерисовка из моста: сбой не должен всплывать в content-скрипт.
    refresh: function () {
      try {
        render();
      } catch (error) {
        if (root.console && console.error) console.error("LLV: перерисовка", error);
      }
    },
    actions: actions,
    live: live
  };

  // app.html подключает этот файл последним, поэтому запускаемся сразу.
  // Если DOM ещё не готов, ждём его.
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    try {
      start();
    } catch (error) {
      if (root.console && console.error) console.error("LLV: запуск панели", error);
      var main = document.getElementById("llv-app-main");
      if (main && !main.querySelector(".llv-app-cards")) {
        main.innerHTML = "";
        var box = el("div", "llv-app-boot");
        box.appendChild(el("b", "", "Панель не запустилась"));
        box.appendChild(el("span", "", String((error && error.message) || error)));
        main.appendChild(box);
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
