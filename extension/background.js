var SHIFT_KEY = "shift";
var QUEUE_KEY = "queue";
var SEEN_KEY = "seen";
var SETTINGS_KEY = "settings";
var ERROR_KEY = "lastError";

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(value) {
  return chrome.storage.local.set(value);
}

function isPlaceholder(value) {
  var text = String(value || "").trim();
  if (!text) return true;
  return /YOUR_|YOUR-PROJECT|changeme|вставьте|paste|xxxx+/i.test(text);
}

function configured(settings) {
  if (!settings) return false;
  if (isPlaceholder(settings.url) || isPlaceholder(settings.key)) return false;
  return /^https:\/\//i.test(settings.url);
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

async function publicState() {
  var settings = await getSettings();
  var shift = await getShift();
  var queue = await getQueue();
  var errorData = await storageGet(ERROR_KEY);
  return {
    ok: true,
    configured: configured(settings),
    pending: queue.length,
    shift: shift,
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
        var error = new Error(messageForStatus(response.status, body));
        error.status = response.status;
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

function messageForStatus(status, body) {
  if (status === 401 || status === 403) return "Supabase отклонил ключ";
  if (status >= 500) return "Supabase временно недоступен";
  var text = String(body || "").replace(/\s+/g, " ").slice(0, 140);
  return text ? "Ошибка записи в Supabase" : "Ошибка записи в Supabase";
}

async function upsertWorker(settings, name) {
  var rows = await request(settings, "workers?on_conflict=name", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { name: name }
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
    var workerId = await upsertWorker(settings, item.workerName);
    workerIds[item.workerName] = workerId;
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
    var saleWorker = workerIds[item.workerName] || await upsertWorker(settings, item.workerName);
    workerIds[item.workerName] = saleWorker;
    try {
      await request(settings, "sales?on_conflict=source_key", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: {
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
  var queue = await getQueue();
  var workerIds = {};
  var index = 0;
  try {
    for (; index < queue.length; index += 1) {
      await sendItem(settings, queue[index], workerIds);
    }
    await storageSet({ queue: [], lastError: null });
  } catch (error) {
    var message = /fetch|network|Failed/i.test(error.message || "")
      ? "Нет связи с Supabase"
      : (error.message || "Нет связи с Supabase");
    await storageSet({
      queue: queue.slice(index),
      lastError: message
    });
  }
  return publicState();
}

async function enqueue(item) {
  var queue = await getQueue();
  queue.push(item);
  await storageSet({ queue: queue });
}

async function startShift(name) {
  var workerName = cleanName(name);
  if (!workerName) throw new Error("Нужно имя сотрудника");
  var current = await getShift();
  if (current && current.active) return publicState();
  var shift = {
    active: true,
    shiftId: crypto.randomUUID(),
    workerName: workerName,
    workerId: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    salesCount: 0,
    salesRub: 0,
    synced: false
  };
  await storageSet({ shift: shift });
  await enqueue({
    kind: "shift_start",
    shiftId: shift.shiftId,
    workerName: workerName,
    startedAt: shift.startedAt
  });
  return flush();
}

async function endShift() {
  var shift = await getShift();
  if (!shift || !shift.active) return publicState();
  shift.active = false;
  shift.endedAt = new Date().toISOString();
  await storageSet({ shift: shift });
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
  if (!sale || !sale.sourceKey || !(sale.count > 0) || sale.amountRub === null || sale.amountRub === undefined) {
    return publicState();
  }
  var seen = await getSeen();
  if (seen.indexOf(sale.sourceKey) !== -1) return publicState();
  seen.push(sale.sourceKey);
  shift.salesCount += Number(sale.count);
  shift.salesRub = Math.round((Number(shift.salesRub) + Number(sale.amountRub)) * 100) / 100;
  await storageSet({ seen: seen.slice(-2000), shift: shift });
  await enqueue({
    kind: "sale",
    shiftId: shift.shiftId,
    workerName: shift.workerName,
    sourceKey: sale.sourceKey,
    count: Number(sale.count),
    amountRub: Number(sale.amountRub),
    soldAt: sale.soldAt || new Date().toISOString()
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

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  var action = serialized(function () {
    if (message && message.type === "startShift") return startShift(message.name);
    if (message && message.type === "endShift") return endShift();
    if (message && message.type === "sale") return recordSale(message.sale);
    if (message && message.type === "saveSettings") return saveSettings(message.url, message.key);
    if (message && message.type === "flush") return flush();
    return publicState();
  });
  action.then(sendResponse).catch(function (error) {
    sendResponse({ ok: false, error: error.message || "Ошибка" });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(function () { flush(); });
chrome.runtime.onStartup.addListener(function () { flush(); });
