(function (root) {
  function attach(panelRoot) {
    var lotsApi = root.LLVLots;
    var commands = panelRoot.querySelector(".llv-commands");
    var work = panelRoot.querySelector(".llv-work");
    var search = panelRoot.querySelector(".llv-search");
    var file = panelRoot.querySelector(".llv-file");
    if (!lotsApi || !commands || commands.childElementCount) return;
    var selected = {};
    var selecting = false;
    var fileHandler = null;

    function S() {
      return root.LLV.current();
    }

    function ownLots() {
      return lotsApi.collectLots(document).lots;
    }

    function rowOf(id) {
      return lotsApi.rowById(document, id);
    }

    function visibleLots() {
      var query = (search.value || "").trim().toLowerCase();
      return ownLots().filter(function (lot) {
        if (!query) return true;
        return (lot.title || "").toLowerCase().indexOf(query) !== -1;
      });
    }

    function chosen() {
      return visibleLots().filter(function (lot) { return selected[lot.id]; });
    }

    function applySearch() {
      var query = (search.value || "").trim().toLowerCase();
      lotsApi.collectLots(document).lots.concat(lotsApi.collectLots(document).foreign).forEach(function (lot) {
        var row = rowOf(lot.id);
        if (!row) return;
        var match = !query || (lot.title || "").toLowerCase().indexOf(query) !== -1;
        row.classList.toggle("llv-filtered", !match);
      });
    }

    function clearRowMarks() {
      document.querySelectorAll(".llv-row-check, .llv-clone, .llv-lot-btn").forEach(function (node) { node.remove(); });
      document.querySelectorAll(".tc-item.llv-filtered, .llv-dragging, .llv-drop-target").forEach(function (row) {
        row.classList.remove("llv-filtered", "llv-dragging", "llv-drop-target");
      });
    }

    function paintChecks() {
      document.querySelectorAll(".llv-row-check").forEach(function (node) { node.remove(); });
      if (!selecting) return;
      visibleLots().forEach(function (lot) {
        var row = rowOf(lot.id);
        if (!row || row.querySelector(".llv-row-check")) return;
        var box = document.createElement("input");
        box.type = "checkbox";
        box.className = "llv-row-check";
        box.checked = !!selected[lot.id];
        box.setAttribute("aria-label", "Выбрать лот");
        box.addEventListener("change", function () { selected[lot.id] = box.checked; });
        row.insertBefore(box, row.firstChild);
      });
    }

    function cmd(id, label, extra) {
      return '<button type="button" class="llv-cmd' + (extra || "") + '" data-cmd="' + id + '">' + label + "</button>";
    }

    function render() {
      if (!selecting) {
        commands.innerHTML =
          '<button type="button" class="llv-cmd" data-cmd="lots">Лоты</button>' +
          cmd("raise", "Поднять все предложения") +
          cmd("export", "Экспорт лотов") +
          cmd("import", "Импорт лотов") +
          cmd("select", "Выбрать лоты");
        work.hidden = true;
        work.innerHTML = "";
        paintForeign();
        return;
      }
      commands.innerHTML =
        cmd("all", "Выбрать все") +
        cmd("activate", "Включить") +
        cmd("deactivate", "Выключить") +
        cmd("price", "Изменить цену") +
        cmd("clone", "Клонировать") +
        cmd("titles", "Замена в названии") +
        '<span class="llv-spacer"></span>' +
        '<button type="button" class="llv-btn" data-cmd="done">Готово</button>';
      paintForeign();
    }

    var MORE = {
      lots: [
        ["descriptions", "Замена в описании"],
        ["sell", "Снять с продажи"],
        ["restore", "Вернуть в продажу"],
        ["english", "Перевести лот"],
        ["ai", "Текст лота нейросетью"],
        ["order", "Порядок лотов"],
        ["delete", "Удалить"]
      ]
    };

    function moreMenu() {
      var bar = panelRoot.querySelector(".llv-more-cmds");
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "llv-more-cmds";
        commands.parentNode.insertBefore(bar, commands.nextSibling);
      }
      bar.innerHTML = MORE.lots.map(function (item) {
        return '<button type="button" class="llv-cmd' + (item[0] === "delete" ? " llv-danger" : "") + '" data-cmd="' + item[0] + '">' + item[1] + "</button>";
      }).join("");
      bar.hidden = !bar.hidden;
    }

    function lotButton(row, label, onClick, extra) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "llv-lot-btn" + (extra ? " " + extra : "");
      button.textContent = label;
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        onClick(button);
      });
      row.appendChild(button);
      return button;
    }

    function paintForeign() {
      document.querySelectorAll(".llv-clone").forEach(function (node) { node.remove(); });
      var query = (search.value || "").trim().toLowerCase();
      lotsApi.collectLots(document).foreign.forEach(function (lot) {
        var row = rowOf(lot.id);
        if (!row) return;
        var match = !query || (lot.title || "").toLowerCase().indexOf(query) !== -1;
        row.classList.toggle("llv-filtered", !match);
        if (!match || row.querySelector(".llv-clone")) return;
        var button = document.createElement("button");
        button.type = "button";
        button.className = "llv-clone";
        button.textContent = "Клонировать лот";
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          cloneForeign(lot);
        });
        row.appendChild(button);
      });
    }

    function needLots() {
      var lots = chosen();
      if (lots.length) return lots;
      work.hidden = false;
      work.innerHTML = '<p class="llv-note">Отметьте хотя бы один лот в таблице.</p>';
      return null;
    }

    function showResults(rows) {
      var body = rows.map(function (row) {
        var state = row.skipped ? "без изменений" : (row.ok ? "готово" : row.error || "ошибка");
        return '<p class="llv-pair" data-lot="' + escapeAttr(row.id) + '"><span>' +
          escapeHtml(row.title || row.id) + "</span><span>" + escapeHtml(state) + "</span></p>";
      }).join("");
      openDialog(
        '<p class="llv-kicker">Результат по каждому лоту</p>' + body +
        '<button type="button" class="llv-btn" data-act="close">Закрыть</button>'
      );
    }

    function escapeHtml(value) {
      return root.LLV.escapeHtml(value);
    }

    function escapeAttr(value) { return escapeHtml(value); }

    function openDialog(html) {
      var old = panelRoot.querySelector(".llv-dialog");
      if (old) old.remove();
      var dialog = document.createElement("div");
      dialog.className = "llv-dialog";
      dialog.innerHTML = html;
      (panelRoot.querySelector(".llv-panel") || panelRoot).appendChild(dialog);
      var close = dialog.querySelector("[data-act='close']");
      if (close) close.addEventListener("click", function () { dialog.remove(); });
      return dialog;
    }

    function runRowAction(action) {
      var lots = needLots();
      if (!lots) return;
      showResults(lots.map(function (lot) {
        var result = lotsApi.clickRowAction(rowOf(lot.id), action);
        return { id: lot.id, title: lot.title, ok: result.ok, error: result.error || "" };
      }));
    }

    function runClone(suffix) {
      var lots = needLots();
      if (!lots) return;
      return lotsApi.eachLot(lots, function (lot) {
        return lotsApi.cloneLot(lot, location, fetch, suffix);
      }).then(showResults);
    }

    function runRaise() {
      if (!root.LLVBackground || !lotsApi.raiseTarget(document, location)) {
        var raised = lotsApi.raiseOnPage(document);
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">' + (raised.ok
          ? "Нажата кнопка «Поднять» на странице."
          : escapeHtml(raised.error || "Не удалось поднять")) + "</p>";
        return;
      }
      work.hidden = false;
      work.innerHTML = '<p class="llv-note">Поднимаем через расширение…</p>';
      root.LLVBackground.raise().then(function (result) {
        if (!result) return;
        work.innerHTML = '<p class="llv-note">' + escapeHtml(result.ok ? (result.message || "Раздел: поднято") : (result.error || "Не удалось поднять")) + "</p>";
      });
    }

    function openPrice() {
      var lots = needLots();
      if (!lots) return;
      var mode = "set";
      var step = 1;
      var dialog = openDialog(
        '<p class="llv-kicker">Изменить цену</p>' +
        '<p class="llv-note">Применить к выбранным лотам: ' + lots.length + "</p>" +
        '<div class="llv-modes">' +
          '<button type="button" class="llv-cmd is-on" data-mode="set">Установить</button>' +
          '<button type="button" class="llv-cmd" data-mode="add">Увеличить</button>' +
          '<button type="button" class="llv-cmd" data-mode="sub">Уменьшить</button>' +
          '<button type="button" class="llv-cmd" data-mode="addp">Увеличить %</button>' +
          '<button type="button" class="llv-cmd" data-mode="subp">Уменьшить %</button>' +
          '<button type="button" class="llv-cmd" data-mode="round">Округлить</button>' +
        "</div>" +
        '<label class="llv-field llv-amount"><span>Сумма, ₽</span><input class="llv-price" inputmode="decimal" /></label>' +
        '<div class="llv-modes llv-steps" hidden>' +
          '<button type="button" class="llv-cmd is-on" data-step="1">До целого</button>' +
          '<button type="button" class="llv-cmd" data-step="10">До десятков</button>' +
          '<button type="button" class="llv-cmd" data-step="100">До сотен</button>' +
        "</div>" +
        '<button type="button" class="llv-btn" data-act="save">Применить к ' + lots.length + "</button>" +
        '<button type="button" class="llv-link" data-act="close">Отмена</button>'
      );
      dialog.querySelectorAll("[data-mode]").forEach(function (button) {
        button.addEventListener("click", function () {
          mode = button.getAttribute("data-mode");
          dialog.querySelectorAll("[data-mode]").forEach(function (item) {
            item.classList.toggle("is-on", item === button);
          });
          dialog.querySelector(".llv-amount").hidden = mode === "round";
          dialog.querySelector(".llv-amount span").textContent = /%/.test(button.textContent) ? "Процент" : "Сумма, ₽";
          dialog.querySelector(".llv-steps").hidden = mode !== "round";
        });
      });
      dialog.querySelectorAll("[data-step]").forEach(function (button) {
        button.addEventListener("click", function () {
          step = Number(button.getAttribute("data-step"));
          dialog.querySelectorAll("[data-step]").forEach(function (item) {
            item.classList.toggle("is-on", item === button);
          });
        });
      });
      dialog.querySelector("[data-act='save']").addEventListener("click", function () {
        var amount = Number(String(dialog.querySelector(".llv-price").value).replace(",", "."));
        if (mode !== "round" && !isFinite(amount)) {
          dialog.querySelector(".llv-kicker").textContent = "Введите сумму";
          return;
        }
        lotsApi.eachLot(chosen(), function (lot) {
          var current = Number(lot.price);
          var next = "";
          if (mode === "set") next = String(amount);
          else if (!lot.price || !isFinite(current)) return Promise.resolve({ ok: false, error: "На строке нет цены" });
          else if (mode === "add") next = String(Math.round((current + amount) * 100) / 100);
          else if (mode === "sub") next = String(Math.max(0, Math.round((current - amount) * 100) / 100));
          else if (mode === "addp") next = String(Math.round(current * (1 + amount / 100) * 100) / 100);
          else if (mode === "subp") next = String(Math.max(0, Math.round(current * (1 - amount / 100) * 100) / 100));
          else next = String(Math.round(current / step) * step);
          return lotsApi.editLot(lot, location, fetch, { price: next });
        }).then(function (results) {
          dialog.remove();
          showResults(results);
        });
      });
    }

    function lotsPayload(lots) {
      return lots.map(function (lot) {
        return {
          id: lot.id,
          title: lot.title,
          price: lot.price,
          currency: lot.currency || "₽",
          folder: (location.pathname.match(/\/lots\/(\d+)/) || [])[1] || "",
          url: location.origin + location.pathname
        };
      });
    }

    function exportLots(kind, lots) {
      var list = lots || visibleLots();
      if (!list.length) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Своих лотов на странице нет.</p>';
        return;
      }
      writeLots(kind, list);
    }

    function writeLots(kind, list) {
      var payload = lotsPayload(list);
      if (kind === "txt") {
        root.LLV.download("lots.txt", payload.map(function (row) { return row.title + " — " + row.price + " " + row.currency; }).join("\n"), "text/plain;charset=utf-8");
        return;
      }
      if (kind === "json") {
        root.LLV.download("lots.json", JSON.stringify(payload, null, 2), "application/json");
        return;
      }
      var lines = ["\uFEFFНазвание;Цена;Валюта;Раздел;Ссылка"];
      payload.forEach(function (row) {
        lines.push([row.title, row.price, row.currency, row.folder, row.url].map(function (value) {
          return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
        }).join(";"));
      });
      root.LLV.download("lots.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
    }

    panelRoot.__llvExport = exportLots;
    panelRoot.__llvImport = importLots;

    function openExport() {
      var lots = visibleLots();
      if (!lots.length) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Своих лотов на странице нет.</p>';
        return;
      }
      var dialog = openDialog(
        '<p class="llv-kicker">Экспорт лотов: ' + lots.length + "</p>" +
        lots.slice(0, 40).map(function (lot) {
          return '<p class="llv-pair"><span>' + escapeHtml(lot.title || lot.id) + "</span><span>" +
            escapeHtml((lot.price || "—") + " " + (lot.currency || "")) + "</span></p>";
        }).join("") +
        '<div class="llv-modes">' +
          '<button type="button" class="llv-btn" data-kind="json">JSON</button>' +
          '<button type="button" class="llv-btn" data-kind="csv">Excel (CSV)</button>' +
          '<button type="button" class="llv-cmd" data-kind="txt">TXT</button>' +
        "</div>" +
        '<button type="button" class="llv-link" data-act="close">Отмена</button>'
      );
      dialog.querySelectorAll("[data-kind]").forEach(function (button) {
        button.addEventListener("click", function () {
          exportLots(button.getAttribute("data-kind"), lots);
          dialog.remove();
        });
      });
    }

    function parseCsv(text) {
      var rows = [];
      var row = [];
      var cell = "";
      var quote = false;
      for (var i = 0; i < text.length; i += 1) {
        var char = text.charAt(i);
        if (quote) {
          if (char === '"' && text.charAt(i + 1) === '"') { cell += '"'; i += 1; }
          else if (char === '"') quote = false;
          else cell += char;
          continue;
        }
        if (char === '"') { quote = true; continue; }
        if (char === ";" || char === "," || char === "\t") { row.push(cell); cell = ""; continue; }
        if (char === "\n" || char === "\r") {
          if (cell || row.length) { row.push(cell); rows.push(row); }
          row = [];
          cell = "";
          continue;
        }
        cell += char;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter(function (item) {
        return item.some(function (value) { return String(value).trim(); });
      });
    }

    function toJson(text) {
      var trimmed = String(text || "").replace(/^\uFEFF/, "").trim();
      if (!trimmed) return [];
      if (trimmed.charAt(0) === "[" || trimmed.charAt(0) === "{") {
        try {
          var parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.lots)) return parsed.lots;
        } catch (error) { return []; }
      }
      var rows = parseCsv(trimmed);
      if (rows.length < 2) return [];
      var head = rows[0].map(function (value) { return String(value).trim().toLowerCase(); });
      var pos = function (names) {
        for (var i = 0; i < names.length; i += 1) {
          var at = head.indexOf(names[i]);
          if (at !== -1) return at;
        }
        return -1;
      };
      var t = pos(["название", "title", "name"]);
      var p = pos(["цена", "price"]);
      var u = pos(["валюта", "currency"]);
      if (t === -1) t = 0;
      return rows.slice(1).map(function (row) {
        return { title: row[t], price: p === -1 ? "" : row[p], currency: u === -1 ? "₽" : row[u] };
      });
    }

    function importLots(text, done) {
      var rows = toJson(text);
      var use = rows.filter(function (row) { return row && String(row.title || "").trim(); });
      if (!use.length) {
        if (done) done("Файл должен быть списком лотов в JSON или CSV.");
        else {
          work.hidden = false;
          work.innerHTML = '<p class="llv-note">Файл должен быть списком лотов в JSON или CSV.</p>';
        }
        return;
      }
      var template = ownLots()[0];
      if (!template) {
        var message = "Нужен хотя бы один свой лот в этом разделе: новые создаются по нему, старые не меняются.";
        if (done) done(message);
        else {
          work.hidden = false;
          work.innerHTML = '<p class="llv-note">' + message + "</p>";
        }
        return;
      }
      var jobs = use.map(function (row, index) {
        return {
          id: String(row.id || index + 1),
          title: String(row.title).trim(),
          price: row.price == null ? "" : String(row.price).replace(/[^\d.,-]/g, "").replace(",", "."),
          currency: row.currency || "₽"
        };
      });
      lotsApi.eachLot(jobs, function (lot) {
        return lotsApi.createFromTemplate(template, location, fetch, {
          title: lot.title,
          price: lot.price,
          currency: lot.currency
        });
      }).then(function (results) {
        if (done) {
          var ok = results.filter(function (row) { return row.ok; }).length;
          done("Создано лотов: " + ok + " из " + results.length);
        }
        showResults(results);
      });
    }

    function clip(text) {
      return root.LLV.clip(text, 140);
    }

    function paintSimilar() {
      document.querySelectorAll(".llv-dup").forEach(function (node) { node.classList.remove("llv-dup"); });
      var ids = lotsApi.similarTitleIds(ownLots());
      ids.forEach(function (id) {
        var row = rowOf(id);
        if (row) row.classList.add("llv-dup");
      });
      var note = panelRoot.querySelector(".llv-dup-note");
      if (!note) {
        note = document.createElement("p");
        note.className = "llv-note llv-dup-note";
        panelRoot.querySelector(".llv-panel").appendChild(note);
      }
      note.hidden = !ids.length;
      note.textContent = ids.length ? ("Похожие названия, отличие в одном слове: " + ids.length) : "";
    }

    function openReplace(fieldName) {
      if (!needLots()) return;
      var isDesc = fieldName === "description";
      var dialog = openDialog(
        '<p class="llv-kicker">Одно слово в ' + (isDesc ? "описании" : "названии") + "</p>" +
        '<label class="llv-field"><span>Было</span><input class="llv-from" placeholder="Аренда" /></label>' +
        '<label class="llv-field"><span>Стало</span><input class="llv-to" placeholder="Продажа" /></label>' +
        '<div class="llv-preview"></div>' +
        '<button type="button" class="llv-btn" data-act="preview">Показать замену</button>' +
        '<button type="button" class="llv-link" data-act="close">Закрыть</button>'
      );
      var titleRows = [];
      var descRows = [];
      dialog.querySelector("[data-act='preview']").addEventListener("click", function () {
        var from = dialog.querySelector(".llv-from").value;
        var to = dialog.querySelector(".llv-to").value;
        if (!from) {
          dialog.querySelector(".llv-kicker").textContent = "Введите слово, которое нужно заменить";
          return;
        }
        dialog.querySelector(".llv-preview").innerHTML = '<p class="llv-note">Читаем лоты…</p>';
        lotsApi.previewDescriptions(chosen(), from, to, location, fetch).then(function (rows) {
          if (!dialog.isConnected) return;
          descRows = rows;
          titleRows = lotsApi.previewTitles(chosen(), from, to);
          var body = rows.map(function (row) {
            var after = row.error ? row.error : (row.changed ? clip(row.after) : "без изменений");
            return '<p class="llv-pair" data-lot="' + escapeAttr(row.id) + '"><span>' +
              escapeHtml(row.title || row.id) + "</span><span>" + escapeHtml(clip(row.before) || "—") +
              " → " + escapeHtml(after) + "</span></p>";
          }).join("");
          dialog.querySelector(".llv-preview").innerHTML = body;
          var apply = document.createElement("button");
          apply.type = "button";
          apply.className = "llv-btn";
          apply.textContent = "Применить";
          dialog.appendChild(apply);
          apply.addEventListener("click", function () {
            var titles = {};
            titleRows.forEach(function (row) { titles[row.id] = row; });
            lotsApi.eachLot(chosen(), function (lot) {
              var changes = {};
              var desc = null;
              descRows.forEach(function (row) { if (row.id === lot.id) desc = row; });
              if (desc && desc.changed) changes.description = desc.after;
              if (!isDesc && titles[lot.id] && titles[lot.id].changed) changes.title = titles[lot.id].after;
              if (!changes.title && !changes.description) return Promise.resolve({ ok: true, skipped: true });
              return lotsApi.editLot(lot, location, fetch, changes);
            }).then(function (results) {
              dialog.remove();
              showResults(results);
            });
          });
        });
      });
    }

    function openOrder() {
      var lots = visibleLots();
      if (lots.length < 2) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Нужно хотя бы два своих лота на странице.</p>';
        return;
      }
      var original = lots.slice();
      var dialog = openDialog(
        '<p class="llv-kicker">Порядок лотов</p>' +
        '<p class="llv-note">Нажмите ↑ и ↓ (или перетащите строку), чтобы задать порядок. FunPay не хранит порядок лотов напрямую, поэтому лоты, которые переехали, пересоздаются: удаляются и создаются заново с тем же названием, ценой и описанием.</p>' +
        '<div class="llv-order"></div>' +
        '<button type="button" class="llv-btn" data-act="save">Применить порядок</button>' +
        '<button type="button" class="llv-link" data-act="close">Закрыть</button>'
      );
      var list = dialog.querySelector(".llv-order");
      var current = lots.slice();
      function paintList() {
        list.innerHTML = "";
        current.forEach(function (lot, index) {
          var row = document.createElement("div");
          row.className = "llv-order-row";
          row.draggable = true;
          row.dataset.index = String(index);
          row.innerHTML = '<span class="llv-order-handle">⋮⋮</span><span class="llv-order-title">' +
            escapeHtml(lot.title || lot.id) + '</span>';
          var up = document.createElement("button");
          up.type = "button";
          up.className = "llv-cmd";
          up.textContent = "↑";
          up.addEventListener("click", function () {
            if (index === 0) return;
            current.splice(index - 1, 0, current.splice(index, 1)[0]);
            paintList();
          });
          var down = document.createElement("button");
          down.type = "button";
          down.className = "llv-cmd";
          down.textContent = "↓";
          down.addEventListener("click", function () {
            if (index === current.length - 1) return;
            current.splice(index + 1, 0, current.splice(index, 1)[0]);
            paintList();
          });
          row.appendChild(up);
          row.appendChild(down);
          row.addEventListener("dragstart", function (event) {
            event.dataTransfer.setData("text/plain", String(index));
          });
          row.addEventListener("dragover", function (event) { event.preventDefault(); });
          row.addEventListener("drop", function (event) {
            event.preventDefault();
            var from = Number(event.dataTransfer.getData("text/plain"));
            if (!isFinite(from) || from === index) return;
            current.splice(index, 0, current.splice(from, 1)[0]);
            paintList();
          });
          list.appendChild(row);
        });
      }
      paintList();
      dialog.querySelector("[data-act='save']").addEventListener("click", function () {
        var moved = [];
        current.forEach(function (lot, index) {
          if (original[index] && original[index].id === lot.id) return;
          moved.push(lot);
        });
        if (!moved.length) { dialog.remove(); return; }
        dialog.querySelector(".llv-kicker").textContent = "Пересоздаём " + moved.length + " лот(ов)…";
        var compare = [];
        lotsApi.eachLot(moved, function (lot) {
          return lotsApi.loadForm(lot, location, fetch).then(function (loaded) {
            if (!loaded.ok) return loaded;
            if (loaded.form.hasFile) {
              return { ok: false, error: "У лота есть картинки: пересоздание потеряет их, лот оставлен как есть" };
            }
            var fields = lotsApi.withoutOfferId(loaded.form.fields);
            return lotsApi.submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetch).then(function (created) {
              if (!created.ok) return created;
              var clicked = lotsApi.clickRowAction(rowOf(lot.id), "delete");
              compare.push({ id: lot.id, title: lot.title, ok: true, error: clicked.ok ? "пересоздан" : ("копия создана, старый лот не удалён: " + (clicked.error || "")) });
              return { id: lot.id, title: lot.title, ok: true, error: "" };
            });
          });
        }).then(function (results) {
          setTimeout(function () {
            dialog.remove();
            showResults(compare.length ? compare : results);
          }, 1200);
        });
      });
    }

    function openDelete() {
      var lots = needLots();
      if (!lots) return;
      var dialog = openDialog(
        '<p class="llv-kicker">Удалить отмеченные лоты: ' + lots.length + "</p>" +
        '<p class="llv-note">Нажмётся уже существующая кнопка удаления на странице.</p>' +
        '<button type="button" class="llv-cmd llv-danger" data-act="yes">Удалить</button>' +
        '<button type="button" class="llv-link" data-act="close">Отмена</button>'
      );
      dialog.querySelector("[data-act='yes']").addEventListener("click", function () {
        var results = lots.map(function (lot) {
          var result = lotsApi.clickRowAction(rowOf(lot.id), "delete");
          return { id: lot.id, title: lot.title, ok: result.ok, error: result.error || "" };
        });
        dialog.remove();
        showResults(results);
      });
    }

    function openEnglish() {
      var lots = needLots();
      if (!lots) return;
      var dialog = openDialog('<p class="llv-kicker">Перевод лотов на английский</p><p class="llv-note">Читаем лоты…</p>');
      var rows = [];
      lotsApi.eachLot(lots, function (lot) {
        return lotsApi.readLot(lot, location, fetch).then(function (loaded) {
          if (!loaded.ok) return loaded;
          return root.LLVTranslate.english(loaded.form.title, root.LLV.current()).then(function (title) {
            return root.LLVTranslate.english(loaded.form.description, root.LLV.current()).then(function (description) {
              rows.push({ id: lot.id, title: lot.title, form: loaded.form, enTitle: title, enDescription: description });
              return { ok: true };
            });
          });
        });
      }).then(function () {
        if (!dialog.isConnected) return;
        dialog.innerHTML =
          '<p class="llv-kicker">Перевод лотов (' + rows.length + ")</p>" +
          rows.map(function (row) {
            return '<div class="llv-translate">' +
              '<p class="llv-pair"><span>' + escapeHtml(row.title) + "</span><span>" + escapeHtml(clip(row.enTitle)) + "</span></p>" +
              '<label class="llv-field"><span>Английское название</span><input class="llv-en-title" data-lot="' + escapeAttr(row.id) + '" value="' + escapeAttr(row.enTitle) + '" /></label>' +
              '<label class="llv-field"><span>Английское описание</span><textarea class="llv-en-desc" data-lot="' + escapeAttr(row.id) + '">' + escapeHtml(row.enDescription) + "</textarea></label>" +
              "</div>";
          }).join("") +
          '<button type="button" class="llv-btn" data-act="save">Сохранить переводы</button>' +
          '<button type="button" class="llv-link" data-act="close">Закрыть</button>';
        dialog.querySelector("[data-act='save']").addEventListener("click", function () {
          var fields = {};
          dialog.querySelectorAll(".llv-en-title").forEach(function (input) {
            fields[input.getAttribute("data-lot")] = fields[input.getAttribute("data-lot")] || {};
            fields[input.getAttribute("data-lot")].title = input.value;
          });
          dialog.querySelectorAll(".llv-en-desc").forEach(function (input) {
            fields[input.getAttribute("data-lot")] = fields[input.getAttribute("data-lot")] || {};
            fields[input.getAttribute("data-lot")].description = input.value;
          });
          lotsApi.eachLot(lots, function (lot) {
            var changes = fields[lot.id];
            if (!changes || (!changes.title && !changes.description)) return Promise.resolve({ ok: true, skipped: true });
            return lotsApi.editLot(lot, location, fetch, changes);
          }).then(function (results) {
            dialog.remove();
            showResults(results);
          });
        });
      });
    }

    function openAi() {
      var lots = needLots();
      if (!lots) return;
      var config = S();
      var dialog = openDialog(
        '<p class="llv-kicker">Текст лота нейросетью</p>' +
        '<p class="llv-note">' + (config.aiKey ? "Напишем для " + lots.length + " лот(ов) название и описание." : "Сначала задайте ключ нейросети: Предложения → Заполнение лота нейросетью.") + "</p>" +
        (config.aiKey ? '<button type="button" class="llv-btn" data-act="go">Написать текст</button>' : "") +
        '<button type="button" class="llv-link" data-act="close">Закрыть</button>'
      );
      var go = dialog.querySelector("[data-act='go']");
      if (!go) return;
      go.addEventListener("click", function () {
        var out = [];
        lotsApi.loadForm(lots[0], location, fetch).then(function (loaded) {
          if (!loaded.ok) { dialog.querySelector(".llv-kicker").textContent = loaded.error; return null; }
          var prompt = "Ты продавец на FunPay. По названию лота " + lots[0].title + " и описанию " +
            (loaded.form.descField ? loaded.form.descField.value.slice(0, 1200) : "") +
            " напиши более привлекательное название (до 70 символов) и описание (до 800 символов). " +
            "Ответ строго двумя частями: первая строка — название, пустая строка, дальше описание. Без разметки.";
          return root.LLVReview.aiReply(prompt, config).then(function (text) {
            if (!text) { dialog.querySelector(".llv-kicker").textContent = "Нейросеть не ответила"; return null; }
            var parts = text.split(/\n\s*\n/);
            var title = root.LLVTranslate.translateLocally(parts[0].replace(/^название[:\s]*/i, "").trim());
            var body = parts.slice(1).join("\n\n").trim();
            out.push({ id: lots[0].id, title: lots[0].title });
            dialog.innerHTML =
              '<p class="llv-kicker">Результат нейросети</p>' +
              '<label class="llv-field"><span>Название</span><input class="llv-ai-title" value="' + escapeAttr(title) + '" /></label>' +
              '<label class="llv-field"><span>Описание</span><textarea class="llv-ai-desc">' + escapeHtml(body || title) + "</textarea></label>" +
              '<button type="button" class="llv-btn" data-act="save">Применить к ' + lots.length + "</button>" +
              '<button type="button" class="llv-link" data-act="close">Закрыть</button>';
            dialog.querySelector("[data-act='save']").addEventListener("click", function () {
              var newTitle = dialog.querySelector(".llv-ai-title").value;
              var newDesc = dialog.querySelector(".llv-ai-desc").value;
              lotsApi.eachLot(lots, function (lot) {
                return lotsApi.editLot(lot, location, fetch, {
                  title: newTitle.replace(lots[0].title, lot.title),
                  description: newDesc.replace(lots[0].title, lot.title)
                });
              }).then(function (results) {
                dialog.remove();
                showResults(results);
              });
            });
            return null;
          });
        });
      });
    }

    commands.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cmd]");
      if (!button || !commands.contains(button)) return;
      var id = button.getAttribute("data-cmd");
      if (id === "lots") { moreMenu(); return; }
      if (id === "select") {
        selecting = true;
        render();
        paintChecks();
        return;
      }
      if (id === "all") {
        visibleLots().forEach(function (lot) { selected[lot.id] = true; });
        paintChecks();
        return;
      }
      if (id === "done") {
        selecting = false;
        selected = {};
        clearRowMarks();
        render();
        return;
      }
      if (id === "raise") { runRaise(); return; }
      if (id === "export") { openExport(); return; }
      if (id === "import") { openImport(); return; }
      if (id === "activate" || id === "deactivate") { runRowAction(id); return; }
      if (id === "sell") { runRowAction("deactivate"); return; }
      if (id === "restore") { runRowAction("activate"); return; }
      if (id === "delete") { openDelete(); return; }
      if (id === "clone") { runClone(""); return; }
      if (id === "price") { openPrice(); return; }
      if (id === "titles") { openReplace("title"); return; }
      if (id === "descriptions") { openReplace("description"); return; }
      if (id === "english") { openEnglish(); return; }
      if (id === "ai") { openAi(); return; }
      if (id === "order") { openOrder(); return; }
    });

    panelRoot.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cmd]");
      if (!button) return;
      var bar = button.closest(".llv-more-cmds");
      if (!bar) return;
      var id = button.getAttribute("data-cmd");
      bar.hidden = true;
      if (id === "titles") openReplace("title");
      else if (id === "descriptions") openReplace("description");
      else if (id === "sell") { selecting = true; render(); runRowAction("deactivate"); }
      else if (id === "restore") { selecting = true; render(); runRowAction("activate"); }
      else if (id === "english" || id === "ai" || id === "order" || id === "delete") {
        selecting = true;
        selected = {};
        render();
        paintChecks();
        if (id === "english") openEnglish();
        if (id === "ai") openAi();
        if (id === "order") openOrder();
        if (id === "delete") openDelete();
      }
    });

    search.addEventListener("input", function () {
      applySearch();
      paintChecks();
      paintForeign();
      paintSimilar();
    });

    render();
    paintSimilar();

    root.LLVLotsUI = root.LLVLotsUI || {};
  }

  function importFromFile(file, done) {
    if (!file) return;
    root.LLV.readFile(file, 2000000, true, function (text) {
      var panel = document.getElementById("llv-shift-root") || document.getElementById("llv-profile-panel");
      if (!panel) {
        if (done) done("Откройте страницу своих лотов");
        return;
      }
      var fake = root.LLVLotsUI && root.LLVLotsUI.importLots;
      if (fake) { fake(text, done); return; }
      if (done) done("Модуль лотов не загрузился");
    });
  }

  root.LLVLotsUI = {
    attach: attach,
    exportLots: function (kind) {
      var panel = document.querySelector("#llv-shift-root, #llv-profile-panel");
      if (panel && panel.__llvExport) {
        panel.__llvExport(kind);
        return;
      }
      var lots = root.LLVLots.collectLots(document).lots;
      if (!lots.length) {
        root.LLV.toast("Лотов на странице нет");
        return;
      }
      var payload = lots.map(function (lot) { return { title: lot.title, price: lot.price, currency: lot.currency || "₽" }; });
      if (kind === "json") {
        root.LLV.download("lots.json", JSON.stringify(payload, null, 2), "application/json");
        return;
      }
      var lines = ["\uFEFFНазвание;Цена;Валюта"];
      payload.forEach(function (row) {
        lines.push([row.title, row.price, row.currency].map(function (value) {
          return '"' + String(value).replace(/"/g, '""') + '"';
        }).join(";"));
      });
      root.LLV.download("lots.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
    },
    importLots: function (text, done) {
      var panel = document.querySelector("#llv-shift-root, #llv-profile-panel");
      if (panel && panel.__llvImport) {
        panel.__llvImport(text, done);
        return;
      }
      if (done) done("Откройте страницу своих лотов, чтобы создавать новые лоты.");
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
