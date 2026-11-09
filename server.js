const http = require('http');
const fs = require('fs');
const path = require('path');
const { createAppStore } = require('./lib/store');
const { EXTENSION_ORIGIN } = require('./lib/secrets');
const { HttpError, cleanName, cleanSale, isUuid } = require('./lib/validate');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 64 * 1024;
const RANGES = new Set(['today', 'week', 'month', 'all']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function createLimiter() {
  const buckets = new Map();
  return function allow(key, limit, windowMs) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.reset) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 5000) buckets.clear();
    return bucket.count <= limit;
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new HttpError(400, 'bad_json'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'bad_json'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'bad_json')));
  });
}

function cookieValue(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (origin !== EXTENSION_ORIGIN) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-LLV-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function publicFile(urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (full !== PUBLIC_DIR && !full.startsWith(`${PUBLIC_DIR}${path.sep}`)) return null;
  return full;
}

async function createApp(env = process.env) {
  const store = createAppStore(env);
  await store.init();
  await store.ensureOwner(env.SITE_PASSWORD || '');
  const allow = createLimiter();
  const SESSION_MAX = 12 * 60 * 60;

  async function requireSession(req) {
    const id = cookieValue(req, 'llv_session');
    if (!id) throw new HttpError(401, 'unauthorized');
    const session = await store.getSession(id);
    if (!session) throw new HttpError(401, 'unauthorized');
    return session;
  }

  async function requireWorker(req) {
    if (req.headers['x-llv-key']) throw new HttpError(401, 'unauthorized');
    const token = String(req.headers['x-llv-token'] || '');
    if (!/^llv_[A-Za-z0-9_-]{40,80}$/.test(token)) throw new HttpError(401, 'unauthorized');
    const worker = await store.workerFromToken(token);
    if (!worker) throw new HttpError(401, 'unauthorized');
    return worker;
  }

  function requirePagePost(req) {
    if (req.headers['x-requested-with'] !== 'llv') throw new HttpError(400, 'bad_request');
  }

  async function handle(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'X-Content-Type-Options': 'nosniff' });
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      send(res, 200, { ok: true });
      return;
    }

    const ip = clientIp(req);

    if (pathname === '/api/login' && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`login:${ip}`, 5, 15 * 60 * 1000)) throw new HttpError(429, 'rate_limited');
      const body = await readBody(req);
      const given = String(body.password || '').slice(0, 128);
      const name = body.name ? cleanName(body.name) : '';
      const admin = given ? await store.loginAdmin(name, given) : null;
      if (!admin) throw new HttpError(401, 'unauthorized');
      const session = await store.createSession(admin.id);
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const secure = proto === 'https' || req.socket.encrypted ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `llv_session=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX}${secure}`
      );
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      requirePagePost(req);
      const id = cookieValue(req, 'llv_session');
      if (id) await store.deleteSession(id);
      res.setHeader('Set-Cookie', 'llv_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/session' && req.method === 'GET') {
      if (!allow(`read:${ip}`, 120, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      if (!allow(`read:${ip}`, 120, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      const range = RANGES.has(url.searchParams.get('range')) ? url.searchParams.get('range') : 'today';
      const worker = url.searchParams.get('worker');
      if (worker && !isUuid(worker)) throw new HttpError(400, 'bad_request');
      send(res, 200, await store.dashboard(range, worker || null));
      return;
    }

    const endMatch = pathname.match(/^\/api\/shifts\/([^/]+)\/end$/);
    if (endMatch && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`write:${ip}`, 60, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      if (!isUuid(endMatch[1])) throw new HttpError(400, 'bad_request');
      send(res, 200, { shift: await store.endShift(endMatch[1]) });
      return;
    }

    const voidMatch = pathname.match(/^\/api\/sales\/([^/]+)\/void$/);
    if (voidMatch && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`write:${ip}`, 60, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      if (!isUuid(voidMatch[1])) throw new HttpError(400, 'bad_request');
      await store.voidSale(voidMatch[1]);
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/workers' && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`write:${ip}`, 30, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      const body = await readBody(req);
      send(res, 200, await store.issueWorker(cleanName(body.name)));
      return;
    }

    const tokenMatch = pathname.match(/^\/api\/workers\/([^/]+)\/token$/);
    if (tokenMatch && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`write:${ip}`, 30, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      if (!isUuid(tokenMatch[1])) throw new HttpError(400, 'bad_request');
      send(res, 200, await store.rotateWorkerToken(tokenMatch[1]));
      return;
    }

    if (pathname === '/api/admins' && req.method === 'POST') {
      requirePagePost(req);
      if (!allow(`write:${ip}`, 10, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      await requireSession(req);
      const body = await readBody(req);
      const next = String(body.password || '');
      if (next.length < 10 || next.length > 128) throw new HttpError(400, 'bad_request');
      await store.createAdmin(cleanName(body.name), next);
      send(res, 200, { ok: true });
      return;
    }

    if (pathname.startsWith('/api/ext/')) {
      if (!allow(`ext:${ip}`, 600, 60 * 1000)) throw new HttpError(429, 'rate_limited');
      const worker = await requireWorker(req);

      if (pathname === '/api/ext/shift/start' && req.method === 'POST') {
        await readBody(req);
        send(res, 200, await store.startShiftForWorker(worker.id));
        return;
      }

      if (pathname === '/api/ext/shift/end' && req.method === 'POST') {
        const body = await readBody(req);
        if (!isUuid(body.shiftId)) throw new HttpError(400, 'bad_request');
        send(res, 200, { shift: await store.endShift(body.shiftId, worker.id) });
        return;
      }

      if (pathname === '/api/ext/shift/ping' && req.method === 'POST') {
        const body = await readBody(req);
        if (!isUuid(body.shiftId)) throw new HttpError(400, 'bad_request');
        send(res, 200, { shift: await store.touchShift(body.shiftId, worker.id) });
        return;
      }

      if (pathname === '/api/ext/sales' && req.method === 'POST') {
        const body = await readBody(req);
        if (!isUuid(body.shiftId)) throw new HttpError(400, 'bad_request');
        if (!Array.isArray(body.sales) || body.sales.length < 1 || body.sales.length > 40) {
          throw new HttpError(400, 'bad_sale');
        }
        send(res, 200, await store.addSales(body.shiftId, body.sales.map(cleanSale), worker.id));
        return;
      }
    }

    if (!pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const file = publicFile(pathname);
      if (!file) {
        send(res, 404, { error: 'not_found' });
        return;
      }
      let stat;
      try {
        stat = await fs.promises.stat(file);
      } catch {
        send(res, 404, { error: 'not_found' });
        return;
      }
      if (!stat.isFile()) {
        send(res, 404, { error: 'not_found' });
        return;
      }
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(req.method === 'HEAD' ? 200 : 200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'X-Frame-Options': 'DENY',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
      return;
    }

    send(res, 404, { error: 'not_found' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) return;
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error('request failed');
      send(res, status, { error: error instanceof HttpError ? error.code : 'server_error' });
    });
  });

  return { server, store, kind: store.kind };
}

async function main() {
  const { server, kind } = await createApp(process.env);
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`llv listening on ${host}:${port} (${kind})`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('startup failed');
    console.error(error && error.message ? error.message : 'unknown');
    process.exit(1);
  });
}

module.exports = { createApp };
