const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../server');

const password = crypto.randomBytes(18).toString('hex');
const { EXTENSION_ORIGIN } = require('../lib/secrets');

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llv-'));
  const { server } = await createApp({
    DATA_FILE: path.join(dir, 'store.json'),
    SITE_PASSWORD: password,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

async function login(base) {
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

function raw(port, urlPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: urlPath, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
}

function ext(base, token, pathname, body) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLV-Token': token },
    body: JSON.stringify(body),
  });
}

async function issue(base, cookie, name) {
  const response = await fetch(`${base}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv', Cookie: cookie },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('password, sales, refunds and 10 percent profit', async () => {
  const { server, base } = await start();
  try {
    const denied = await fetch(`${base}/api/dashboard`);
    assert.equal(denied.status, 401);

    const wrong = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
      body: JSON.stringify({ password: 'nope' }),
    });
    assert.equal(wrong.status, 401);

    const cookie = await login(base);
    const headers = { 'X-Requested-With': 'llv', Cookie: cookie };

    const noKey = await fetch(`${base}/api/ext/shift/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(noKey.status, 401);

    const shared = await fetch(`${base}/api/ext/shift/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLV-Key': password },
      body: JSON.stringify({ workerName: 'Аня' }),
    });
    assert.equal(shared.status, 401);

    const anya = await issue(base, cookie, 'Аня');
    assert.match(anya.token, /^llv_/);
    const started = await ext(base, anya.token, '/api/ext/shift/start', { workerName: 'Чужой' });
    assert.equal(started.status, 200);
    const first = await started.json();
    assert.equal(first.resumed, false);
    assert.equal(first.shift.workerName, 'Аня');

    const again = await ext(base, anya.token, '/api/ext/shift/start', {});
    const resumed = await again.json();
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.shift.id, first.shift.id);

    const sold = await ext(base, anya.token, '/api/ext/sales', {
      shiftId: first.shift.id,
      sales: [
        { orderId: 'ORDER1001', title: '3 шт алмазов', qty: 3, amountRub: 250, status: 'completed', source: 'funpay' },
        { orderId: 'ORDER1999', title: 'ключ', qty: 1, amountRub: 199.99, status: 'paid', source: 'funpay' },
      ],
    });
    assert.equal(sold.status, 200);
    const soldBody = await sold.json();
    assert.equal(soldBody.added, 2);
    assert.equal(soldBody.shift.qty, 4);
    assert.equal(soldBody.shift.grossRub, 449.99);
    assert.equal(soldBody.shift.profitRub, 45);

    const duplicate = await ext(base, anya.token, '/api/ext/sales', {
      shiftId: first.shift.id,
      sales: [{ orderId: 'ORDER1001', title: '3 шт алмазов', qty: 3, amountRub: 250, status: 'completed', source: 'funpay' }],
    });
    assert.equal((await duplicate.json()).ignored, 1);

    const board = await fetch(`${base}/api/dashboard?range=today`, { headers });
    const dashboard = await board.json();
    assert.equal(dashboard.totals.orders, 2);
    assert.equal(dashboard.totals.qty, 4);
    assert.equal(dashboard.totals.profitRub, 45);
    assert.equal(dashboard.workers[0].name, 'Аня');
    assert.equal(dashboard.timezone, 'Asia/Vladivostok');
    assert.equal(JSON.stringify(dashboard).includes(anya.token), false);
    assert.equal(JSON.stringify(dashboard).includes('tokenHash'), false);

    const refund = await ext(base, anya.token, '/api/ext/sales', {
      shiftId: first.shift.id,
      sales: [{ orderId: 'ORDER1001', title: 'возврат', qty: 3, amountRub: 250, status: 'refunded', source: 'funpay' }],
    });
    assert.equal((await refund.json()).voided, 1);

    const after = await fetch(`${base}/api/dashboard?range=all`, { headers });
    const afterBody = await after.json();
    assert.equal(afterBody.totals.grossRub, 199.99);
    assert.equal(afterBody.totals.profitRub, 20);
    assert.equal(afterBody.totals.qty, 1);

    const manual = await ext(base, anya.token, '/api/ext/sales', {
      shiftId: first.shift.id,
      sales: [{ orderId: 'manual-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '<b>руками</b>', qty: 2, amountRub: 50, status: 'completed', source: 'manual' }],
    });
    assert.equal(manual.status, 200);

    const leaked = await raw(server.address().port, '/../server.js');
    assert.equal(leaked.status, 404);
    assert.equal(leaked.body.includes('createApp'), false);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Начать смену|Кто сколько сделал/);
  } finally {
    server.close();
  }
});

test('a personal key cannot touch another worker, and a closed shift rejects sales', async () => {
  const { server, base } = await start();
  try {
    const cookie = await login(base);
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'llv', Cookie: cookie };
    const bad = await fetch(`${base}/api/workers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '<script>' }),
    });
    assert.equal(bad.status, 400);

    const boris = await issue(base, cookie, 'Борис');
    const mark = await issue(base, cookie, 'Марк');
    const started = await ext(base, boris.token, '/api/ext/shift/start', {});
    const shift = (await started.json()).shift;
    const stolen = await ext(base, mark.token, '/api/ext/sales', {
      shiftId: shift.id,
      sales: [{ orderId: 'STOLENORDER1', title: 'чужое', qty: 1, amountRub: 10, status: 'completed', source: 'funpay' }],
    });
    assert.equal(stolen.status, 403);
    const endedByOther = await ext(base, mark.token, '/api/ext/shift/end', { shiftId: shift.id });
    assert.equal(endedByOther.status, 403);

    const ended = await ext(base, boris.token, '/api/ext/shift/end', { shiftId: shift.id });
    assert.equal(ended.status, 200);
    const late = await ext(base, boris.token, '/api/ext/sales', {
      shiftId: shift.id,
      sales: [{ orderId: 'LATEORDER1', title: 'поздно', qty: 1, amountRub: 10, status: 'completed', source: 'funpay' }],
    });
    assert.equal(late.status, 404);

    const rotated = await fetch(`${base}/api/workers/${boris.worker.id}/token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    const fresh = await rotated.json();
    assert.equal(rotated.status, 200);
    const oldToken = await ext(base, boris.token, '/api/ext/shift/start', {});
    assert.equal(oldToken.status, 401);
    const next = await ext(base, fresh.token, '/api/ext/shift/start', {});
    assert.equal(next.status, 200);

    const admin = await fetch(`${base}/api/admins`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Катя', password: 'otdelny-parol' }),
    });
    assert.equal(admin.status, 200);
    const named = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
      body: JSON.stringify({ name: 'Катя', password: 'otdelny-parol' }),
    });
    assert.equal(named.status, 200);
  } finally {
    server.close();
  }
});

test('the hosting handler serves health without a manual listen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llv-host-'));
  const previous = {
    DATA_FILE: process.env.DATA_FILE,
    SITE_PASSWORD: process.env.SITE_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.DATA_FILE = path.join(dir, 'store.json');
  process.env.SITE_PASSWORD = password;
  delete process.env.DATABASE_URL;
  const handler = require('../server');
  assert.equal(typeof handler, 'function');
  const hosted = http.createServer(handler);
  await new Promise((resolve) => hosted.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${hosted.address().port}`;
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const rewritten = await fetch(`${base}/server.js?llv_path=/api/health`);
    assert.equal(rewritten.status, 200);
    const stripped = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
      body: JSON.stringify({ password: 'nope' }),
    });
    assert.equal(stripped.status, 401);
  } finally {
    hosted.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('login slows down and only the shipped extension origin is allowed', async () => {
  const { server, base } = await start();
  try {
    for (let i = 0; i < 5; i += 1) {
      const wrong = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
        body: JSON.stringify({ password: 'nope' }),
      });
      assert.equal(wrong.status, 401);
    }
    const blocked = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'llv' },
      body: JSON.stringify({ password }),
    });
    assert.equal(blocked.status, 429);

    const pinned = await fetch(`${base}/api/health`, { headers: { Origin: EXTENSION_ORIGIN } });
    assert.equal(pinned.headers.get('access-control-allow-origin'), EXTENSION_ORIGIN);
    const other = await fetch(`${base}/api/health`, {
      headers: { Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const funpay = await fetch(`${base}/api/health`, { headers: { Origin: 'https://funpay.com' } });
    assert.equal(funpay.headers.get('access-control-allow-origin'), null);
  } finally {
    server.close();
  }
});
