(function (root) {
  var STATE = "llvOrder";

  function settings() {
    return root.LLV ? root.LLV.current() : {};
  }

  function base(loc) {
    var locale = root.LLVLots ? root.LLVLots.pageLocale(document) : "ru";
    return (locale === "ru" ? "" : "/" + locale) + (loc || location).pathname;
  }

  async function post(path, data, fetchImpl) {
    var fetcher = fetchImpl || fetch;
    var response = await fetcher(path, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: Object.keys(data).map(function (key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]);
      }).join("&")
    });
    var text = await response.text();
    var json = null;
    try { json = JSON.parse(text); } catch (error) { json = null; }
    if (!response.ok) return { ok: false, error: "FunPay ответил " + response.status, json: json };
    if (json && (json.error || json.errors)) return { ok: false, error: (json.msg || json.error || (json.errors && json.errors[0])) || "FunPay отклонил запрос", json: json };
    return { ok: true, json: json, text: text };
  }

  function orderId() {
    var match = location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
    if (!match || /^(trade|new|list|buy)$/i.test(match[1])) return "";
    return match[1];
  }

  function nodeId() {
    var match = location.pathname.match(/\/orders\/([A-Za-z0-9_-]+)\//);
    return match ? match[1] : orderId();
  }

  function botGid() {
    var params = new URLSearchParams(location.search);
    var gid = params.get("gid") || params.get("node");
    if (gid) return gid;
    var block = document.querySelector(".chat, .chat-form");
    var owner = block && block.closest("[data-gid]");
    if (owner) return owner.getAttribute("data-gid");
    return "";
  }

  function lastIncoming() {
    var blocks = document.querySelectorAll(".chat-msg-text, .chat-message-text, .message-text, .chat-msg .text, .chat-msg");
    if (!blocks.length) return "";
    for (var i = blocks.length - 1; i >= 0; i -= 1) {
      var node = blocks[i];
      if (!node || (node.closest && node.closest("#llv-shift-root, #llv-profile-panel, #llv-settings"))) continue;
      if (node.querySelector && node.querySelector(".chat-msg-text")) continue;
      if (/chat-msg-author|chat-msg-date/.test(node.className || "")) continue;
      var text = (node.innerText || node.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function lastIncomingNode() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll(".chat-msg-text, .chat-message-text, .message-text, .chat-msg .text"));
    var list = blocks.filter(function (node) {
      return !(node.closest && (node.closest("#llv-shift-root") || node.closest("#llv-profile-panel") || node.closest("#llv-settings")));
    });
    if (list.length) return list[list.length - 1];
    return null;
  }

  function lastMessageTime() {
    var nodes = document.querySelectorAll(".chat-msg-date, .date, time[datetime]");
    var last = nodes[nodes.length - 1];
    if (!last) return null;
    var dt = last.getAttribute && last.getAttribute("datetime");
    var value = dt ? new Date(dt) : new Date();
    var text = (last.textContent || "");
    var clock = text.match(/(\d{1,2}):(\d{2})/);
    if (clock && !dt) {
      value.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    }
    return isNaN(value.getTime()) ? null : value;
  }

  async function send(text, fetchImpl) {
    var id = nodeId();
    if (!id) return { ok: false, error: "Нет номера заказа" };
    var data = { node: id, content: text };
    var gid = botGid();
    if (gid) data.node = gid;
    var path = /\/orders\//.test(location.pathname) ? base() : "/chat/run";
    return post(path, data, fetchImpl);
  }

  async function unpin() {
    var id = nodeId();
    if (!id) return { ok: false, error: "Нет номера заказа" };
    return post(base(), { node: id, action: "unpin" });
  }

  async function prepare() {
    var id = nodeId();
    if (!id) return { ok: false, error: "Нет номера заказа" };
    return post(base(), { node: id, action: "chat_node" });
  }

  function mark(id, kind) {
    var store = {};
    try { store = JSON.parse(localStorage.getItem(STATE) || "{}"); } catch (error) { store = {}; }
    store[kind] = { id: id, at: Date.now() };
    localStorage.setItem(STATE, JSON.stringify(store));
  }

  function marked(kind, id) {
    var store = {};
    try { store = JSON.parse(localStorage.getItem(STATE) || "{}"); } catch (error) { store = {}; }
    return !!(store[kind] && store[kind].id === id);
  }

  function clearlyMine() {
    var area = document.querySelector("textarea[name='message'], .chat-form textarea");
    var form = area && area.closest("form");
    return !!(form && form.dataset.llvSending);
  }

  async function answerKeywords(fetchImpl) {
    var config = settings();
    if (!config.keywordsOn || !config.keywords.length) return null;
    var text = lastIncoming();
    if (!text) return null;
    var lower = text.toLowerCase();
    var hit = null;
    config.keywords.forEach(function (rule) {
      if (!rule || !rule.word || !rule.text) return;
      if (hit) return;
      var word = String(rule.word).toLowerCase();
      var match = rule.exact ? lower.trim() === word : lower.indexOf(word) !== -1;
      if (match) hit = rule;
    });
    if (!hit) return null;
    var id = orderId() || nodeId();
    var node = lastIncomingNode();
    var stamp = node ? (node.getAttribute("data-msg-id") || node.getAttribute("data-id") || "") : "";
    var key = "kw:" + id + ":" + (stamp || root.LLV.hash(lower));
    if (!root.LLV.once(key)) return null;
    if (marked("kw", key)) return null;
    var result = await send(hit.text, fetchImpl);
    if (!result.ok) {
      root.LLV.forget(key);
      return null;
    }
    mark(key, "kw");
    return { rule: hit, text: hit.text };
  }

  async function pushOnPage() {
    var ids = [];
    var session = root.LLVLots ? root.LLVLots.readSession(document) : { userId: 0 };
    document.querySelectorAll("[data-id][data-user], [data-user][data-offer]").forEach(function (node) {
      var user = node.getAttribute("data-user");
      if (session.userId && user && String(user) !== String(session.userId)) return;
      var id = node.getAttribute("data-id");
      if (id && !/^\d{6,}$/.test(id)) ids.push(id);
    });
    if (!ids.length) return { ok: false, error: "На странице нет заказов" };
    var result = { ok: true, sent: 0, failed: 0, details: [] };
    for (var i = 0; i < ids.length; i += 1) {
      var one = await post(base(), { node: ids[i], action: "review" });
      if (one.ok) result.sent += 1;
      else {
        result.failed += 1;
        result.details.push(ids[i] + ": " + one.error);
      }
    }
    return result;
  }

  async function tick(force) {
    var config = settings();
    if (!/\/orders\//.test(location.pathname)) return { ok: true, skipped: true, reason: "not-chat" };
    if (config.welcomeOn) await welcome(config);
    if (config.keywordsOn) await answerKeywords(fetch);
    if (config.thanksOn) await thanks(config, force);
    return { ok: true };
  }

  function buyerId() {
    var node = document.querySelector(".chat-msg-buyer, .chat-header .user-link, .chat-title a[href*='/users/']");
    return node && node.getAttribute ? (node.getAttribute("href") || "").replace(/[^0-9]/g, "") : "";
  }

  async function welcome(config) {
    if (!config.welcome || sawIncoming()) return null;
    var buyer = buyerId() || orderId();
    if (!buyer) return null;
    var hours = Math.max(1, Number(config.welcomeTimeout) || 24);
    var last = stored().welcome || {};
    if (last[buyer] && Date.now() - last[buyer] < hours * 3600000) return null;
    var key = "welcome:" + orderId();
    if (!root.LLV.once(key)) return null;
    var result = await send(config.welcome, fetch);
    if (!result.ok) {
      root.LLV.forget(key);
      return null;
    }
    last[buyer] = Date.now();
    remember("welcome", last);
    root.LLV.toast("Отправлено приветствие");
    return result;
  }

  function sawIncoming() {
    var blocks = document.querySelectorAll(".chat-msg-text");
    for (var i = blocks.length - 1; i >= 0; i -= 1) {
      var node = blocks[i];
      if (node.closest && node.closest("#llv-shift-root")) continue;
      return (node.innerText || node.textContent || "").trim().length > 0;
    }
    return false;
  }

  async function thanks(config, force) {
    if (!config.thanks) return null;
    var confirmed = document.querySelector(".badge-success, .order-status.ml-auto, .order-status");
    var label = confirmed ? (confirmed.innerText || confirmed.textContent || "") : "";
    if (!/заказ подтверждён|order confirmed|подтвержден/i.test(label)) return null;
    var id = orderId();
    if (!id) return null;
    if (!force && marked("thanks", id)) return null;
    mark(id, "thanks");
    var result = await send(config.thanks, fetch);
    if (result.ok) root.LLV.toast("Отправлено сообщение после подтверждения");
    return result;
  }

  function stored() {
    var bag = {};
    try { bag = JSON.parse(localStorage.getItem("llvRules") || "{}"); } catch (error) { bag = {}; }
    return bag;
  }

  function remember(key, value) {
    var bag = stored();
    bag[key] = value;
    try { localStorage.setItem("llvRules", JSON.stringify(bag)); } catch (error) { /* хранилище переполнено */ }
  }

  root.LLVChat = {
    orderId: orderId,
    nodeId: nodeId,
    lastIncoming: lastIncoming,
    lastIncomingNode: lastIncomingNode,
    lastMessageTime: lastMessageTime,
    send: send,
    post: post,
    base: base,
    unpin: unpin,
    prepare: prepare,
    answerKeywords: answerKeywords,
    welcome: welcome,
    thanks: thanks,
    pushOnPage: pushOnPage,
    tick: tick,
    mark: mark,
    marked: marked
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
