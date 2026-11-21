(function (root) {
  function readSession(doc) {
    var raw = doc.body && doc.body.getAttribute("data-app-data");
    if (!raw) return { userId: 0, csrf: "" };
    try {
      var data = JSON.parse(raw);
      return {
        userId: Number(data.userId) || 0,
        csrf: data["csrf-token"] || ""
      };
    } catch (error) {
      return { userId: 0, csrf: "" };
    }
  }

  function text(node) {
    return ((node && (node.innerText || node.textContent)) || "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function isOwnRow(row, userId) {
    if (!row || (row.closest && row.closest("#llv-shift-root"))) return false;
    var owner = row.getAttribute && row.getAttribute("data-user");
    if (owner && userId && String(owner) !== String(userId)) return false;
    if (owner && userId && String(owner) === String(userId)) return true;
    var ownTable = row.closest && row.closest(".showcase-has-actions, .tc-seller, .offer-edit-links");
    if (ownTable && row.getAttribute("data-offer")) return true;
    if (row.querySelector && row.querySelector("[data-action='delete'], [data-action='restore'], [data-action='deactivate'], [data-action='activate']")) {
      return true;
    }
    return false;
  }

  function lotId(row) {
    if (!row) return "";
    var offer = row.getAttribute && row.getAttribute("data-offer");
    if (offer) return offer;
    var id = row.getAttribute && row.getAttribute("data-id");
    if (id) return id;
    var link = row.querySelector && row.querySelector("a[href*='offerEdit'], a[href*='id=']");
    if (link) {
      var match = (link.getAttribute("href") || "").match(/[?&]id=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    var href = (row.getAttribute && row.getAttribute("href")) || "";
    var own = href.match(/[?&]id=([^&]+)/);
    return own ? decodeURIComponent(own[1]) : "";
  }

  function nodeFrom(doc) {
    var path = (doc.location && doc.location.pathname) || "";
    var match = path.match(/\/(?:lots|chips)\/(\d+)/);
    return match ? match[1] : "";
  }

  function editHref(row) {
    if (!row) return "";
    var link = row.querySelector && row.querySelector("a[href*='offerEdit']");
    if (link) return link.getAttribute("href");
    if (row.matches && row.matches("a[href*='offerEdit']")) return row.getAttribute("href");
    return "";
  }

  function priceText(row) {
    var node = row.querySelector && row.querySelector(".tc-price");
    var raw = text(node);
    var match = raw.match(/([^\d\s]*)\s*(\d[\d\s]*(?:[.,]\d+)?)/);
    if (!match) return { price: "", currency: "" };
    return {
      currency: (match[1] || "").trim(),
      price: match[2].replace(/\s/g, "").replace(",", ".")
    };
  }

  function offerFrom(row, doc) {
    var titleNode = row.querySelector && row.querySelector(".tc-desc-text, .tc-title, .offer-title");
    var price = priceText(row);
    return {
      id: lotId(row),
      title: text(titleNode),
      price: price.price,
      currency: price.currency,
      editHref: editHref(row),
      nodeId: nodeFrom(doc),
      row: row
    };
  }

  function collectLots(doc) {
    var session = readSession(doc);
    var rows = Array.prototype.slice.call(doc.querySelectorAll("a.tc-item, a[data-offer], .offer-list a"));
    var seen = {};
    var lots = [];
    var foreign = [];
    rows.forEach(function (row) {
      if (row.closest && (row.closest("#llv-shift-root") || row.closest("#llv-profile-panel") || row.closest("#llv-settings"))) return;
      if (!(row.matches && row.matches(".tc-item, a[data-offer]")) && !(row.querySelector && row.querySelector(".tc-price"))) return;
      var id = lotId(row);
      if (!id || seen[id]) return;
      seen[id] = true;
      var item = offerFrom(row, doc);
      if (isOwnRow(row, session.userId)) lots.push(item);
      else if (row.getAttribute("data-offer")) foreign.push(item);
    });
    return { session: session, lots: lots, foreign: foreign };
  }

  function editUrl(lot, loc) {
    if (lot.editHref) {
      try { return new URL(lot.editHref, loc.href).href; } catch (error) { return ""; }
    }
    if (!lot.id || !lot.nodeId) return "";
    if (!/\/(lots|chips)\/\d+/.test(loc.pathname || "")) return "";
    return loc.origin + "/lots/offerEdit?node=" + encodeURIComponent(lot.nodeId) + "&offer=" + encodeURIComponent(lot.id);
  }

  function replaceWord(title, from, to) {
    var source = String(title || "");
    var needle = String(from || "");
    if (!needle) return source;
    return source.split(needle).join(String(to || ""));
  }

  function previewTitles(lots, from, to) {
    return lots.map(function (lot) {
      var after = replaceWord(lot.title, from, to);
      return { id: lot.id, before: lot.title, after: after, changed: after !== lot.title };
    });
  }

  function wordsOf(title) {
    return String(title || "").trim().split(/\s+/).filter(Boolean);
  }

  function oneWordApart(left, right) {
    var a = wordsOf(left);
    var b = wordsOf(right);
    if (!a.length || !b.length) return false;
    if (a.length === b.length) {
      var diff = 0;
      for (var i = 0; i < a.length; i += 1) {
        if (a[i].toLowerCase() !== b[i].toLowerCase()) diff += 1;
      }
      return diff === 1;
    }
    if (Math.abs(a.length - b.length) !== 1) return false;
    var longer = a.length > b.length ? a : b;
    var shorter = a.length > b.length ? b : a;
    var iLong = 0;
    var iShort = 0;
    var skips = 0;
    while (iLong < longer.length && iShort < shorter.length) {
      if (longer[iLong].toLowerCase() === shorter[iShort].toLowerCase()) {
        iLong += 1;
        iShort += 1;
      } else {
        skips += 1;
        iLong += 1;
        if (skips > 1) return false;
      }
    }
    return skips + (longer.length - iLong) === 1;
  }

  function similarTitleIds(lots) {
    var marked = {};
    for (var i = 0; i < lots.length; i += 1) {
      for (var j = i + 1; j < lots.length; j += 1) {
        if (!oneWordApart(lots[i].title, lots[j].title)) continue;
        marked[lots[i].id] = true;
        marked[lots[j].id] = true;
      }
    }
    return Object.keys(marked);
  }

  function withinHours(hour, from, to) {
    var start = Number(from);
    var end = Number(to);
    var now = Number(hour);
    if (!isFinite(start) || !isFinite(end) || !isFinite(now)) return false;
    start = ((Math.floor(start) % 24) + 24) % 24;
    end = ((Math.floor(end) % 24) + 24) % 24;
    now = ((Math.floor(now) % 24) + 24) % 24;
    if (start === end) return false;
    if (start < end) return now >= start && now < end;
    return now >= start || now < end;
  }

  async function previewDescriptions(lots, from, to, loc, fetchImpl) {
    var rows = [];
    for (var i = 0; i < lots.length; i += 1) {
      var lot = lots[i];
      try {
        var loaded = await loadForm(lot, loc, fetchImpl);
        if (!loaded.ok) {
          rows.push({ id: lot.id, title: lot.title, before: "", after: "", changed: false, error: loaded.error || "Описание не прочитано" });
          continue;
        }
        if (!loaded.form.descField) {
          rows.push({ id: lot.id, title: lot.title, before: "", after: "", changed: false, error: "В форме нет описания" });
          continue;
        }
        var before = loaded.form.descField.value || "";
        var after = replaceWord(before, from, to);
        rows.push({ id: lot.id, title: lot.title, before: before, after: after, changed: after !== before, error: "" });
      } catch (error) {
        rows.push({ id: lot.id, title: lot.title, before: "", after: "", changed: false, error: error.message || "Ошибка" });
      }
    }
    return rows;
  }

  function isLoginDoc(doc) {
    if (/войти|sign in|log in/i.test(doc.title || "")) return true;
    var password = doc.querySelector("input[type='password']");
    var offerField = doc.querySelector("textarea, input[name*='summary'], input[name='price']");
    return !!(password && !offerField);
  }

  function isPurchaseForm(form) {
    if (form.querySelector("[name='player'], [name='price_guard'], [name='quantity']")) return true;
    var button = form.querySelector("button, input[type='submit']");
    var label = text(button) || (button && button.value) || "";
    return /^\s*купить\s*$|^\s*buy\s*$/i.test(label);
  }

  var FILE_RULES = [
    { key: "image", re: /image|img|photo|picture|скрин|картинк/i },
    { key: "flag", re: /flag/i },
    { key: "position", re: /position|sort|order|поряд/i }
  ];

  function readOfferForm(doc, pageUrl) {
    if (isLoginDoc(doc)) return { login: true };
    var forms = Array.prototype.slice.call(doc.querySelectorAll("form"));
    var form = null;
    for (var i = 0; i < forms.length; i += 1) {
      if (isPurchaseForm(forms[i])) continue;
      if (/summary|desc|price/i.test(forms[i].innerHTML)) {
        form = forms[i];
        break;
      }
    }
    if (!form) return null;
    var fields = [];
    var files = [];
    Array.prototype.slice.call(form.elements || form.querySelectorAll("input, textarea, select, button")).forEach(function (input) {
      if (!input.name || input.type === "password" || input.type === "submit" || input.type === "button") return;
      if (input.type === "file") {
        files.push({ name: input.name, rule: "" });
        return;
      }
      if ((input.type === "checkbox" || input.type === "radio") && !input.checked) return;
      if (input.disabled) return;
      fields.push({ name: input.name, value: input.value || "" });
    });
    function find(re) {
      for (var index = 0; index < fields.length; index += 1) {
        if (re.test(fields[index].name)) return fields[index];
      }
      return null;
    }
    files.forEach(function (file) {
      FILE_RULES.forEach(function (rule) {
        if (!file.rule && rule.re.test(file.name)) file.rule = rule.key;
      });
    });
    var action = form.getAttribute("action") || pageUrl;
    try { action = new URL(action, pageUrl).href; } catch (error) { action = pageUrl; }
    return {
      action: action,
      method: (form.getAttribute("method") || "post").toUpperCase(),
      fields: fields,
      files: files,
      hasFile: files.length > 0,
      titleField: find(/summary|title/i),
      descField: find(/desc/i),
      priceField: find(/price/i),
      currencyField: find(/currency/i),
      offerField: find(/offer_id|^offer$|^id$/i)
    };
  }

  function encodeForm(fields) {
    return fields.map(function (field) {
      return encodeURIComponent(field.name) + "=" + encodeURIComponent(field.value);
    }).join("&");
  }

  function setField(fields, name, value) {
    var found = false;
    var next = fields.map(function (field) {
      if (field.name !== name) return { name: field.name, value: field.value };
      found = true;
      return { name: name, value: value };
    });
    if (!found && name) next.push({ name: name, value: value });
    return next;
  }

  function withoutOfferId(fields) {
    return fields.map(function (field) {
      if (/offer_id|^offer$|^id$/i.test(field.name)) return { name: field.name, value: "" };
      return { name: field.name, value: field.value };
    });
  }

  function findRaiseControl(doc) {
    var nodes = Array.prototype.slice.call(doc.querySelectorAll("a, button, input[type='submit'], input[type='button']"));
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.closest && (node.closest("#llv-shift-root") || node.closest("#llv-profile-panel") || node.closest("#llv-settings"))) continue;
      var label = text(node) || node.value || "";
      if (/купить|buy/i.test(label)) continue;
      if (/поднять|raise/i.test(label)) return node;
    }
    return doc.querySelector("form[action*='raise']");
  }

  async function loadForm(lot, loc, fetchImpl) {
    var url = lot.editHref && /^https?:/.test(lot.editHref) ? lot.editHref : editUrl(lot, loc);
    if (!url) return { ok: false, error: "На странице нет редактирования этого лота" };
    var response = await fetchImpl(url, { credentials: "include" });
    var html = await response.text();
    var doc = new DOMParser().parseFromString(html, "text/html");
    var form = readOfferForm(doc, url);
    if (form && form.login) return { ok: false, error: "Войдите в FunPay. Пароль не читается." };
    if (!form || !form.titleField) return { ok: false, error: "Форма лота не найдена" };
    return { ok: true, form: form, url: url };
  }

  async function submitForm(form, fetchImpl) {
    var response = await fetchImpl(form.action, {
      method: form.method || "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm(form.fields)
    });
    if (!response.ok) return { ok: false, error: "FunPay ответил " + response.status };
    return { ok: true };
  }

  async function eachLot(lots, task) {
    var results = [];
    for (var i = 0; i < lots.length; i += 1) {
      var lot = lots[i];
      try {
        var result = await task(lot, i);
        results.push({
          id: lot.id,
          title: lot.title,
          ok: !!(result && result.ok),
          skipped: !!(result && result.skipped),
          error: (result && result.error) || ""
        });
      } catch (error) {
        results.push({ id: lot.id, title: lot.title, ok: false, skipped: false, error: error.message || "Ошибка" });
      }
    }
    return results;
  }

  function mergeChanges(form, changes, fields) {
    var next = changes || {};
    if (next.title !== undefined && next.title !== "" && form.titleField) fields = setField(fields, form.titleField.name, next.title);
    if (next.price !== undefined && next.price !== "" && form.priceField) fields = setField(fields, form.priceField.name, String(next.price));
    if (next.currency !== undefined && next.currency !== "" && form.currencyField) fields = setField(fields, form.currencyField.name, String(next.currency));
    if (next.description !== undefined && next.description !== "" && form.descField) fields = setField(fields, form.descField.name, next.description);
    return fields;
  }

  async function createFromTemplate(lot, loc, fetchImpl, changes) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    if (loaded.form.hasFile && !(lot.images && lot.images.length)) {
      var fresh = lot.editHref && /^https?:/.test(lot.editHref) ? lot.editHref : editUrl(lot, loc);
      return { ok: false, error: "У лота есть картинки. Откройте форму лота на FunPay и скопируйте его кнопкой «Клонировать лот»", retry: fresh };
    }
    var fields = mergeChanges(loaded.form, changes, withoutOfferId(loaded.form.fields));
    return submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetchImpl);
  }

  async function cloneLot(lot, loc, fetchImpl, suffix) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    var fields = withoutOfferId(loaded.form.fields);
    if (suffix && loaded.form.titleField) {
      fields = setField(fields, loaded.form.titleField.name, loaded.form.titleField.value + suffix);
    }
    if (lot.images && lot.images.length && loaded.form.hasFile) {
      try {
        return await submitMultipart(loaded.form, fields, lot.images, fetchImpl);
      } catch (error) {
        return { ok: false, error: "Не удалось перенести картинки: " + (error.message || "ошибка формы") };
      }
    }
    return submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetchImpl);
  }

  async function submitMultipart(form, fields, images, fetchImpl) {
    var data = new FormData();
    fields.forEach(function (field) { data.append(field.name, field.value); });
    var slots = (form.files || []).filter(function (file) { return file.rule === "image" || !file.rule; });
    if (!slots.length) return submitForm({ action: form.action, method: form.method, fields: fields }, fetchImpl);
    for (var i = 0; i < images.length && i < slots.length; i += 1) {
      var image = images[i];
      var blob = await fetchImpl(image.src, { credentials: "include" }).then(function (response) { return response.blob(); });
      var name = decodeURIComponent((image.src.split("?")[0].split("/").pop() || "image") ) || "image";
      data.append(slots[i].name, blob, name);
    }
    var response = await fetchImpl(form.action, {
      method: "POST",
      credentials: "include",
      body: data
    });
    if (!response.ok) return { ok: false, error: "FunPay ответил " + response.status };
    return { ok: true };
  }

  async function editLot(lot, loc, fetchImpl, changes) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    var fields = loaded.form.fields.map(function (field) { return { name: field.name, value: field.value }; });
    if (changes.price !== undefined && changes.price !== "") {
      if (!loaded.form.priceField) return { ok: false, error: "В форме нет цены" };
      fields = setField(fields, loaded.form.priceField.name, changes.price);
    }
    if (changes.currency !== undefined && changes.currency !== "" && loaded.form.currencyField) {
      fields = setField(fields, loaded.form.currencyField.name, changes.currency);
    }
    if (changes.description !== undefined && changes.description !== "") {
      if (!loaded.form.descField) return { ok: false, error: "В форме нет описания" };
      fields = setField(fields, loaded.form.descField.name, changes.description);
    }
    if (changes.title !== undefined) {
      if (!loaded.form.titleField) return { ok: false, error: "В форме нет названия" };
      fields = setField(fields, loaded.form.titleField.name, changes.title);
    }
    return submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetchImpl);
  }

  async function readLot(lot, loc, fetchImpl) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    return {
      ok: true,
      url: loaded.url,
      form: {
        title: loaded.form.titleField ? loaded.form.titleField.value : "",
        description: loaded.form.descField ? loaded.form.descField.value : "",
        price: loaded.form.priceField ? loaded.form.priceField.value : "",
        currency: loaded.form.currencyField ? loaded.form.currencyField.value : "",
        hasFile: loaded.form.hasFile,
        action: loaded.form.action
      }
    };
  }

  function imagesOf(doc) {
    var srcs = [];
    doc.querySelectorAll("a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!/(jpg|jpeg|png|webp|gif)(\?|$)/i.test(href)) return;
      if (srcs.indexOf(href) === -1) srcs.push(href);
    });
    return srcs.slice(0, 12).map(function (src) {
      return { src: src.indexOf("http") === 0 ? src : (doc.location ? doc.location.origin + src : src) };
    });
  }

  function rowById(doc, id) {
    var safe = String(id || "").replace(/'/g, "");
    if (!safe) return null;
    return doc.querySelector(".tc-item[data-offer='" + safe + "'], a.tc-item[data-offer='" + safe + "'], [data-offer='" + safe + "']");
  }

  function clickRowAction(row, action) {
    if (!row) return { ok: false, error: "Лот не найден на странице" };
    var node = row.querySelector("[data-action='" + action + "']");
    if (!node) {
      var pattern = {
        activate: /включ|актив|enable/i,
        deactivate: /выключ|деактив|disable/i,
        delete: /удал|delete/i
      }[action];
      var nodes = row.querySelectorAll("a, button");
      for (var i = 0; i < nodes.length; i += 1) {
        var label = text(nodes[i]);
        if (/купить|buy/i.test(label)) continue;
        if (pattern && pattern.test(label)) {
          node = nodes[i];
          break;
        }
      }
    }
    if (!node || /купить/i.test(text(node))) return { ok: false, error: "На странице нет этого действия" };
    var anchor = node.closest && node.closest("a");
    if (anchor) {
      anchor.addEventListener("click", function (event) { event.preventDefault(); }, { once: true });
    }
    node.click();
    return { ok: true };
  }

  function raiseOnPage(doc) {
    var control = findRaiseControl(doc);
    if (!control) return { ok: false, error: "На странице нет кнопки «Поднять»" };
    if (control.tagName === "FORM") {
      if (typeof control.requestSubmit === "function") control.requestSubmit();
      else control.submit();
    } else {
      control.click();
    }
    try { doc.dispatchEvent(new CustomEvent("llv-raised")); } catch (error) { /* page can block events */ }
    return { ok: true };
  }

  function pageLocale(doc) {
    var raw = doc.body ? (doc.body.getAttribute("data-app-data") || "") : "";
    var match = raw.match(/"locale"\s*:\s*"([a-z]{2})"/i);
    return match ? match[1].toLowerCase() : "ru";
  }

  function raiseRequestPath(doc) {
    var locale = pageLocale(doc);
    return (locale === "ru" ? "" : "/" + locale) + "/lots/raise";
  }

  function raiseTarget(doc, loc) {
    var button = doc.querySelector(".js-lot-raise, .raise-box, [data-action='raise']");
    var gameId = button && button.getAttribute("data-game");
    var nodeId = button && button.getAttribute("data-node");
    if (gameId && nodeId) return { gameId: gameId, nodeId: nodeId };
    var showcase = doc.querySelector("[data-game]");
    gameId = showcase && showcase.getAttribute("data-game");
    var path = (loc && loc.pathname) || "";
    var fromPath = path.match(/\/(?:lots|chips)\/(\d+)/);
    var section = (showcase && showcase.getAttribute("data-section")) || "";
    var fromSection = section.match(/(?:lot|chip)-(\d+)/);
    nodeId = (fromPath && fromPath[1]) || (fromSection && fromSection[1]) || "";
    if (gameId && nodeId) return { gameId: gameId, nodeId: nodeId };
    return null;
  }

  function raiseBody(gameId, nodeId, nodeIds) {
    var parts = [
      "game_id=" + encodeURIComponent(gameId),
      "node_id=" + encodeURIComponent(nodeId)
    ];
    (nodeIds || []).forEach(function (id) {
      if (id) parts.push("node_ids[]=" + encodeURIComponent(id));
    });
    return parts.join("&");
  }

  function nodeIdsFromModal(html) {
    var parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    var ids = [];
    parsed.querySelectorAll("input[type='checkbox']").forEach(function (input) {
      if (input.value) ids.push(input.value);
    });
    return ids;
  }

  async function postRaise(path, gameId, nodeId, nodeIds, fetchImpl) {
    var response = await fetchImpl(path, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: raiseBody(gameId, nodeId, nodeIds)
    });
    var data = {};
    try { data = await response.json(); } catch (error) { data = {}; }
    if (!response.ok) return { ok: false, error: "FunPay ответил " + response.status, path: path };
    var message = data.msg || "";
    if (data.error) {
      // «Подождите 24 минуты» — не сбой, а ещё не наступил интервал поднятия.
      var wait = /подождите|подождить|wait/i.test(message);
      if (wait) {
        var minutes = (message.match(/(\d+)\s*(мин|min)/i) || [])[1];
        return {
          ok: false,
          wait: true,
          minutes: minutes ? Number(minutes) : 0,
          error: message,
          path: path
        };
      }
      return { ok: false, error: message || "Не удалось поднять", path: path };
    }
    return { ok: true, modal: data.modal || "", message: message, path: path, wait: data.wait || 0 };
  }

  async function raiseByRequest(doc, fetchImpl, loc) {
    var path = raiseRequestPath(doc);
    var pageLoc = loc || (typeof location !== "undefined" ? location : { pathname: "" });
    var target = raiseTarget(doc, pageLoc);
    var fetcher = fetchImpl;
    if (!fetcher && typeof fetch === "function") fetcher = fetch.bind(typeof globalThis !== "undefined" ? globalThis : this);
    if (!target || !fetcher) {
      var clicked = raiseOnPage(doc);
      clicked.path = path;
      return clicked;
    }
    var first = await postRaise(path, target.gameId, target.nodeId, null, fetcher);
    if (!first.ok || !first.modal) return first;
    var ids = nodeIdsFromModal(first.modal);
    if (!ids.length) ids = [target.nodeId];
    return postRaise(path, target.gameId, target.nodeId, ids, fetcher);
  }

  root.LLVLots = {
    readSession: readSession,
    collectLots: collectLots,
    editUrl: editUrl,
    replaceWord: replaceWord,
    previewTitles: previewTitles,
    previewDescriptions: previewDescriptions,
    similarTitleIds: similarTitleIds,
    withinHours: withinHours,
    readOfferForm: readOfferForm,
    isPurchaseForm: isPurchaseForm,
    findRaiseControl: findRaiseControl,
    encodeForm: encodeForm,
    withoutOfferId: withoutOfferId,
    loadForm: loadForm,
    submitForm: submitForm,
    cloneLot: cloneLot,
    createFromTemplate: createFromTemplate,
    editLot: editLot,
    readLot: readLot,
    imagesOf: imagesOf,
    eachLot: eachLot,
    raiseOnPage: raiseOnPage,
    raiseRequestPath: raiseRequestPath,
    raiseByRequest: raiseByRequest,
    raiseTarget: raiseTarget,
    raiseBody: raiseBody,
    nodeIdsFromModal: nodeIdsFromModal,
    pageLocale: pageLocale,
    rowById: rowById,
    lotId: lotId,
    clickRowAction: clickRowAction
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
