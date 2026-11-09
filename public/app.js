const ERRORS = {
  unauthorized: 'Неверный пароль',
  password_unconfigured: 'Пароль входа ещё не задан на сервере',
  rate_limited: 'Слишком много попыток. Подождите немного.',
  server_error: 'Сервер не ответил',
};

const moneyFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const clockFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  hour: '2-digit',
  minute: '2-digit',
});
const saleFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const gate = document.querySelector('#gate');
const desk = document.querySelector('#desk');
const loginForm = document.querySelector('#login');
const loginError = document.querySelector('#login-error');
const roster = document.querySelector('#roster');
const live = document.querySelector('#live');
const feed = document.querySelector('#feed');
const scope = document.querySelector('#scope');
const everyone = document.querySelector('#everyone');
const clock = document.querySelector('#clock');

const view = { range: 'today', worker: '', data: null };

function h(tag, attrs, children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  });
  (children || []).forEach((child) => {
    el.append(child && child.nodeType ? child : document.createTextNode(child ?? ''));
  });
  return el;
}

function wholeTarget(target, value) {
  const cents = Math.round(Math.abs(target || 0) * 100) % 100;
  return cents ? value : Math.round(value);
}

function money(value) {
  const amount = Number(value) || 0;
  const cents = Math.round(Math.abs(amount) * 100) % 100;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
  return `${formatted} ₽`;
}

function duration(iso) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  const hours = Math.floor(minutes / 60);
  if (hours <= 0) return `${minutes} мин`;
  return `${hours} ч ${minutes % 60} мин`;
}

function fresh(iso) {
  return Date.now() - Date.parse(iso) < 90000;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'llv',
    },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'server_error');
    error.code = payload.error || 'server_error';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showGate() {
  desk.hidden = true;
  gate.hidden = false;
  document.querySelector('#password').focus();
}

function showDesk() {
  gate.hidden = true;
  desk.hidden = false;
}

function tween(el, next, format) {
  const from = Number(el.dataset.value || 0);
  const to = Number(next) || 0;
  const token = Number(el.dataset.token || 0) + 1;
  el.dataset.token = String(token);
  el.dataset.value = String(to);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    if (el.dataset.token !== String(token)) return;
    const t = Math.min(1, (now - start) / 700);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = format(t === 1 ? to : from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function selectedWorker() {
  if (!view.data || !view.worker) return null;
  return view.data.workers.find((worker) => worker.id === view.worker) || null;
}

function render() {
  const data = view.data;
  if (!data) return;
  const person = selectedWorker();
  const totals = person
    ? { qty: person.qty, grossRub: person.grossRub, profitRub: person.profitRub, orders: person.orders }
    : data.totals;
  tween(document.querySelector('#n-qty'), totals.qty, (value) => moneyFmt.format(Math.round(value)));
  tween(document.querySelector('#n-gross'), totals.grossRub, (value) => money(wholeTarget(totals.grossRub, value)));
  tween(document.querySelector('#n-profit'), totals.profitRub, (value) => money(wholeTarget(totals.profitRub, value)));

  const rangeLabel = { today: 'сегодня', week: 'с понедельника', month: 'этот месяц', all: 'за всё время' }[view.range];
  scope.textContent = person
    ? `${person.name} · ${rangeLabel} · Владивосток`
    : `Вся команда · ${rangeLabel} · Владивосток`;
  everyone.hidden = !person;

  roster.replaceChildren();
  if (!data.workers.length) {
    roster.append(h('p', { class: 'empty' }, ['Имён ещё нет. Они появятся, когда кто-то начнёт смену.']));
  }
  data.workers.forEach((worker) => {
    const on = worker.openShift && !worker.openShift.endedAt;
    const button = h('button', {
      type: 'button',
      class: `person${on ? ' is-on' : ''}${worker.id === view.worker ? ' is-selected' : ''}`,
      onclick: () => {
        view.worker = view.worker === worker.id ? '' : worker.id;
        refresh();
      },
    }, [
      h('strong', {}, [on ? h('i', { class: `dot${fresh(worker.openShift.lastSeenAt) ? '' : ' is-stale'}` }) : '', worker.name]),
      h('em', {}, [money(worker.profitRub)]),
      h('small', {}, [`${worker.qty} шт · оборот ${money(worker.grossRub)} · ${worker.orders} зак.`]),
    ]);
    roster.append(button);
  });

  const shifts = person ? data.openShifts.filter((shift) => shift.workerId === person.id) : data.openShifts;
  live.replaceChildren();
  if (!shifts.length) {
    live.append(h('p', { class: 'empty' }, ['Сейчас никто не на смене.']));
  }
  shifts.forEach((shift) => {
    live.append(h('article', { class: 'live-row' }, [
      h('div', {}, [h('i', { class: `dot${fresh(shift.lastSeenAt) ? '' : ' is-stale'}` }), shift.workerName]),
      h('div', { class: 'muted' }, [duration(shift.startedAt)]),
      h('div', {}, [`${shift.qty} шт`]),
      h('div', {}, [money(shift.profitRub)]),
      h('button', {
        type: 'button',
        class: 'mini',
        onclick: (event) => arm(event.currentTarget, 'Закрыть', () => closeShift(shift.id)),
      }, ['Закрыть']),
    ]));
  });

  const sales = person ? data.sales.filter((sale) => sale.workerId === person.id) : data.sales;
  feed.replaceChildren();
  if (!sales.length) {
    feed.append(h('p', { class: 'empty' }, [
      'Пока пусто. На FunPay расширение показывает «Начать смену» — после этого сюда приходят только новые заказы.',
    ]));
  }
  sales.forEach((sale) => {
    feed.append(h('article', { class: `sale${sale.voided ? ' is-void' : ''}` }, [
      h('div', { class: 'muted' }, [saleFmt.format(new Date(sale.createdAt))]),
      h('div', {}, [
        h('div', {}, [sale.workerName]),
        h('div', { class: 'title muted' }, [sale.title || (sale.source === 'manual' ? 'Ручная запись' : 'Заказ FunPay')]),
      ]),
      h('div', {}, [sale.voided ? 'возврат' : `${sale.qty} шт`]),
      h('div', {}, [sale.voided ? '0 ₽' : money(sale.grossRub)]),
      sale.voided
        ? h('div', {}, [''])
        : h('button', {
          type: 'button',
          class: 'mini',
          onclick: (event) => arm(event.currentTarget, 'Убрать', () => voidSale(sale.id)),
        }, ['Убрать']),
    ]));
  });
}

function arm(button, label, action) {
  if (button.dataset.armed === '1') {
    button.dataset.armed = '0';
    action();
    return;
  }
  button.dataset.armed = '1';
  button.textContent = 'Точно';
  setTimeout(() => {
    if (button.dataset.armed === '1') {
      button.dataset.armed = '0';
      button.textContent = label;
    }
  }, 2500);
}

async function refresh() {
  const query = new URLSearchParams({ range: view.range });
  if (view.worker) query.set('worker', view.worker);
  try {
    view.data = await api(`/api/dashboard?${query.toString()}`);
    if (view.worker && !view.data.workers.some((worker) => worker.id === view.worker)) view.worker = '';
    render();
  } catch (error) {
    if (error.status === 401) showGate();
  }
}

async function closeShift(id) {
  await api(`/api/shifts/${id}/end`, {});
  await refresh();
}

async function voidSale(id) {
  await api(`/api/sales/${id}/void`, {});
  await refresh();
}

function tickClock() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = `${clockFmt.format(now)} Владивосток`;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const button = loginForm.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/login', { password: document.querySelector('#password').value });
    document.querySelector('#password').value = '';
    showDesk();
    await refresh();
  } catch (error) {
    loginError.textContent = ERRORS[error.code] || 'Не получилось войти';
    loginForm.classList.remove('shake');
    void loginForm.offsetWidth;
    loginForm.classList.add('shake');
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#logout').addEventListener('click', async () => {
  await api('/api/logout', {});
  view.data = null;
  view.worker = '';
  showGate();
});

everyone.addEventListener('click', () => {
  view.worker = '';
  refresh();
});

document.querySelectorAll('#range button').forEach((button) => {
  button.addEventListener('click', () => {
    view.range = button.dataset.range;
    document.querySelectorAll('#range button').forEach((item) => {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
    refresh();
  });
});

tickClock();
setInterval(tickClock, 30000);
setInterval(() => {
  if (!desk.hidden && !document.hidden) refresh();
}, 15000);

const welcome = document.querySelector('#welcome');
const welcomeDone = new Promise((resolve) => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    welcome.hidden = true;
    resolve();
    return;
  }
  setTimeout(() => {
    welcome.classList.add('is-out');
    setTimeout(() => {
      welcome.hidden = true;
      resolve();
    }, 700);
  }, 1800);
});

const sessionReady = api('/api/session').then(() => 'desk').catch(() => 'gate');

Promise.all([welcomeDone, sessionReady]).then(([, mode]) => {
  if (mode === 'desk') {
    showDesk();
    refresh();
    return;
  }
  showGate();
});
