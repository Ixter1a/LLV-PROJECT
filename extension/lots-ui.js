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
      document.querySelectorAll(".llv-row-check").forEach(function (node) { node.remove(); });
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
          cmd("select", "Выбрать лоты");
        work.hidden = true;
        work.innerHTML = "";
        return;
      }
      commands.innerHTML =
        cmd("activate", "Включить") +
        cmd("deactivate", "Выключить") +
        cmd("price", "Изменить цену") +
        cmd("clone", "Клонировать") +
        cmd("duplicate", "Дублировать") +
        cmd("titles", "Замена в названии") +
        cmd("raise", "Поднять все предложения") +
        cmd("delete", "Удалить", " llv-danger") +
        '<span class="llv-spacer"></span>' +
        '<button type="button" class="llv-btn" data-cmd="done">Готово</button>';
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
      if (!needLots()) return;
      var dialog = openDialog(
        '<p class="llv-kicker">Новая цена</p>' +
        '<label class="llv-field"><span>Цена, ₽</span><input class="llv-price" placeholder="Пусто — не менять" /></label>' +
        '<label class="llv-field"><span>Описание</span><textarea class="llv-desc" placeholder="Пусто — не менять"></textarea></label>' +
        '<button type="button" class="llv-btn" data-act="save">Сохранить</button>' +
        '<button type="button" class="llv-link" data-act="close">Закрыть</button>'
      );
      dialog.querySelector("[data-act='save']").addEventListener("click", function () {
        var price = dialog.querySelector(".llv-price").value.trim();
        var description = dialog.querySelector(".llv-desc").value;
        if (!price && !description.trim()) {
          dialog.querySelector(".llv-kicker").textContent = "Заполните цену или описание";
          return;
        }
        lotsApi.eachLot(chosen(), function (lot) {
          return lotsApi.editLot(lot, location, fetch, { price: price, description: description.trim() });
        }).then(function (results) {
          dialog.remove();
          showResults(results);
        });
      });
    }

    function openTitles() {
      if (!needLots()) return;
      var dialog = openDialog(
        '<p class="llv-kicker">Одно слово в отмеченных названиях</p>' +
        '<label class="llv-field"><span>Было</span><input class="llv-from" placeholder="Аренда" /></label>' +
        '<label class="llv-field"><span>Стало</span><input class="llv-to" placeholder="Продажа" /></label>' +
        '<div class="llv-preview"></div>' +
        '<button type="button" class="llv-btn" data-act="preview">Показать замену</button>' +
        '<button type="button" class="llv-link" data-act="close">Закрыть</button>'
      );
      dialog.querySelector("[data-act='preview']").addEventListener("click", function () {
        var from = dialog.querySelector(".llv-from").value;
        var to = dialog.querySelector(".llv-to").value;
        if (!from) {
          dialog.querySelector(".llv-kicker").textContent = "Введите слово, которое нужно заменить";
          return;
        }
        var preview = lotsApi.previewTitles(chosen(), from, to);
        dialog.querySelector(".llv-preview").innerHTML = preview.map(function (row) {
          return '<p class="llv-pair"><span>' + escapeHtml(row.before || "—") + "</span><span>" +
            escapeHtml(row.changed ? row.after : "без изменений") + "</span></p>";
        }).join("");
        var apply = dialog.querySelector("[data-act='apply']");
        if (apply) return;
        apply = document.createElement("button");
        apply.type = "button";
        apply.className = "llv-btn";
        apply.setAttribute("data-act", "apply");
        apply.textContent = "Применить";
        dialog.appendChild(apply);
        apply.addEventListener("click", function () {
          var byId = {};
          preview.forEach(function (row) { byId[row.id] = row; });
          lotsApi.eachLot(chosen(), function (lot) {
            var row = byId[lot.id];
            if (!row || !row.changed) return Promise.resolve({ ok: true, skipped: true });
            return lotsApi.editLot(lot, location, fetch, { title: row.after });
          }).then(function (results) {
            dialog.remove();
            showResults(results);
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
      if (id === "done") {
        selecting = false;
        selected = {};
        clearRowMarks();
        render();
        return;
      }
      if (id === "raise") { runRaise(); return; }
      if (id === "activate" || id === "deactivate") { runRowAction(id); return; }
      if (id === "delete") { confirmDelete(); return; }
      if (id === "clone") { runClone(""); return; }
      if (id === "duplicate") { runClone(" копия"); return; }
      if (id === "price") { openPrice(); return; }
      if (id === "titles") { openTitles(); return; }
    });

    search.addEventListener("input", function () {
      applySearch();
      paintChecks();
    });

    render();
  }

  root.LLVLotsUI = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
