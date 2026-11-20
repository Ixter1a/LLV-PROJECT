(function () {
  var PASSWORD = "LLVPASSWORD";
  var SESSION_KEY = "llv.gate";
  var config = window.LLV_CONFIG || {};
  try {
    var overrideUrl = sessionStorage.getItem("llv.supabase.url");
    var overrideKey = sessionStorage.getItem("llv.supabase.key");
    if (overrideUrl && overrideKey) {
      config = { SUPABASE_URL: overrideUrl, SUPABASE_ANON_KEY: overrideKey };
    }
  } catch (error) { /* сессия может быть закрыта */ }
  var app = document.getElementById("app");

  function isPlaceholder(value) {
    var text = String(value || "").trim();
    if (!text) return true;
    return /YOUR_|YOUR-PROJECT|changeme|вставьте|paste|xxxx+/i.test(text);
  }

  function demoMode() {
    return isPlaceholder(config.SUPABASE_URL) || isPlaceholder(config.SUPABASE_ANON_KEY);
  }

  function netOf(amount) {
    var cents = Math.round(Number(amount) * 100);
    if (!isFinite(cents)) return 0;
    return Math.round(cents * 0.1) / 100;
  }

  function formatCount(value) {
    return new Intl.NumberFormat("ru-RU").format(value || 0);
  }

  function formatRub(value) {
    var number = Number(value) || 0;
    var digits = Math.round(Math.abs(number) * 100) % 100 === 0 ? 0 : 2;
    var formatted = new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
    return formatted + "\u00a0₽";
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  }

  function aggregate(data) {
    var workers = data.workers || [];
    var shifts = data.shifts || [];
    var sales = data.sales || [];
    var byWorker = {};
    workers.forEach(function (worker) {
      byWorker[worker.id] = {
        id: worker.id,
        name: worker.name,
        count: 0,
        revenue: 0,
        net: 0,
        shifts: 0
      };
    });
    shifts.forEach(function (shift) {
      if (!byWorker[shift.worker_id]) return;
      byWorker[shift.worker_id].shifts += 1;
    });
    var byShift = {};
    shifts.forEach(function (shift) {
      byShift[shift.id] = {
        id: shift.id,
        workerId: shift.worker_id,
        name: byWorker[shift.worker_id] ? byWorker[shift.worker_id].name : "—",
        startedAt: shift.started_at,
        endedAt: shift.ended_at,
        count: 0,
        revenue: 0,
        net: 0
      };
    });
    sales.forEach(function (sale) {
      var count = Number(sale.count) || 0;
      var revenue = Number(sale.amount_rub) || 0;
      var net = netOf(revenue);
      if (byWorker[sale.worker_id]) {
        byWorker[sale.worker_id].count += count;
        byWorker[sale.worker_id].revenue += revenue;
        byWorker[sale.worker_id].net += net;
      }
      if (byShift[sale.shift_id]) {
        byShift[sale.shift_id].count += count;
        byShift[sale.shift_id].revenue += revenue;
        byShift[sale.shift_id].net += net;
      }
    });
    var rows = Object.keys(byWorker).map(function (id) { return byWorker[id]; });
    rows.sort(function (a, b) { return b.revenue - a.revenue || a.name.localeCompare(b.name, "ru"); });
    var history = Object.keys(byShift).map(function (id) { return byShift[id]; });
    history.sort(function (a, b) { return new Date(b.startedAt) - new Date(a.startedAt); });
    var totals = rows.reduce(function (sum, row) {
      sum.count += row.count;
      sum.revenue += row.revenue;
      sum.net += row.net;
      sum.shifts += row.shifts;
      return sum;
    }, { count: 0, revenue: 0, net: 0, shifts: 0 });
    return { rows: rows, history: history, totals: totals };
  }

  function mergeRemote(remote, ledger) {
    var data = {
      workers: (remote.workers || []).slice(),
      shifts: (remote.shifts || []).slice(),
      sales: (remote.sales || []).slice()
    };
    if (!ledger) return data;
    var workerIds = {};
    var shiftIds = {};
    var saleKeys = {};
    data.workers.forEach(function (row) { workerIds[row.id] = true; });
    data.shifts.forEach(function (row) { shiftIds[row.id] = true; });
    data.sales.forEach(function (row) { if (row.source_key) saleKeys[row.source_key] = true; });
    (ledger.workers || []).forEach(function (row) {
      if (!workerIds[row.id]) data.workers.push(row);
    });
    (ledger.shifts || []).forEach(function (row) {
      if (!shiftIds[row.id]) data.shifts.push(row);
    });
    (ledger.sales || []).forEach(function (row) {
      if (row.source_key && saleKeys[row.source_key]) return;
      data.sales.push(row);
    });
    return data;
  }

  function loadExtensionLedger() {
    return new Promise(function (resolve) {
      var runtime = window.chrome && window.chrome.runtime;
      var extensionId = window.LLV_EXTENSION_ID;
      if (!runtime || !runtime.sendMessage || !extensionId) {
        resolve(null);
        return;
      }
      try {
        runtime.sendMessage(extensionId, { type: "ledger" }, function (response) {
          if (runtime.lastError || !response || !response.ledger) resolve(null);
          else resolve(response.ledger);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function supabaseBase() {
    return String(config.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  }

  function loadLive() {
    var base = supabaseBase();
    var headers = {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + config.SUPABASE_ANON_KEY
    };
    function get(path) {
      return fetch(base + "/rest/v1/" + path, { headers: headers }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (body) {
            throw new Error(body.slice(0, 180) || ("HTTP " + response.status));
          });
        }
        return response.json();
      });
    }
    return Promise.all([
      get("workers?select=id,name,created_at&order=name.asc"),
      get("shifts?select=id,worker_id,started_at,ended_at&order=started_at.desc"),
      get("sales?select=id,worker_id,shift_id,count,amount_rub,sold_at,source_key&order=sold_at.desc")
    ]).then(function (parts) {
      return { workers: parts[0], shifts: parts[1], sales: parts[2] };
    });
  }

  function markImage(img) {
    var mark = img.closest(".brand-mark");
    function reveal() { mark.classList.add("use-fallback"); }
    img.addEventListener("error", reveal);
    img.addEventListener("load", function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 16, 16);
        var pixels = ctx.getImageData(0, 0, 16, 16).data;
        var opaque = 0;
        for (var i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 24) opaque += 1;
        }
        if (opaque < 4) reveal();
      } catch (error) {
        reveal();
      }
    });
  }

  function renderLogin(message) {
    app.innerHTML =
      '<div class="login-wrap">' +
        '<section class="glass login-card" id="login-card">' +
          '<div class="brand-mark">' +
            '<img src="assets/icon.png" alt="LLV" width="64" height="64" />' +
            '<span class="brand-mark-fallback" aria-hidden="true"></span>' +
          '</div>' +
          '<h1>Смены FunPay</h1>' +
          '<p class="lede">Учёт смен, штук и выручки. Чистая прибыль — 10% от суммы.</p>' +
          '<form id="gate">' +
            '<label class="field"><span>Пароль</span>' +
              '<input type="password" name="password" autocomplete="off" data-testid="login-password" />' +
            '</label>' +
            '<button class="btn btn-block" type="submit" data-testid="login-submit">Войти</button>' +
          '</form>' +
          '<p class="error" data-testid="login-error" role="alert">' + (message || "") + '</p>' +
        '</section>' +
      '</div>';
    markImage(app.querySelector("img"));
    var form = document.getElementById("gate");
    var input = form.querySelector("input");
    input.focus();
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (input.value === PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, "1");
        showDashboard();
        return;
      }
      var card = document.getElementById("login-card");
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      app.querySelector("[data-testid='login-error']").textContent = input.value
        ? "Неверный пароль"
        : "Введите пароль";
      input.value = "";
      input.focus();
    });
  }

  function cell(label, value) {
    return '<td data-label="' + escapeAttr(label) + '">' + value + "</td>";
  }

  function rowCells(name, count, revenue, net, shifts) {
    return cell("Сотрудник", name) +
      cell("Штуки", formatCount(count)) +
      cell("Выручка", formatRub(revenue)) +
      cell("Прибыль 10%", formatRub(net)) +
      cell("Смены", shifts);
  }

  function renderDashboard(model, meta) {
    var totals = model.totals;
    var workerRows = model.rows.map(function (row) {
      return "<tr data-testid='worker-row' data-worker='" + escapeAttr(row.name) + "'>" +
        rowCells(escapeHtml(row.name), row.count, row.revenue, row.net, formatCount(row.shifts)) +
        "</tr>";
    }).join("");
    var historyRows = model.history.map(function (shift) {
      var status = shift.endedAt
        ? "Завершена"
        : "<span class='dot' aria-hidden='true'></span><span class='status-live'>Идёт</span>";
      return "<tr>" +
        cell("Сотрудник", escapeHtml(shift.name)) +
        cell("Начало", formatWhen(shift.startedAt)) +
        cell("Конец", formatWhen(shift.endedAt)) +
        cell("Статус", status) +
        cell("Штуки", formatCount(shift.count)) +
        cell("Выручка", formatRub(shift.revenue)) +
        cell("Прибыль", formatRub(shift.net)) +
        "</tr>";
    }).join("");
    var empty = model.rows.length
      ? ""
      : "<p class='note'>Пока нет смен. На FunPay нажмите «Начать смену» в расширении.</p>";
    app.innerHTML =
      '<div class="shell" data-testid="dashboard">' +
        '<header class="top">' +
          '<div class="brand">' +
            '<div class="brand-mark"><img src="assets/icon.png" alt="" width="64" height="64" /><span class="brand-mark-fallback" aria-hidden="true"></span></div>' +
            '<div><h1>Смены</h1><p class="muted">FunPay · штуки, выручка и прибыль 10%</p></div>' +
          '</div>' +
          '<div class="top-actions">' +
            '<button class="btn" type="button" id="refresh" data-testid="refresh">Обновить</button>' +
            '<button class="text-btn" type="button" id="logout">Выйти</button>' +
          '</div>' +
        '</header>' +
        (meta.demo
          ? '<p class="glass banner" data-testid="demo-banner">' +
            (meta.local
              ? "Смены с этого компьютера. Ключи Supabase не заданы, в базу они не ушли."
              : "Демо-режим. Ключи Supabase не заданы — на экране пример, пока расширение ничего не записало.") +
            "</p>"
          : "") +
        (meta.error
          ? '<p class="glass banner" role="alert">Не удалось загрузить Supabase. Проверьте URL, anon key и что выполнен supabase/schema.sql.</p>'
          : '') +
        '<section class="metrics">' +
          '<article class="glass metric"><span>Штуки</span><strong data-testid="total-count">' + formatCount(totals.count) + '</strong><small>продажи за все смены</small></article>' +
          '<article class="glass metric"><span>Выручка</span><strong data-testid="total-revenue">' + formatRub(totals.revenue) + '</strong><small>сумма заказов</small></article>' +
          '<article class="glass metric"><span>Прибыль 10%</span><strong data-testid="total-net">' + formatRub(totals.net) + '</strong><small>считается на сайте</small></article>' +
        '</section>' +
        '<section class="glass section">' +
          '<div class="section-head"><h2>Сотрудники</h2><span>по выручке</span></div>' +
          empty +
          '<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Штуки</th><th>Выручка</th><th>Прибыль 10%</th><th>Смены</th></tr></thead><tbody>' +
          workerRows +
          '<tr class="total" data-testid="worker-total">' +
            rowCells("Всего", totals.count, totals.revenue, totals.net, formatCount(totals.shifts)) +
          '</tr></tbody></table></div>' +
        '</section>' +
        '<section class="glass section">' +
          '<div class="section-head"><h2>История смен</h2><span data-testid="history-count">' + formatCount(model.history.length) + '</span></div>' +
          '<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Начало</th><th>Конец</th><th>Статус</th><th>Штуки</th><th>Выручка</th><th>Прибыль</th></tr></thead><tbody>' +
          (historyRows || '<tr><td colspan="7">Смен пока нет</td></tr>') +
          '</tbody></table></div>' +
          '<p class="note">Прибыль по строке — 10% от выручки этой смены. В базе лежит сумма заказа, процент считается здесь.</p>' +
        '</section>' +
      '</div>';
    app.querySelectorAll(".brand-mark img").forEach(markImage);
    document.getElementById("logout").addEventListener("click", function () {
      sessionStorage.removeItem(SESSION_KEY);
      renderLogin("");
    });
    document.getElementById("refresh").addEventListener("click", function () {
      showDashboard();
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function showDashboard() {
    app.innerHTML = '<div class="shell"><p class="lede">Загрузка…</p></div>';
    Promise.all([demoMode() ? Promise.resolve(null) : loadLive(), loadExtensionLedger()]).then(function (parts) {
      var ledger = parts[1];
      var localHasRows = ledger && ((ledger.sales && ledger.sales.length) || (ledger.shifts && ledger.shifts.length));
      if (demoMode()) {
        var data = localHasRows ? ledger : window.LLV_DEMO;
        renderDashboard(aggregate(data), { demo: true, local: !!localHasRows, error: false });
        return;
      }
      renderDashboard(aggregate(mergeRemote(parts[0], ledger)), { demo: false, error: false });
    }).catch(function () {
      renderDashboard(aggregate({ workers: [], shifts: [], sales: [] }), { demo: false, error: true });
    });
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") showDashboard();
  else renderLogin("");
})();
