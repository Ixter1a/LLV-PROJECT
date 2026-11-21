var SHIFT_KEY = "shift";
var QUEUE_KEY = "queue";
var SEEN_KEY = "seen";
var SETTINGS_KEY = "settings";
var ERROR_KEY = "lastError";
var LEDGER_KEY = "ledger";

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  return chrome.storage.local.set(value);
}

function emptyLedger() {
  return { workers: [], shifts: [], sales: [] };
}

function isPlaceholder(value) {
  var text = String(value || "").trim();
  if (!text) return true;
  return /YOUR_|YOUR-PROJECT|changeme|вставьте|paste|xxxx+/i.test(text);
}

function configured(settings) {
  if (!settings) return false;
  if (isPlaceholder(settings.url) || isPlaceholder(settings.key)) return false;
  if (/^https:\/\//i.test(settings.url)) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(settings.url);
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

function cleanName(name) {
  return String(name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 64);
}

async function getSettings() {
  var data = await storageGet(SETTINGS_KEY);
  return data[SETTINGS_KEY] || { url: "", key: "" };
}

async function getShift() {
  var data = await storageGet(SHIFT_KEY);
  return data[SHIFT_KEY] || null;
}

async function getQueue() {
  var data = await storageGet(QUEUE_KEY);
  return data[QUEUE_KEY] || [];
}

async function getSeen() {
  var data = await storageGet(SEEN_KEY);
  return data[SEEN_KEY] || [];
}

async function getLedger() {
  var data = await storageGet(LEDGER_KEY);
  return data[LEDGER_KEY] || emptyLedger();
}

function putById(list, row) {
  var next = [];
  var replaced = false;
  (list || []).forEach(function (item) {
    if (item.id === row.id) {
      next.push(row);
      replaced = true;
    } else {
      next.push(item);
    }
  });
  if (!replaced) next.push(row);
  return next;
}

async function publicState() {
  var settings = await getSettings();
  var shift = await getShift();
  var queue = await getQueue();
  var errorData = await storageGet(ERROR_KEY);
  var ledger = await getLedger();
  return {
    ok: true,
    configured: configured(settings),
    pending: queue.length,
    shift: shift,
    ledger: ledger,
    lastError: configured(settings) ? (errorData[ERROR_KEY] || null) : null
  };
}

function request(settings, path, options) {
  var headers = {
    apikey: settings.key,
    Authorization: "Bearer " + settings.key,
    "Content-Type": "application/json",
    Prefer: options.prefer || "return=representation"
  };
  return fetch(normalizeUrl(settings.url) + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  }).then(function (response) {
    if (response.status === 409) {
      var duplicate = new Error("duplicate");
      duplicate.status = 409;
      throw duplicate;
    }
    if (!response.ok) {
      return response.text().then(function (body) {
        var error = new Error(messageForStatus(response.status));
        error.status = response.status;
        error.detail = String(body || "").slice(0, 180);
        throw error;
      });
    }
    if (response.status === 204) return null;
    return response.text().then(function (body) {
      if (!body) return null;
      return JSON.parse(body);
    });
  });
}

function messageForStatus(status) {
  if (status === 401 || status === 403) return "Supabase отклонил ключ";
  if (status >= 500) return "Supabase временно недоступен";
  return "Ошибка записи в Supabase";
}

async function relinkWorker(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  var ledger = await getLedger();
  var seenWorker = {};
  ledger.workers = ledger.workers.filter(function (worker) {
    if (worker.id === fromId) worker.id = toId;
    if (seenWorker[worker.id]) return false;
    seenWorker[worker.id] = true;
    return true;
  });
  ledger.shifts.forEach(function (shift) {
    if (shift.worker_id === fromId) shift.worker_id = toId;
  });
  ledger.sales.forEach(function (sale) {
    if (sale.worker_id === fromId) sale.worker_id = toId;
  });
  var shift = await getShift();
  if (shift && shift.workerId === fromId) shift.workerId = toId;
  var queue = await getQueue();
  queue.forEach(function (item) {
    if (item.workerId === fromId) item.workerId = toId;
  });
  await storageSet({ ledger: ledger, shift: shift, queue: queue });
}

async function upsertWorker(settings, name, localId) {
  var rows = await request(settings, "workers?on_conflict=name", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { id: localId, name: name }
  });
  if (rows && rows[0] && rows[0].id) return rows[0].id;
  var found = await request(settings, "workers?select=id&name=eq." + encodeURIComponent(name), {
    method: "GET",
    prefer: "return=representation"
  });
  if (found && found[0] && found[0].id) return found[0].id;
  throw new Error("Не удалось записать сотрудника");
}

async function sendItem(settings, item, workerIds) {
  if (item.kind === "shift_start") {
    var workerId = workerIds[item.workerName] || await upsertWorker(settings, item.workerName, item.workerId);
    workerIds[item.workerName] = workerId;
    await relinkWorker(item.workerId, workerId);
    try {
      await request(settings, "shifts?on_conflict=id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: {
          id: item.shiftId,
          worker_id: workerId,
          started_at: item.startedAt
        }
      });
    } catch (error) {
      if (error.status !== 409) throw error;
    }
    var shift = await getShift();
    if (shift && shift.shiftId === item.shiftId) {
      shift.workerId = workerId;
      shift.synced = true;
      await storageSet({ shift: shift });
    }
    return;
  }
  if (item.kind === "sale") {
    var saleWorker = workerIds[item.workerName] || item.workerId || await upsertWorker(settings, item.workerName, item.workerId);
    workerIds[item.workerName] = saleWorker;
    await relinkWorker(item.workerId, saleWorker);
    try {
      await request(settings, "sales?on_conflict=source_key", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: {
          id: item.saleId,
          worker_id: saleWorker,
          shift_id: item.shiftId,
          count: item.count,
          amount_rub: Number(item.amountRub).toFixed(2),
          sold_at: item.soldAt,
          source_key: item.sourceKey
        }
      });
    } catch (error) {
      if (error.status === 409) return;
      throw error;
    }
    return;
  }
  if (item.kind === "shift_end") {
    await request(settings, "shifts?id=eq." + item.shiftId, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { ended_at: item.endedAt }
    });
  }
}

async function flush() {
  var settings = await getSettings();
  if (!configured(settings)) return publicState();
  var workerIds = {};
  var guard = 0;
  while (guard < 50) {
    guard += 1;
    var queue = await getQueue();
    if (!queue.length) {
      await storageSet({ lastError: null });
      break;
    }
    var item = queue[0];
    try {
      await sendItem(settings, item, workerIds);
    } catch (error) {
      var message = /fetch|network|Failed/i.test(error.message || "")
        ? "Нет связи с Supabase"
        : (error.message || "Нет связи с Supabase");
      await storageSet({ lastError: message });
      break;
    }
    var fresh = await getQueue();
    var removed = false;
    var next = [];
    fresh.forEach(function (queued) {
      if (!removed && queued.id === item.id) {
        removed = true;
        return;
      }
      next.push(queued);
    });
    await storageSet({ queue: next, lastError: null });
  }
  return publicState();
}

async function enqueue(item) {
  item.id = item.id || crypto.randomUUID();
  var queue = await getQueue();
  queue.push(item);
  await storageSet({ queue: queue });
  return item;
}

async function startShift(name) {
  var workerName = cleanName(name);
  if (!workerName) throw new Error("Нужно имя сотрудника");
  var current = await getShift();
  if (current && current.active) return publicState();
  var workerId = crypto.randomUUID();
  var shift = {
    active: true,
    shiftId: crypto.randomUUID(),
    workerName: workerName,
    workerId: workerId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    salesCount: 0,
    salesRub: 0,
    synced: false
  };
  var ledger = await getLedger();
  ledger.workers = putById(ledger.workers, { id: workerId, name: workerName, created_at: shift.startedAt });
  ledger.shifts = putById(ledger.shifts, {
    id: shift.shiftId,
    worker_id: workerId,
    started_at: shift.startedAt,
    ended_at: null
  });
  await storageSet({ shift: shift, ledger: ledger });
  await enqueue({
    kind: "shift_start",
    shiftId: shift.shiftId,
    workerName: workerName,
    workerId: workerId,
    startedAt: shift.startedAt
  });
  return flush();
}

async function endShift() {
  var shift = await getShift();
  if (!shift || !shift.active) return publicState();
  shift.active = false;
  shift.endedAt = new Date().toISOString();
  var ledger = await getLedger();
  ledger.shifts = putById(ledger.shifts, {
    id: shift.shiftId,
    worker_id: shift.workerId,
    started_at: shift.startedAt,
    ended_at: shift.endedAt
  });
  await storageSet({ shift: shift, ledger: ledger });
  await enqueue({
    kind: "shift_end",
    shiftId: shift.shiftId,
    endedAt: shift.endedAt
  });
  return flush();
}

async function recordSale(sale) {
  var shift = await getShift();
  if (!shift || !shift.active) return publicState();
  if (!sale || !sale.sourceKey || !(Number(sale.count) > 0) || sale.amountRub === null || sale.amountRub === undefined) {
    return publicState();
  }
  var seen = await getSeen();
  var queue = await getQueue();
  var ledger = await getLedger();
  var already = seen.indexOf(sale.sourceKey) !== -1 ||
    queue.some(function (item) { return item.kind === "sale" && item.sourceKey === sale.sourceKey; }) ||
    ledger.sales.some(function (row) { return row.source_key === sale.sourceKey; });
  if (already) return publicState();
  var count = Number(sale.count);
  var amount = Math.round(Number(sale.amountRub) * 100) / 100;
  var soldAt = sale.soldAt || new Date().toISOString();
  var saleId = crypto.randomUUID();
  seen.push(sale.sourceKey);
  shift.salesCount += count;
  shift.salesRub = Math.round((Number(shift.salesRub) + amount) * 100) / 100;
  ledger.sales = putById(ledger.sales, {
    id: saleId,
    worker_id: shift.workerId,
    shift_id: shift.shiftId,
    count: count,
    amount_rub: amount,
    sold_at: soldAt,
    source_key: sale.sourceKey
  });
  queue.push({
    id: crypto.randomUUID(),
    kind: "sale",
    saleId: saleId,
    shiftId: shift.shiftId,
    workerName: shift.workerName,
    workerId: shift.workerId,
    sourceKey: sale.sourceKey,
    count: count,
    amountRub: amount,
    soldAt: soldAt
  });
  await storageSet({
    seen: seen.slice(-2000),
    shift: shift,
    ledger: ledger,
    queue: queue
  });
  return flush();
}

async function saveSettings(url, key) {
  var settings = { url: normalizeUrl(url), key: String(key || "").trim() };
  await storageSet({ settings: settings, lastError: null });
  return flush();
}

var chain = Promise.resolve();

function serialized(run) {
  var next = chain.then(run, run);
  chain = next.then(function () { return null; }, function () { return null; });
  return next;
}

function handleMessage(message) {
  return serialized(function () {
    if (message && message.type === "startShift") return startShift(message.name);
    if (message && message.type === "endShift") return endShift();
    if (message && message.type === "sale") return recordSale(message.sale);
    if (message && message.type === "saveSettings") return saveSettings(message.url, message.key);
    if (message && message.type === "flush") return flush();
    if (message && message.type === "ledger") return getLedger().then(function (ledger) { return { ok: true, ledger: ledger }; });
    return publicState();
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  handleMessage(message).then(sendResponse).catch(function (error) {
    sendResponse({ ok: false, error: error.message || "Ошибка" });
  });
  return true;
});

chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "ledger") {
    sendResponse({ ok: false });
    return;
  }
  getLedger().then(function (ledger) {
    sendResponse({ ok: true, ledger: ledger });
  }).catch(function () {
    sendResponse({ ok: false, ledger: emptyLedger() });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(function () {
  serialized(function () { return flush(); });
  scheduleWork();
});
chrome.runtime.onStartup.addListener(function () {
  serialized(function () { return flush(); });
  scheduleWork();
});

var WORK_ALARM = "llvWork";
var WORK_PERIOD = 1;
var BUSY_KEY = "llvBusy";
var LAST_RAISE_KEY = "llvLastRaise";

function scheduleWork() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  chrome.alarms.get(WORK_ALARM, function (alarm) {
    if (alarm) return;
    chrome.alarms.create(WORK_ALARM, { periodInMinutes: WORK_PERIOD, delayInMinutes: WORK_PERIOD });
  });
}

async function sellerSettings() {
  var data = await storageGet("llvSeller");
  return data.llvSeller || {};
}

async function sends(type, payload) {
  var tabs = (await chrome.tabs.query({})).filter(function (tab) {
    return tab.id && /^https:\/\/(www\.)?funpay\.com\//.test(tab.url || "");
  });
  if (!tabs.length) return null;
  var answers = await Promise.all(tabs.map(function (tab) {
    return chrome.tabs.sendMessage(tab.id, Object.assign({ type: type }, payload || {})).then(function (reply) {
      return reply || null;
    }, function () {
      return null;
    });
  }));
  return answers.filter(function (reply) { return reply && !reply.skipped; })[0] || null;
}

async function raiseFromTab(tabId) {
  var reply = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function () {
      var lots = self.LLVLots;
      if (!lots) return { ok: false, error: "Скрипт расширения ещё не загрузился" };
      return lots.raiseByRequest(document, fetch.bind(self), location);
    }
  });
  var result = reply && reply[0] && reply[0].result;
  return result || { ok: false, error: "Вкладка не ответила" };
}

async function activeTab() {
  var tabs = (await chrome.tabs.query({})).filter(function (tab) {
    return tab.id && /^https:\/\/(www\.)?funpay\.com\//.test(tab.url || "");
  });
  if (!tabs.length) return null;
  var ranked = tabs.filter(function (tab) { return /\/lots\/\d+/.test(tab.url || ""); });
  var pool = ranked.length ? ranked : tabs;
  return pool.filter(function (tab) { return tab.active; })[0] || pool[0];
}

async function bgRaise() {
  var tab = await activeTab();
  if (!tab) return null;
  return raiseFromTab(tab.id);
}

async function bgMessages() {
  var settings = await sellerSettings();
  if (!settings.welcomeOn && !settings.keywordsOn && !settings.thanksOn) return null;
  return sends("llvMessages");
}

async function bgReviews() {
  var settings = await sellerSettings();
  if (!settings.reviewsAuto) return null;
  return sends("llvReviews");
}

async function runWork() {
  if (await chrome.storage.local.get(BUSY_KEY).then(function (data) { return data[BUSY_KEY]; })) return;
  await storageSet({ [BUSY_KEY]: Date.now() });
  try {
    var settings = await sellerSettings();
    var hour = new Date().getHours();
    var quiet = settings.quietOn && inQuiet(hour, settings.quietFrom, settings.quietTo);
    if (settings.autoRaise && !quiet) {
      var last = (await storageGet(LAST_RAISE_KEY))[LAST_RAISE_KEY] || 0;
      var gap = Math.max(5, Number(settings.raiseMinutes) || 30) * 60000;
      if (Date.now() - last >= gap) {
        var raised = await bgRaise();
        if (raised && raised.ok) {
          await storageSet({ [LAST_RAISE_KEY]: Date.now() });
          if (settings.raiseNotice) sendNotice("Раздел поднят", "Автоподнятие лотов выполнено");
        } else if (raised && raised.wait) {
          // FunPay ещё не разрешает поднятие: откладываем, но не шумим каждую минуту.
          await storageSet({ [LAST_RAISE_KEY]: Date.now() });
        } else if (raised && raised.error && !raised.skipped && settings.raiseNotice) {
          sendNotice("Поднятие не удалось", raised.error);
        }
      }
    }
    await bgMessages();
    await bgReviews();
  } finally {
    await storageSet({ [BUSY_KEY]: 0 });
  }
}

function inQuiet(hour, from, to) {
  var start = ((Math.floor(Number(from)) % 24) + 24) % 24;
  var end = ((Math.floor(Number(to)) % 24) + 24) % 24;
  if (start === end || !isFinite(start) || !isFinite(end)) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm && alarm.name === WORK_ALARM) runWork().catch(function () {});
  });
}

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local" || !changes.llvSeller) return;
  scheduleWork();
  var before = (changes.llvSeller.oldValue || {}).autoRaise;
  var after = (changes.llvSeller.newValue || {}).autoRaise;
  if (after && !before) runWork().catch(function () {});
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "llvOrder") return;
  notifyOrder().then(function () { sendResponse({ ok: true }); });
  return true;
});

async function notifyOrder() {
  var settings = await sellerSettings();
  if (settings.notifyOrder === false) return;
  sendNotice("Новый заказ FunPay", "Проверьте страницу продаж");
}

function sendNotice(title, message) {
  try {
    chrome.notifications.create("llv-" + Date.now(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon.png"),
      title: title,
      message: message || "",
      priority: 2
    });
  } catch (error) { /* уведомления могут быть запрещены */ }
}
