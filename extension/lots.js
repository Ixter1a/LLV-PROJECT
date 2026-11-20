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
    return ((node && (node.innerText || node.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function isOwnRow(row, userId) {
    if (!row || (row.closest && row.closest("#llv-shift-root"))) return false;
    var owner = row.getAttribute && row.getAttribute("data-user");
    if (owner && userId && String(owner) !== String(userId)) return false;
    if (owner && userId && String(owner) === String(userId)) return true;
    var ownTable = row.closest && row.closest(".showcase-has-actions");
    if (ownTable && row.getAttribute("data-offer")) return true;
    if (row.querySelector && row.querySelector("[data-action='delete'], [data-action='restore'], [data-action='deactivate'], [data-action='activate']")) {
      return true;
    }
    return false;
  }

  function lotId(row) {
    var offer = row.getAttribute && row.getAttribute("data-offer");
    if (offer) return offer;
    var href = (row.getAttribute && row.getAttribute("href")) || "";
    var match = href.match(/[?&]id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function nodeFrom(doc) {
    var path = (doc.location && doc.location.pathname) || "";
    var match = path.match(/\/lots\/(\d+)/);
    return match ? match[1] : "";
  }

  function editHref(row) {
    var link = row.querySelector && row.querySelector("a[href*='offerEdit']");
    if (link) return link.getAttribute("href");
    if (row.matches && row.matches("a[href*='offerEdit']")) return row.getAttribute("href");
    return "";
  }

  function offerFrom(row, doc) {
    var titleNode = row.querySelector(".tc-desc-text, .tc-title");
    var priceNode = row.querySelector(".tc-price");
    var priceMatch = text(priceNode).match(/(\d+(?:[.,]\d+)?)/);
    return {
      id: lotId(row),
      title: text(titleNode),
      price: priceMatch ? priceMatch[1].replace(",", ".") : "",
      editHref: editHref(row),
      nodeId: nodeFrom(doc)
    };
  }

  function collectLots(doc) {
    var session = readSession(doc);
    var rows = Array.prototype.slice.call(doc.querySelectorAll("a.tc-item, .tc-item"));
    var seen = {};
    var lots = [];
    var foreign = [];
    rows.forEach(function (row) {
      if (row.closest && row.closest("#llv-shift-root")) return;
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
      try { return new URL(lot.editHref, loc.origin).href; } catch (error) { return ""; }
    }
    if (!lot.id || !lot.nodeId) return "";
    if (!/\/lots\/\d+/.test(loc.pathname || "")) return "";
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

  function isLoginDoc(doc) {
    if (/войти/i.test(doc.title || "")) return true;
    var password = doc.querySelector("input[type='password']");
    var offerField = doc.querySelector("textarea, input[name*='summary'], input[name='price']");
    return !!(password && !offerField);
  }

  function isPurchaseForm(form) {
    if (form.querySelector("[name='player'], [name='price_guard']")) return true;
    var button = form.querySelector("button, input[type='submit']");
    var label = button ? text(button) || button.value || "" : "";
    return /^\s*купить\s*$/i.test(label);
  }

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
    Array.prototype.slice.call(form.elements || form.querySelectorAll("input, textarea, select")).forEach(function (input) {
      if (!input.name || input.type === "password" || input.type === "file") return;
      if ((input.type === "checkbox" || input.type === "radio") && !input.checked) return;
      fields.push({ name: input.name, value: input.value || "" });
    });
    function find(re) {
      for (var index = 0; index < fields.length; index += 1) {
        if (re.test(fields[index].name)) return fields[index];
      }
      return null;
    }
    var action = form.getAttribute("action") || pageUrl;
    try { action = new URL(action, pageUrl).href; } catch (error) { action = pageUrl; }
    return {
      action: action,
      method: (form.getAttribute("method") || "post").toUpperCase(),
      fields: fields,
      titleField: find(/summary|title/i),
      descField: find(/desc/i),
      priceField: find(/price/i),
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
      if (node.closest && node.closest("#llv-shift-root")) continue;
      var label = text(node) || node.value || "";
      if (/купить/i.test(label)) continue;
      if (/поднять/i.test(label)) return node;
    }
    return doc.querySelector("form[action*='raise']");
  }

  async function loadForm(lot, loc, fetchImpl) {
    var url = editUrl(lot, loc);
    if (!url) return { ok: false, error: "На странице нет редактирования этого лота" };
    var response = await fetchImpl(url, { credentials: "include" });
    var html = await response.text();
    var doc = new DOMParser().parseFromString(html, "text/html");
    var form = readOfferForm(doc, url);
    if (form && form.login) return { ok: false, error: "Войдите в FunPay. Пароль не читается." };
    if (!form || !form.titleField) return { ok: false, error: "Форма лота не найдена" };
    return { ok: true, form: form };
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
        var result = await task(lot);
        results.push({
          id: lot.id,
          title: lot.title,
          ok: !!result.ok,
          skipped: !!result.skipped,
          error: result.error || ""
        });
      } catch (error) {
        results.push({ id: lot.id, title: lot.title, ok: false, skipped: false, error: error.message || "Ошибка" });
      }
    }
    return results;
  }

  async function createFromTemplate(lot, loc, fetchImpl, changes) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    var fields = withoutOfferId(loaded.form.fields);
    var next = changes || {};
    if (next.title && loaded.form.titleField) fields = setField(fields, loaded.form.titleField.name, next.title);
    if (next.price && loaded.form.priceField) fields = setField(fields, loaded.form.priceField.name, String(next.price));
    if (next.description && loaded.form.descField) fields = setField(fields, loaded.form.descField.name, next.description);
    return submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetchImpl);
  }

  async function cloneLot(lot, loc, fetchImpl, suffix) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    var fields = withoutOfferId(loaded.form.fields);
    if (suffix && loaded.form.titleField) {
      fields = setField(fields, loaded.form.titleField.name, loaded.form.titleField.value + suffix);
    }
    return submitForm({ action: loaded.form.action, method: loaded.form.method, fields: fields }, fetchImpl);
  }

  async function editLot(lot, loc, fetchImpl, changes) {
    var loaded = await loadForm(lot, loc, fetchImpl);
    if (!loaded.ok) return loaded;
    var fields = loaded.form.fields.map(function (field) { return { name: field.name, value: field.value }; });
    if (changes.price !== undefined && changes.price !== "") {
      if (!loaded.form.priceField) return { ok: false, error: "В форме нет цены" };
      fields = setField(fields, loaded.form.priceField.name, changes.price);
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

  function rowById(doc, id) {
    var safe = String(id || "").replace(/'/g, "");
    if (!safe) return null;
    return doc.querySelector(".tc-item[data-offer='" + safe + "']");
  }

  function clickRowAction(row, action) {
    if (!row) return { ok: false, error: "Лот не найден на странице" };
    var node = row.querySelector("[data-action='" + action + "']");
    if (!node) {
      var pattern = {
        activate: /включ|актив/i,
        deactivate: /выключ|деактив/i,
        delete: /удал/i
      }[action];
      var nodes = row.querySelectorAll("a, button");
      for (var i = 0; i < nodes.length; i += 1) {
        var label = text(nodes[i]);
        if (/купить/i.test(label)) continue;
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

  root.LLVLots = {
    readSession: readSession,
    collectLots: collectLots,
    editUrl: editUrl,
    replaceWord: replaceWord,
    previewTitles: previewTitles,
    readOfferForm: readOfferForm,
    isPurchaseForm: isPurchaseForm,
    findRaiseControl: findRaiseControl,
    encodeForm: encodeForm,
    withoutOfferId: withoutOfferId,
    loadForm: loadForm,
    cloneLot: cloneLot,
    createFromTemplate: createFromTemplate,
    editLot: editLot,
    eachLot: eachLot,
    raiseOnPage: raiseOnPage,
    rowById: rowById,
    clickRowAction: clickRowAction
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
