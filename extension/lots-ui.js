(function (root) {
  function attach(panelRoot) {
    var lotsApi = root.LLVLots;
    var commands = panelRoot.querySelector(".llv-commands");
    var work = panelRoot.querySelector(".llv-work");
    var search = panelRoot.querySelector(".llv-search");
    if (!lotsApi || !commands || commands.childElementCount) return;
    var selected = {};
    var selecting = false;

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
      ownLots().forEach(function (lot) {
        var row = rowOf(lot.id);
        if (!row) return;
        var match = !query || (lot.title || "").toLowerCase().indexOf(query) !== -1;
        row.classList.toggle("llv-filtered", !match);
      });
    }

    function clearRowMarks() {
      document.querySelectorAll(".llv-row-check, .llv-clone").forEach(function (node) { node.remove(); });
      document.querySelectorAll(".tc-item.llv-filtered").forEach(function (row) {
        row.classList.remove("llv-filtered");
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
        cmd("clone", "Клонировать лот") +
        cmd("titles", "Замена в названии") +
        cmd("delete", "Удалить", " llv-danger") +
        '<span class="llv-spacer"></span>' +
        '<button type="button" class="llv-btn" data-cmd="done">Готово</button>';
      paintForeign();
    }

    function paintForeign() {
      document.querySelectorAll(".llv-clone").forEach(function (node) { node.remove(); });
      var query = (search.value || "").trim().toLowerCase();
      lotsApi.collectLots(document).foreign.forEach(function (lot) {
        var row = rowOf(lot.id);
        if (!row) return;
        var match = !query || (lot.title || "").toLowerCase().indexOf(query) !== -1;
        row.classList.toggle("llv-filtered", !match);
        if (!match) return;
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

    function cloneForeign(lot) {
      var template = ownLots()[0];
      if (!template) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Нет своего лота в этом разделе, чтобы создать копию.</p>';
        return;
      }
      lotsApi.createFromTemplate(template, location, fetch, {
        title: lot.title,
        price: lot.price
      }).then(function (result) {
        showResults([{ id: lot.id, title: lot.title, ok: result.ok, error: result.error || "" }]);
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
      return String(value || "").replace(/[&<>"']/g, function (char) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
      });
    }

    function escapeAttr(value) { return escapeHtml(value); }

    function openDialog(html) {
      var old = panelRoot.querySelector(".llv-dialog");
      if (old) old.remove();
      var dialog = document.createElement("div");
      dialog.className = "llv-dialog";
      dialog.innerHTML = html;
      panelRoot.appendChild(dialog);
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
      lotsApi.eachLot(lots, function (lot) {
        return lotsApi.cloneLot(lot, location, fetch, suffix);
      }).then(showResults);
    }

    function runRaise() {
      var raised = lotsApi.raiseOnPage(document);
      work.hidden = false;
      work.innerHTML = '<p class="llv-note">' + (raised.ok
        ? "Нажата кнопка «Поднять» на странице."
        : escapeHtml(raised.error || "Не удалось поднять")) + "</p>";
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
          else next = String(Math.round(current / step) * step);
          return lotsApi.editLot(lot, location, fetch, { price: next });
        }).then(function (results) {
          dialog.remove();
          showResults(results);
        });
      });
    }

    function downloadLots(lots) {
      var payload = lots.map(function (lot) {
        return { title: lot.title, price: lot.price };
      });
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "lots.json";
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function openExport() {
      var lots = visibleLots();
      if (!lots.length) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Своих лотов на странице нет.</p>';
        return;
      }
      var dialog = openDialog(
        '<p class="llv-kicker">Экспорт лотов</p>' +
        lots.map(function (lot) {
          return '<p class="llv-pair"><span>' + escapeHtml(lot.title || lot.id) + "</span><span>" +
            escapeHtml(lot.price || "—") + "</span></p>";
        }).join("") +
        '<button type="button" class="llv-btn" data-act="save">Экспорт</button>' +
        '<button type="button" class="llv-link" data-act="close">Отмена</button>'
      );
      dialog.querySelector("[data-act='save']").addEventListener("click", function () {
        downloadLots(lots);
        dialog.remove();
      });
    }

    function openImport() {
      var template = ownLots()[0];
      if (!template) {
        work.hidden = false;
        work.innerHTML = '<p class="llv-note">Нужен хотя бы один свой лот: новые создаются по нему, старые не меняются.</p>';
        return;
      }
      var file = panelRoot.querySelector(".llv-file");
      file.value = "";
      file.onchange = function () {
        var chosenFile = file.files && file.files[0];
        if (!chosenFile) return;
        var reader = new FileReader();
        reader.onload = function () {
          var rows;
          try { rows = JSON.parse(String(reader.result || "")); } catch (error) { rows = null; }
          if (!Array.isArray(rows) || !rows.length) {
            work.hidden = false;
            work.innerHTML = '<p class="llv-note">Файл должен быть списком лотов в JSON.</p>';
            return;
          }
          var jobs = rows.filter(function (row) { return row && row.title; });
          lotsApi.eachLot(jobs.map(function (row, index) {
            return { id: String(index + 1), title: String(row.title), price: row.price ? String(row.price) : "", description: row.description ? String(row.description) : "" };
          }), function (lot) {
            return lotsApi.createFromTemplate(template, location, fetch, {
              title: lot.title,
              price: lot.price,
              description: lot.description
            });
          }).then(showResults);
        };
        reader.readAsText(chosenFile);
      };
      file.click();
    }

    function clip(text) {
      var value = String(text || "").replace(/\s+/g, " ").trim();
      return value.length > 140 ? value.slice(0, 140) + "…" : (value || "—");
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

    function openTitles() {
      if (!needLots()) return;
      var dialog = openDialog(
        '<p class="llv-kicker">Одно слово в названии и описании</p>' +
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
        titleRows = lotsApi.previewTitles(chosen(), from, to);
        var body = titleRows.map(function (row) {
          return '<p class="llv-pair"><span>Название</span><span>' + escapeHtml(row.before || "—") +
            " → " + escapeHtml(row.changed ? row.after : "без изменений") + "</span></p>";
        }).join("");
        dialog.querySelector(".llv-preview").innerHTML = body + '<p class="llv-note">Описания читаются…</p>';
        lotsApi.previewDescriptions(chosen(), from, to, location, fetch).then(function (rows) {
          if (!dialog.isConnected) return;
          descRows = rows;
          dialog.querySelector(".llv-preview").innerHTML = body + rows.map(function (row) {
            var after = row.error ? row.error : (row.changed ? clip(row.after) : "без изменений");
            return '<p class="llv-pair" data-lot="' + escapeAttr(row.id) + '"><span>Описание · ' +
              escapeHtml(row.title || row.id) + "</span><span>" + escapeHtml(clip(row.before)) +
              " → " + escapeHtml(after) + "</span></p>";
          }).join("");
          if (dialog.querySelector("[data-act='apply']")) return;
          var apply = document.createElement("button");
          apply.type = "button";
          apply.className = "llv-btn";
          apply.setAttribute("data-act", "apply");
          apply.textContent = "Применить";
          dialog.appendChild(apply);
          apply.addEventListener("click", function () {
            var titles = {};
            var descriptions = {};
            titleRows.forEach(function (row) { titles[row.id] = row; });
            descRows.forEach(function (row) { descriptions[row.id] = row; });
            lotsApi.eachLot(chosen(), function (lot) {
              var changes = {};
              if (titles[lot.id] && titles[lot.id].changed) changes.title = titles[lot.id].after;
              if (descriptions[lot.id] && descriptions[lot.id].changed) changes.description = descriptions[lot.id].after;
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

    function confirmDelete() {
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

    commands.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cmd]");
      if (!button || !commands.contains(button)) return;
      var id = button.getAttribute("data-cmd");
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
      if (id === "delete") { confirmDelete(); return; }
      if (id === "clone") { runClone(""); return; }
      if (id === "price") { openPrice(); return; }
      if (id === "titles") { openTitles(); return; }
    });

    search.addEventListener("input", function () {
      applySearch();
      paintChecks();
      paintForeign();
      paintSimilar();
    });

    render();
    paintSimilar();
  }

  root.LLVLotsUI = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
