(function (root) {
  function attach(panelRoot) {
    var lotsApi = root.LLVLots;
    if (!lotsApi || panelRoot.querySelector(".llv-lots")) return;
    var host = document.createElement("div");
    host.className = "llv-lots";
    host.hidden = true;
    panelRoot.querySelector(".llv-panel").appendChild(host);
    var opener = document.createElement("button");
    opener.type = "button";
    opener.className = "llv-link";
    opener.textContent = "Лоты";
    panelRoot.querySelector(".llv-body").appendChild(opener);
    var screen = "home";
    var selected = {};
    var action = "raise";
    var preview = [];

    function ownLots() {
      return lotsApi.collectLots(document).lots;
    }

    function chosen() {
      return ownLots().filter(function (lot) { return selected[lot.id]; });
    }

    function showShift() {
      host.hidden = true;
      panelRoot.querySelector(".llv-body").hidden = false;
    }

    function showLots() {
      panelRoot.querySelector(".llv-body").hidden = true;
      host.hidden = false;
      render();
    }

    opener.addEventListener("click", showLots);

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

    function render() {
      if (screen === "preview") renderPreview();
      else if (screen === "edit") renderEdit();
      else if (screen === "result") renderResult();
      else renderHome();
    }

    function renderHome() {
      var lots = ownLots();
      var items = lots.map(function (lot) {
        var checked = selected[lot.id] ? " checked" : "";
        return '<label class="llv-check"><input type="checkbox" data-id="' + escapeAttr(lot.id) + '"' + checked + ' /><span>' +
          escapeHtml(lot.title || lot.id) + '</span></label>';
      }).join("");
      host.innerHTML =
        '<button type="button" class="llv-link" data-act="back">К смене</button>' +
        '<p class="llv-kicker">Свои лоты на этой странице</p>' +
        (lots.length
          ? '<label class="llv-check"><input type="checkbox" data-act="all" /><span>Выбрать все</span></label>' + items
          : '<p class="llv-note">Своих лотов здесь нет. Откройте категорию, где вы уже продаёте.</p>') +
        '<div class="llv-choices">' +
          choice("raise", "Поднять") +
          choice("copy", "Копировать") +
          choice("duplicate", "Дублировать") +
          choice("edit", "Цена и описание") +
          choice("titles", "Замена в названии") +
        '</div>' +
        '<button type="button" class="llv-btn" data-act="next">Дальше</button>' +
        '<p class="llv-note" data-role="hint"></p>';
      bindHome();
    }

    function choice(value, label) {
      return '<label class="llv-check"><input type="radio" name="llv-act" value="' + value + '"' +
        (action === value ? " checked" : "") + ' /><span>' + label + '</span></label>';
    }

    function bindHome() {
      host.querySelector("[data-act='back']").addEventListener("click", showShift);
      var all = host.querySelector("[data-act='all']");
      if (all) {
        all.addEventListener("change", function () {
          ownLots().forEach(function (lot) { selected[lot.id] = all.checked; });
          renderHome();
        });
      }
      host.querySelectorAll("input[data-id]").forEach(function (input) {
        input.addEventListener("change", function () {
          selected[input.getAttribute("data-id")] = input.checked;
        });
      });
      host.querySelectorAll("input[name='llv-act']").forEach(function (input) {
        input.addEventListener("change", function () { action = input.value; });
      });
      host.querySelector("[data-act='next']").addEventListener("click", onNext);
    }

    function onNext() {
      var lots = chosen();
      var hint = host.querySelector("[data-role='hint']");
      if (!lots.length) {
        hint.textContent = "Отметьте хотя бы один лот";
        return;
      }
      if (action === "raise") {
        var raised = lotsApi.raiseOnPage(document);
        screen = "result";
        preview = lots.map(function (lot) {
          return { id: lot.id, title: lot.title, ok: raised.ok, error: raised.error || "" };
        });
        render();
        return;
      }
      if (action === "edit") {
        screen = "edit";
        render();
        return;
      }
      if (action === "titles") {
        screen = "titles";
        renderTitles();
        return;
      }
      runClone(lots, action === "duplicate" ? " копия" : "");
    }

    function renderTitles() {
      host.innerHTML =
        '<button type="button" class="llv-link" data-act="back">Назад</button>' +
        '<p class="llv-kicker">Одно слово во всех отмеченных названиях</p>' +
        field("Было", "llv-from", "", "Аренда") +
        field("Стало", "llv-to", "", "Продажа") +
        '<button type="button" class="llv-btn" data-act="preview">Показать замену</button>';
      host.querySelector("[data-act='back']").addEventListener("click", function () {
        screen = "home";
        renderHome();
      });
      host.querySelector("[data-act='preview']").addEventListener("click", function () {
        var from = host.querySelector(".llv-from").value;
        var to = host.querySelector(".llv-to").value;
        if (!from) {
          host.querySelector(".llv-kicker").textContent = "Введите слово, которое нужно заменить";
          return;
        }
        preview = lotsApi.previewTitles(chosen(), from, to);
        screen = "preview";
        renderPreview();
      });
    }

    function renderPreview() {
      var rows = preview.map(function (row) {
        return '<p class="llv-pair"><span>' + escapeHtml(row.before || "—") + '</span><span>' +
          escapeHtml(row.changed ? row.after : "без изменений") + '</span></p>';
      }).join("");
      host.innerHTML =
        '<button type="button" class="llv-link" data-act="back">Назад</button>' +
        '<p class="llv-kicker">Проверка перед записью</p>' +
        rows +
        '<button type="button" class="llv-btn" data-act="apply">Применить</button>';
      host.querySelector("[data-act='back']").addEventListener("click", function () {
        screen = "titles";
        renderTitles();
      });
      host.querySelector("[data-act='apply']").addEventListener("click", function () {
        var byId = {};
        preview.forEach(function (row) { byId[row.id] = row; });
        lotsApi.eachLot(chosen(), function (lot) {
          var row = byId[lot.id];
          if (!row || !row.changed) return Promise.resolve({ ok: true, skipped: true });
          return lotsApi.editLot(lot, location, fetch, { title: row.after });
        }).then(function (results) {
          preview = results;
          screen = "result";
          renderResult();
        });
      });
    }

    function renderEdit() {
      host.innerHTML =
        '<button type="button" class="llv-link" data-act="back">Назад</button>' +
        '<p class="llv-kicker">Новая цена и описание</p>' +
        field("Цена, ₽", "llv-price", "", "Оставьте пустым, чтобы не менять") +
        '<label class="llv-field"><span>Описание</span><textarea class="llv-desc" placeholder="Оставьте пустым, чтобы не менять"></textarea></label>' +
        '<button type="button" class="llv-btn" data-act="save">Сохранить</button>';
      host.querySelector("[data-act='back']").addEventListener("click", function () {
        screen = "home";
        renderHome();
      });
      host.querySelector("[data-act='save']").addEventListener("click", function () {
        var price = host.querySelector(".llv-price").value.trim();
        var description = host.querySelector(".llv-desc").value;
        if (!price && !description.trim()) {
          host.querySelector(".llv-kicker").textContent = "Заполните цену или описание";
          return;
        }
        lotsApi.eachLot(chosen(), function (lot) {
          return lotsApi.editLot(lot, location, fetch, { price: price, description: description.trim() });
        }).then(function (results) {
          preview = results;
          screen = "result";
          renderResult();
        });
      });
    }

    function runClone(lots, suffix) {
      lotsApi.eachLot(lots, function (lot) {
        return lotsApi.cloneLot(lot, location, fetch, suffix);
      }).then(function (results) {
        preview = results;
        screen = "result";
        renderResult();
      });
    }

    function renderResult() {
      var rows = preview.map(function (row) {
        var state = row.skipped ? "без изменений" : (row.ok ? "готово" : row.error || "ошибка");
        return '<p class="llv-pair" data-lot="' + escapeAttr(row.id) + '"><span>' +
          escapeHtml(row.title || row.id) + '</span><span>' + escapeHtml(state) + '</span></p>';
      }).join("");
      host.innerHTML =
        '<p class="llv-kicker">Результат по каждому лоту</p>' +
        rows +
        '<button type="button" class="llv-btn" data-act="done">К списку</button>';
      host.querySelector("[data-act='done']").addEventListener("click", function () {
        screen = "home";
        renderHome();
      });
    }
  }

  root.LLVLotsUI = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
