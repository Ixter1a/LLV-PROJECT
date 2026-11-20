(function (root) {
  var COMMANDS = [
    { id: "raise", label: "Поднять" },
    { id: "copy", label: "Копировать" },
    { id: "duplicate", label: "Дублировать" },
    { id: "edit", label: "Цена и описание" },
    { id: "titles", label: "Замена в названии" }
  ];

  function attach(panelRoot) {
    var lotsApi = root.LLVLots;
    var commands = panelRoot.querySelector(".llv-commands");
    var work = panelRoot.querySelector(".llv-work");
    if (!lotsApi || !commands || !work || commands.childElementCount) return;
    var selected = {};
    var preview = [];
    var active = "";
    var draft = { price: "", desc: "", from: "", to: "" };

    function remember() {
      var price = work.querySelector(".llv-price");
      var desc = work.querySelector(".llv-desc");
      var from = work.querySelector(".llv-from");
      var to = work.querySelector(".llv-to");
      if (price) draft.price = price.value;
      if (desc) draft.desc = desc.value;
      if (from) draft.from = from.value;
      if (to) draft.to = to.value;
    }

    function ownLots() {
      return lotsApi.collectLots(document).lots;
    }

    function chosen() {
      return ownLots().filter(function (lot) { return selected[lot.id]; });
    }

    function showCommands() {
      active = "";
      work.hidden = true;
      work.innerHTML = "";
      commands.hidden = false;
    }

    function showWork() {
      commands.hidden = true;
      work.hidden = false;
    }

    commands.innerHTML =
      '<p class="llv-kicker">Лоты</p>' +
      COMMANDS.map(function (command) {
        return '<button type="button" class="llv-cmd" data-cmd="' + command.id + '">' + command.label + "</button>";
      }).join("");

    commands.addEventListener("click", function (event) {
      var button = event.target.closest(".llv-cmd");
      if (!button || !commands.contains(button)) return;
      active = button.getAttribute("data-cmd");
      openCommand(active);
    });

    function field(label, className, value, placeholder) {
      return '<label class="llv-field"><span>' + label + '</span><input class="' + className + '" value="' +
        escapeAttr(value || "") + '" placeholder="' + escapeAttr(placeholder || "") + '" /></label>';
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, function (char) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
      });
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    function labelOf(id) {
      var found = COMMANDS.filter(function (command) { return command.id === id; })[0];
      return found ? found.label : id;
    }

    function lotList() {
      var lots = ownLots();
      if (!lots.length) {
        return '<p class="llv-note">Своих лотов здесь нет. Откройте категорию, где вы уже продаёте.</p>';
      }
      return '<label class="llv-check"><input type="checkbox" data-act="all" /><span>Выбрать все</span></label>' +
        lots.map(function (lot) {
          var checked = selected[lot.id] ? " checked" : "";
          return '<label class="llv-check"><input type="checkbox" data-id="' + escapeAttr(lot.id) + '"' + checked +
            " /><span>" + escapeHtml(lot.title || lot.id) + "</span></label>";
        }).join("");
    }

    function bindLots(onMissing) {
      var all = work.querySelector("[data-act='all']");
      if (all) {
        all.addEventListener("change", function () {
          ownLots().forEach(function (lot) { selected[lot.id] = all.checked; });
          openCommand(active);
        });
      }
      work.querySelectorAll("input[data-id]").forEach(function (input) {
        input.addEventListener("change", function () {
          selected[input.getAttribute("data-id")] = input.checked;
        });
      });
      var go = work.querySelector("[data-act='go']");
      if (!go) return;
      go.addEventListener("click", function () {
        if (!chosen().length) {
          work.querySelector(".llv-kicker").textContent = "Отметьте хотя бы один лот";
          return;
        }
        onMissing();
      });
    }

    function shell(extra, buttonLabel) {
      showWork();
      work.innerHTML =
        '<button type="button" class="llv-link" data-act="back">К командам</button>' +
        '<p class="llv-kicker">' + escapeHtml(labelOf(active)) + "</p>" +
        lotList() +
        extra +
        (ownLots().length && buttonLabel
          ? '<button type="button" class="llv-btn" data-act="go">' + escapeHtml(buttonLabel) + "</button>"
          : "") +
        '<p class="llv-note" data-role="hint"></p>';
      work.querySelector("[data-act='back']").addEventListener("click", showCommands);
    }

    function openCommand(id) {
      remember();
      if (id === "edit") {
        shell(
          field("Цена, ₽", "llv-price", draft.price, "Пусто — не менять") +
          '<label class="llv-field"><span>Описание</span><textarea class="llv-desc" placeholder="Пусто — не менять">' +
          escapeHtml(draft.desc) + "</textarea></label>",
          "Сохранить"
        );
        bindLots(saveEdit);
        return;
      }
      if (id === "titles") {
        shell(
          field("Было", "llv-from", draft.from, "Аренда") +
          field("Стало", "llv-to", draft.to, "Продажа"),
          "Показать замену"
        );
        bindLots(showPreview);
        return;
      }
      shell("", labelOf(id));
      bindLots(function () {
        if (id === "raise") runRaise();
        else runClone(id === "duplicate" ? " копия" : "");
      });
    }

    function runRaise() {
      var raised = lotsApi.raiseOnPage(document);
      preview = chosen().map(function (lot) {
        return { id: lot.id, title: lot.title, ok: raised.ok, error: raised.error || "" };
      });
      renderResult();
    }

    function runClone(suffix) {
      lotsApi.eachLot(chosen(), function (lot) {
        return lotsApi.cloneLot(lot, location, fetch, suffix);
      }).then(function (results) {
        preview = results;
        renderResult();
      });
    }

    function saveEdit() {
      var price = work.querySelector(".llv-price").value.trim();
      var description = work.querySelector(".llv-desc").value;
      if (!price && !description.trim()) {
        work.querySelector(".llv-kicker").textContent = "Заполните цену или описание";
        return;
      }
      lotsApi.eachLot(chosen(), function (lot) {
        return lotsApi.editLot(lot, location, fetch, { price: price, description: description.trim() });
      }).then(function (results) {
        preview = results;
        renderResult();
      });
    }

    function showPreview() {
      remember();
      var from = draft.from;
      var to = draft.to;
      if (!from) {
        work.querySelector(".llv-kicker").textContent = "Введите слово, которое нужно заменить";
        return;
      }
      preview = lotsApi.previewTitles(chosen(), from, to);
      var rows = preview.map(function (row) {
        return '<p class="llv-pair"><span>' + escapeHtml(row.before || "—") + "</span><span>" +
          escapeHtml(row.changed ? row.after : "без изменений") + "</span></p>";
      }).join("");
      showWork();
      work.innerHTML =
        '<button type="button" class="llv-link" data-act="back">Назад</button>' +
        '<p class="llv-kicker">Проверка перед записью</p>' +
        rows +
        '<button type="button" class="llv-btn" data-act="apply">Применить</button>';
      work.querySelector("[data-act='back']").addEventListener("click", function () {
        openCommand("titles");
      });
      work.querySelector("[data-act='apply']").addEventListener("click", function () {
        var byId = {};
        preview.forEach(function (row) { byId[row.id] = row; });
        lotsApi.eachLot(chosen(), function (lot) {
          var row = byId[lot.id];
          if (!row || !row.changed) return Promise.resolve({ ok: true, skipped: true });
          return lotsApi.editLot(lot, location, fetch, { title: row.after });
        }).then(function (results) {
          preview = results;
          renderResult();
        });
      });
    }

    function renderResult() {
      var rows = preview.map(function (row) {
        var state = row.skipped ? "без изменений" : (row.ok ? "готово" : row.error || "ошибка");
        return '<p class="llv-pair" data-lot="' + escapeAttr(row.id) + '"><span>' +
          escapeHtml(row.title || row.id) + "</span><span>" + escapeHtml(state) + "</span></p>";
      }).join("");
      showWork();
      work.innerHTML =
        '<p class="llv-kicker">Результат по каждому лоту</p>' +
        rows +
        '<button type="button" class="llv-btn" data-act="done">К командам</button>';
      work.querySelector("[data-act='done']").addEventListener("click", showCommands);
    }
  }

  root.LLVLotsUI = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
