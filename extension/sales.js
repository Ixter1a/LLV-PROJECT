(function (root) {
  function units(text) {
    return String(text || "").replace(/\s+/g, "");
  }

  function amountFrom(rub) {
    var raw = units(rub.innerText || rub.textContent);
    var match = raw.match(/(\d[\d.,]*)/);
    if (!match) return null;
    var value = Number(match[1].replace(/\s/g, "").replace(",", "."));
    return isFinite(value) ? value : null;
  }

  function text(node) {
    if (!node) return "";
    return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function rowInfo(row) {
    var link = row.querySelector("a[href*='/orders/']");
    var href = link ? link.getAttribute("href") || "" : "";
    var id = row.getAttribute("data-id") || row.getAttribute("data-order") ||
      (href.match(/\/orders\/([A-Za-z0-9_-]{3,})/) || ["", ""])[1];
    var title = row.querySelector(".tc-desc-text, .tc-title");
    var status = row.querySelector(".tc-status, .tc-status-text");
    var date = row.querySelector(".tc-date, .tc-date-time");
    var rub = row.querySelector(".tc-price, .tc-price-inline");
    return {
      id: id || "",
      title: text(title),
      status: text(status),
      date: text(date),
      amount: rub ? amountFrom(rub) : null,
      text: text(row),
      html: row.innerHTML || "",
      hasOrderLink: !!link
    };
  }

  function isOrderRow(row) {
    if (!row || row.tagName === "TABLE" || row.tagName === "TBODY") return false;
    if (row.querySelector && row.querySelector("th")) return false;
    if (row.parentNode && row.parentNode.closest && row.parentNode.closest("tr")) return false;
    return !!(

      row.getAttribute("data-id") ||
      row.getAttribute("data-order") ||
      row.querySelector("a[href*='/orders/']") ||
      (row.querySelector(".tc-price, .tc-price-inline") && row.querySelector(".tc-status, .tc-date, .tc-desc-text")) ||
      row.classList.contains("order-item")
    );
  }

  function collect(doc, kinds) {
    var rows = [];
    var seen = {};
    var candidates = doc.querySelectorAll(".tc-item, .tc-row, tr, .order-item");
    Array.prototype.forEach.call(candidates, function (row, index) {
      if (row.closest && (row.closest("#llv-shift-root") || row.closest("#llv-profile-panel") || row.closest("#llv-settings"))) return;
      if (!isOrderRow(row)) return;
      var info = rowInfo(row);
      if (!info.text && !info.id) return;
      var key = info.id || info.text.slice(0, 120);
      if (seen[key]) return;
      seen[key] = true;
      info.row = index;
      info.kind = info.status;
      rows.push(info);
    });
    if (!kinds || !kinds.length) return rows;
    return rows.filter(function (row) {
      return kinds.some(function (kind) { return kind.test(row.status) || kind.test(row.text); });
    });
  }

  function stats(rows) {
    var sum = 0;
    var fees = 0;
    var days = {};
    var statuses = {};
    rows.forEach(function (row) {
      if (row.amount !== null) sum += row.amount;
      var day = (row.date.match(/\d{2}\.\d{2}\.\d{4}|\d{1,2}\s+[а-я]+/i) || [""])[0].toLowerCase();
      if (!day) return;
      days[day] = (days[day] || 0) + (row.amount || 0);
    });
    return { count: rows.length, sum: Math.round(sum * 100) / 100, days: days, statuses: statuses };
  }

  function groupBy(rows, field) {
    var out = {};
    rows.forEach(function (row) {
      var key = String(row[field] || "без значения").replace(/\d+/g, "#").trim() || "без значения";
      key = key.length > 40 ? key.slice(0, 40) + "…" : key;
      out[key] = (out[key] || 0) + (row.amount || 0);
    });
    return out;
  }

  function chart(container, map, limit) {
    container.innerHTML = "";
    var keys = Object.keys(map);
    if (!keys.length) {
      container.textContent = "Нет сумм на странице";
      return;
    }
    keys = keys.slice(-(limit || 14));
    var max = Math.max.apply(null, keys.map(function (key) { return map[key]; }).concat([1]));
    keys.forEach(function (key) {
      var line = document.createElement("div");
      line.className = "llv-bar";
      var bar = document.createElement("span");
      bar.style.width = Math.max(6, Math.round(map[key] / max * 190)) + "px";
      line.appendChild(bar);
      line.appendChild(document.createTextNode(" " + key + " · " + (root.LLV ? root.LLV.money(map[key]) : map[key]) + " ₽"));
      container.appendChild(line);
    });
  }

  function toCsv(rows, columns) {
    var lines = [columns.map(function (col) { return col[1]; }).join(";")];
    rows.forEach(function (row) {
      lines.push(columns.map(function (col) {
        var value = typeof col[0] === "function" ? col[0](row) : row[col[0]];
        return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
      }).join(";"));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  root.LLVSales = {
    collect: collect,
    stats: stats,
    groupBy: groupBy,
    chart: chart,
    toCsv: toCsv
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
