const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../server');

const password = crypto.randomBytes(18).toString('hex');
const extensionKey = crypto.randomBytes(18).toString('hex');

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llv-'));
  const { server } = await createApp({
    DATA_FILE: path.join(dir, 'store.json'),
    SITE_PASSWORD: password,
    EXTENSION_KEY: extensionKey,
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

function ext(base, pathname, body) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LLV-Key': extensionKey },
    body: JSON.stringify(body),
  });
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
      body: JSON.stringify({ workerName: 'Аня' }),
    });
    assert.equal(noKey.status, 401);

    const started = await ext(base, '/api/ext/shift/start', { workerName: 'Аня' });
    assert.equal(started.status, 200);
    const first = await started.json();
    assert.equal(first.resumed, false);

    const again = await ext(base, '/api/ext/shift/start', { workerName: 'аня' });
    const resumed = await again.json();
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.shift.id, first.shift.id);

    const sold = await ext(base, '/api/ext/sales', {
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

    const duplicate = await ext(base, '/api/ext/sales', {
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

    const refund = await ext(base, '/api/ext/sales', {
      shiftId: first.shift.id,
      sales: [{ orderId: 'ORDER1001', title: 'возврат', qty: 3, amountRub: 250, status: 'refunded', source: 'funpay' }],
    });
    assert.equal((await refund.json()).voided, 1);

    const after = await fetch(`${base}/api/dashboard?range=all`, { headers });
    const afterBody = await after.json();
    assert.equal(afterBody.totals.grossRub, 199.99);
    assert.equal(afterBody.totals.profitRub, 20);
    assert.equal(afterBody.totals.qty, 1);

    const manual = await ext(base, '/api/ext/sales', {
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

test('rejects a bad worker name and a closed shift', async () => {
  const { server, base } = await start();
  try {
    const bad = await ext(base, '/api/ext/shift/start', { workerName: '<script>' });
    assert.equal(bad.status, 400);
    const started = await ext(base, '/api/ext/shift/start', { workerName: 'Борис' });
    const shift = (await started.json()).shift;
    const ended = await ext(base, '/api/ext/shift/end', { shiftId: shift.id });
    assert.equal(ended.status, 200);
    const late = await ext(base, '/api/ext/sales', {
      shiftId: shift.id,
      sales: [{ orderId: 'LATEORDER1', title: 'поздно', qty: 1, amountRub: 10, status: 'completed', source: 'funpay' }],
    });
    assert.equal(late.status, 404);
  } finally {
    server.close();
  }
});
