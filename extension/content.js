if (!document.documentElement.dataset.llvShift) {
  document.documentElement.dataset.llvShift = '1';
  boot();
}

async function boot() {
  const state = {
    apiBase: '',
    extensionKey: '',
    workerName: '',
    shift: null,
    seen: new Set(),
    counted: new Set(),
    baselineReady: false,
    pending: [],
    collapsed: false,
    sending: false,
    manualOpen: false,
    error: '',
    note: '',
    totals: null,
  };

  const stored = await chrome.storage.local.get([
    'apiBase',
    'extensionKey',
    'workerName',
    'shift',
    'seenOrderIds',
    'countedOrderIds',
    'baselineReady',
    'pending',
  ]);
  state.apiBase = cleanBase(stored.apiBase);
  state.extensionKey = String(stored.extensionKey || '');
  state.workerName = String(stored.workerName || '');
  state.shift = stored.shift || null;
  state.seen = new Set(stored.seenOrderIds || []);
  state.counted = new Set(stored.countedOrderIds || []);
  state.baselineReady = Boolean(stored.baselineReady);
  state.pending = Array.isArray(stored.pending) ? stored.pending : [];

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);
  try {
    const css = await fetch(chrome.runtime.getURL('overlay.css')).then((response) => response.text());
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.append(Object.assign(document.createElement('style'), {
      textContent: '.root{position:fixed;inset:0;font-family:sans-serif;color:#fff}',
    }));
  }
  const root = document.createElement('div');
  root.className = 'root';
  shadow.append(root);

  const ui = {
    name: null,
    error: null,
    qty: null,
    money: null,
    profit: null,
    note: null,
  };

  function paint() {
    root.replaceChildren();
    if (state.shift) {
      paintDock();
      return;
    }
    if (state.collapsed) {
      const orb = button('', 'orb');
      orb.append(mark('orb-mark'));
      orb.addEventListener('click', () => {
        state.collapsed = false;
        paint();
      });
      root.append(orb);
      return;
    }
    const dim = document.createElement('div');
    dim.className = 'dim';
    const card = document.createElement('section');
    card.className = 'card';
    card.append(mark());
    card.append(p('LLV · FunPay', 'eyebrow'));
    card.append(el('h2', 'Начать смену'));
    card.append(p('Новые заказы на этой странице уйдут в панель. Старые, которые уже были на экране, не считаются.'));
    if (!state.apiBase || !state.extensionKey) {
      card.append(p('Сначала откройте настройки расширения и впишите адрес панели и ключ.'));
    }
    const label = document.createElement('label');
    label.textContent = 'Имя';
    const input = document.createElement('input');
    input.maxLength = 32;
    input.value = state.workerName;
    input.placeholder = 'Как вас видеть в панели';
    input.addEventListener('input', () => {
      state.workerName = input.value;
    });
    ui.name = input;
    label.append(input);
    card.append(label);
    const error = p('', 'error');
    error.textContent = state.error;
    ui.error = error;
    card.append(error);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const go = button('Начать\nсмену', 'go');
    go.disabled = !state.apiBase || !state.extensionKey;
    go.addEventListener('click', () => start(go));
    const later = button('Не сейчас', 'link');
    later.addEventListener('click', () => {
      state.collapsed = true;
      paint();
    });
    actions.append(go, later);
    card.append(actions);
    root.append(dim, card);
  }

  function paintDock() {
    const dock = document.createElement('section');
    dock.className = 'dock';
    const who = stat(state.shift.workerName, duration(state.shift.startedAt));
    const totals = state.totals || { qty: 0, grossRub: 0, profitRub: 0 };
    ui.qty = stat(`${totals.qty} шт`, 'штуки').querySelector('b');
    const qty = ui.qty.parentElement;
    const gross = stat(formatMoney(totals.grossRub), 'оборот');
    const profit = stat(formatMoney(totals.profitRub), 'чистыми');
    ui.money = gross.querySelector('b');
    ui.profit = profit.querySelector('b');
    const end = button('Завершить', 'end');
    end.addEventListener('click', () => stop(end));
    const add = button(state.manualOpen ? 'Скрыть' : 'Вручную', 'mini');
    add.addEventListener('click', () => {
      state.manualOpen = !state.manualOpen;
      paint();
    });
    dock.append(mark('dock-mark'), who, qty, gross, profit, add, end);
    root.append(dock);
    const note = p(state.note || state.error, 'error');
    note.style.cssText = 'position:absolute;left:50%;bottom:78px;transform:translateX(-50%);pointer-events:none;text-align:center;';
    ui.note = note;
    root.append(note);
    if (state.manualOpen) {
      const form = document.createElement('form');
      form.className = 'manual';
      form.style.cssText = 'position:absolute;left:50%;bottom:92px;transform:translateX(-50%);pointer-events:auto;background:#050505;border:1px solid #fff;padding:10px;';
      const amount = field('Сумма ₽', '199');
      const qtyInput = field('Штуки', '1');
      const title = field('Что', 'Заказ');
      const save = button('Добавить', 'end');
      save.type = 'submit';
      form.append(amount.label, qtyInput.label, title.label, save);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const amountRub = Number(String(amount.input.value).replace(',', '.'));
        const count = Number(qtyInput.input.value);
        if (!Number.isFinite(amountRub) || amountRub <= 0 || !Number.isInteger(count) || count < 1) {
          state.error = 'Проверьте сумму и штуки';
          paint();
          return;
        }
        state.pending.push({
          orderId: `manual-${crypto.randomUUID()}`,
          title: title.input.value.slice(0, 180),
          qty: count,
          amountRub,
          status: 'completed',
          source: 'manual',
        });
        state.manualOpen = false;
        state.error = '';
        persist();
        paint();
        flush();
      });
      root.append(form);
    }
  }

  function stat(value, label) {
    const wrap = document.createElement('div');
    wrap.className = 'stat';
    const strong = document.createElement('b');
    strong.textContent = value;
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(strong, span);
    return wrap;
  }

  function field(labelText, placeholder) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.placeholder = placeholder;
    label.append(input);
    return { label, input };
  }

  paint();

  async function start(go) {
    const name = state.workerName.replace(/\s+/g, ' ').trim();
    if (name.length < 2) {
      state.error = 'Впишите имя, от 2 символов';
      paint();
      return;
    }
    go.disabled = true;
    state.error = '';
    try {
      const result = await post('/api/ext/shift/start', { workerName: name });
      const same = state.shift && state.shift.id === result.shift.id;
      state.shift = result.shift;
      state.totals = result.shift;
      state.workerName = name;
      if (!same && !result.resumed) {
        state.seen = new Set();
        state.counted = new Set();
        state.baselineReady = false;
        state.pending = [];
      }
      await chrome.storage.local.set({ workerName: name });
      await persist();
      paint();
      scan();
    } catch (error) {
      state.error = message(error);
      paint();
    }
  }

  async function stop(end) {
    if (!state.shift) return;
    end.disabled = true;
    try {
      await flush();
      await post('/api/ext/shift/end', { shiftId: state.shift.id });
      state.shift = null;
      state.totals = null;
      state.pending = [];
      state.baselineReady = false;
      state.seen = new Set();
      state.counted = new Set();
      await persist();
      paint();
    } catch (error) {
      state.error = message(error);
      end.disabled = false;
      if (ui.note) ui.note.textContent = state.error;
    }
  }

  function scan() {
    if (!state.shift || !globalThis.LLVParse) return;
    const orders = globalThis.LLVParse.parseOrders(document);
    if (!orders.length) {
      state.note = 'Откройте список заказов — новые подхватятся сами.';
      if (ui.note && !state.error) ui.note.textContent = state.note;
      return;
    }
    if (!state.baselineReady) {
      orders.forEach((order) => state.seen.add(order.orderId));
      state.baselineReady = true;
      state.note = 'Смена идёт. Жду новые заказы.';
      persist();
      if (ui.note) ui.note.textContent = state.note;
      return;
    }
    let skipped = 0;
    orders.forEach((order) => {
      if (order.currency !== 'RUB' || order.status === 'unknown') {
        if (order.currency !== 'RUB') skipped += 1;
        return;
      }
      if ((order.status === 'paid' || order.status === 'completed') && !state.seen.has(order.orderId)) {
        if (!order.amountRub) return;
        state.seen.add(order.orderId);
        state.counted.add(order.orderId);
        state.pending.push({
          orderId: order.orderId,
          title: order.title,
          qty: order.qty,
          amountRub: order.amountRub,
          status: order.status,
          source: 'funpay',
        });
      } else if (order.status === 'refunded' && state.counted.has(order.orderId)) {
        state.counted.delete(order.orderId);
        state.pending.push({
          orderId: order.orderId,
          title: order.title,
          qty: order.qty || 1,
          amountRub: order.amountRub || 1,
          status: 'refunded',
          source: 'funpay',
        });
      }
    });
    state.note = skipped ? `Не в рублях и не вошли в смену: ${skipped}` : '';
    if (state.pending.length) {
      persist();
      flush();
    } else if (ui.note && !state.error) {
      ui.note.textContent = state.note;
    }
  }

  async function flush() {
    if (!state.shift || state.sending || !state.pending.length) return;
    state.sending = true;
    const batch = state.pending.slice(0, 40);
    try {
      const result = await post('/api/ext/sales', { shiftId: state.shift.id, sales: batch });
      const sent = new Set(batch.map((sale) => sale.orderId));
      state.pending = state.pending.filter((sale) => !sent.has(sale.orderId));
      state.totals = result.shift;
      state.shift = { ...state.shift, ...result.shift };
      state.error = '';
      await persist();
      if (ui.qty) ui.qty.textContent = `${result.shift.qty} шт`;
      if (ui.money) ui.money.textContent = formatMoney(result.shift.grossRub);
      if (ui.profit) ui.profit.textContent = formatMoney(result.shift.profitRub);
      if (ui.note) ui.note.textContent = state.note;
    } catch (error) {
      state.error = message(error);
      if (ui.note) ui.note.textContent = state.error;
    } finally {
      state.sending = false;
    }
    if (!state.error && state.pending.length) flush();
  }

  async function persist() {
    await chrome.storage.local.set({
      shift: state.shift,
      seenOrderIds: [...state.seen],
      countedOrderIds: [...state.counted],
      baselineReady: state.baselineReady,
      pending: state.pending,
    });
  }

  async function post(path, body) {
    let response;
    try {
      response = await fetch(`${state.apiBase}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLV-Key': state.extensionKey,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('offline');
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || 'server_error');
      error.code = payload.error || 'server_error';
      throw error;
    }
    return payload;
  }

  if (state.shift) {
    post('/api/ext/shift/ping', { shiftId: state.shift.id })
      .then((result) => {
        state.totals = result.shift;
        if (result.shift.endedAt) {
          state.shift = null;
          persist().then(paint);
          return;
        }
        paint();
        scan();
      })
      .catch(() => {
        state.note = 'Нет связи с панелью';
        paint();
      });
  }

  let scanTimer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    scan();
    if (state.shift) {
      post('/api/ext/shift/ping', { shiftId: state.shift.id })
        .then((result) => {
          state.totals = result.shift;
          if (result.shift.endedAt) {
            state.shift = null;
            return persist().then(paint);
          }
          if (ui.qty) ui.qty.textContent = `${result.shift.qty} шт`;
          if (ui.money) ui.money.textContent = formatMoney(result.shift.grossRub);
          if (ui.profit) ui.profit.textContent = formatMoney(result.shift.profitRub);
        })
        .catch(() => {
          state.error = 'Нет связи с панелью';
          if (ui.note) ui.note.textContent = state.error;
        });
    }
  }, 15000);
}

function cleanBase(value) {
  try {
    const url = new URL(String(value || ''));
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function message(error) {
  if (error.code === 'unauthorized') return 'Ключ расширения не подошёл';
  if (error.code === 'extension_key_unconfigured') return 'На сервере не задан ключ расширения';
  if (error.message === 'offline') return 'Нет связи с панелью';
  return 'Не получилось отправить смену';
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0)} ₽`;
}

function duration(iso) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  const hours = Math.floor(minutes / 60);
  if (hours <= 0) return `${minutes} мин`;
  return `${hours} ч ${minutes % 60} мин`;
}

function el(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function p(text, className) {
  const node = el('p', text);
  if (className) node.className = className;
  return node;
}

function mark(className) {
  const img = document.createElement('img');
  img.className = className || 'mark';
  img.alt = '';
  img.src = chrome.runtime.getURL('icons/mark.png');
  return img;
}

function button(text, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}
