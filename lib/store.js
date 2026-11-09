const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { HttpError } = require('./validate');
const { rangeStart } = require('./time');
const { hashPassword, hashToken, newToken, verifyPassword } = require('./secrets');

const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_WORKERS = 200;
const MAX_SALES = 200000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function presentAmounts(cents) {
  const gross = Number(cents) || 0;
  return {
    grossRub: round2(gross / 100),
    profitRub: round2(Math.round(gross * 0.1) / 100),
  };
}

function sumSales(rows) {
  let orders = 0;
  let qty = 0;
  let cents = 0;
  for (const row of rows) {
    if (row.voided) continue;
    orders += 1;
    qty += row.qty;
    cents += row.amountCents;
  }
  return { orders, qty, ...presentAmounts(cents) };
}

function createAppStore(env) {
  if (env.DATABASE_URL) return createPgStore(env);
  return createFileStore(env);
}

function createFileStore(env) {
  const file = env.DATA_FILE || path.join(process.cwd(), 'data', 'store.json');
  let tail = Promise.resolve();

  function lock(fn) {
    const run = tail.then(() => fn());
    tail = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function blank() {
      return { workers: [], shifts: [], sales: [], sessions: [], admins: [], tokens: [] };
  }

  async function read() {
    try {
      const raw = await fs.promises.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      data.workers ||= [];
      data.shifts ||= [];
      data.sales ||= [];
      data.sessions ||= [];
      data.admins ||= [];
      data.tokens ||= [];
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return blank();
      throw error;
    }
  }

  async function write(data) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(data));
    await fs.promises.rename(tmp, file);
  }

  function presentShift(data, shift) {
    const worker = data.workers.find((item) => item.id === shift.workerId);
    const totals = sumSales(data.sales.filter((sale) => sale.shiftId === shift.id));
    return {
      id: shift.id,
      workerId: shift.workerId,
      workerName: worker ? worker.name : '',
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      lastSeenAt: shift.lastSeenAt,
      ...totals,
    };
  }

  return {
    kind: 'file',
    async init() {
      await lock(async () => {
        await write(await read());
      });
    },
    async createSession(adminId) {
      return lock(async () => {
        const data = await read();
        const now = Date.now();
        data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
        const session = {
          id: crypto.randomBytes(32).toString('hex'),
          adminId,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + SESSION_MS).toISOString(),
        };
        data.sessions.push(session);
        await write(data);
        return session;
      });
    },
    async ensureOwner(password) {
      if (!password) return;
      return lock(async () => {
        const data = await read();
        if (data.admins.length) return;
        data.admins.push({
          id: crypto.randomUUID(),
          name: 'owner',
          nameKey: 'owner',
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString(),
        });
        await write(data);
      });
    },
    async loginAdmin(name, password) {
      return lock(async () => {
        const data = await read();
        const wanted = String(name || '').trim().toLocaleLowerCase('ru-RU')
          || (data.admins.length === 1 ? data.admins[0].nameKey : 'owner');
        const admin = data.admins.find((item) => item.nameKey === wanted);
        if (!admin || !verifyPassword(password, admin.passwordHash)) return null;
        return { id: admin.id, name: admin.name };
      });
    },
    async createAdmin(name, password) {
      return lock(async () => {
        const data = await read();
        const nameKey = name.toLocaleLowerCase('ru-RU');
        if (data.admins.some((item) => item.nameKey === nameKey)) throw new HttpError(409, 'name_taken');
        data.admins.push({
          id: crypto.randomUUID(),
          name,
          nameKey,
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString(),
        });
        await write(data);
      });
    },
    async issueWorker(name) {
      return lock(async () => {
        const data = await read();
        const nameKey = name.toLocaleLowerCase('ru-RU');
        if (data.workers.some((item) => item.nameKey === nameKey)) throw new HttpError(409, 'name_taken');
        if (data.workers.length >= MAX_WORKERS) throw new HttpError(409, 'too_many_workers');
        const worker = {
          id: crypto.randomUUID(),
          name,
          nameKey,
          createdAt: new Date().toISOString(),
        };
        const token = newToken();
        data.workers.push(worker);
        data.tokens.push({
          id: crypto.randomUUID(),
          workerId: worker.id,
          tokenHash: hashToken(token),
          createdAt: new Date().toISOString(),
          revokedAt: null,
        });
        await write(data);
        return { worker: { id: worker.id, name: worker.name }, token };
      });
    },
    async rotateWorkerToken(workerId) {
      return lock(async () => {
        const data = await read();
        const worker = data.workers.find((item) => item.id === workerId);
        if (!worker) throw new HttpError(404, 'not_found');
        const now = new Date().toISOString();
        data.tokens.forEach((item) => {
          if (item.workerId === workerId && !item.revokedAt) item.revokedAt = now;
        });
        const token = newToken();
        data.tokens.push({
          id: crypto.randomUUID(),
          workerId,
          tokenHash: hashToken(token),
          createdAt: now,
          revokedAt: null,
        });
        await write(data);
        return { worker: { id: worker.id, name: worker.name }, token };
      });
    },
    async workerFromToken(token) {
      return lock(async () => {
        const data = await read();
        const tokenHash = hashToken(token);
        const row = data.tokens.find((item) => item.tokenHash === tokenHash && !item.revokedAt);
        if (!row) return null;
        const worker = data.workers.find((item) => item.id === row.workerId);
        return worker ? { id: worker.id, name: worker.name } : null;
      });
    },
    async startShiftForWorker(workerId) {
      return lock(async () => {
        const data = await read();
        const worker = data.workers.find((item) => item.id === workerId);
        if (!worker) throw new HttpError(404, 'not_found');
        const now = new Date().toISOString();
        let shift = data.shifts.find((item) => item.workerId === worker.id && !item.endedAt);
        let resumed = true;
        if (!shift) {
          shift = {
            id: crypto.randomUUID(),
            workerId: worker.id,
            startedAt: now,
            endedAt: null,
            lastSeenAt: now,
          };
          data.shifts.push(shift);
          resumed = false;
        } else {
          shift.lastSeenAt = now;
        }
        await write(data);
        return { shift: presentShift(data, shift), resumed };
      });
    },
    async getSession(id) {
      return lock(async () => {
        const data = await read();
        const session = data.sessions.find((item) => item.id === id);
        if (!session) return null;
        if (Date.parse(session.expiresAt) <= Date.now()) {
          data.sessions = data.sessions.filter((item) => item.id !== id);
          await write(data);
          return null;
        }
        return session;
      });
    },
    async deleteSession(id) {
      return lock(async () => {
        const data = await read();
        data.sessions = data.sessions.filter((item) => item.id !== id);
        await write(data);
      });
    },
    async startShift(name) {
      return lock(async () => {
        const data = await read();
        const nameKey = name.toLocaleLowerCase('ru-RU');
        let worker = data.workers.find((item) => item.nameKey === nameKey);
        if (!worker) {
          if (data.workers.length >= MAX_WORKERS) throw new HttpError(409, 'too_many_workers');
          worker = {
            id: crypto.randomUUID(),
            name,
            nameKey,
            createdAt: new Date().toISOString(),
          };
          data.workers.push(worker);
        }
        const now = new Date().toISOString();
        let shift = data.shifts.find((item) => item.workerId === worker.id && !item.endedAt);
        let resumed = true;
        if (!shift) {
          shift = {
            id: crypto.randomUUID(),
            workerId: worker.id,
            startedAt: now,
            endedAt: null,
            lastSeenAt: now,
          };
          data.shifts.push(shift);
          resumed = false;
        } else {
          shift.lastSeenAt = now;
        }
        await write(data);
        return { shift: presentShift(data, shift), resumed };
      });
    },
    async touchShift(shiftId, actorId) {
      return lock(async () => {
        const data = await read();
        const shift = data.shifts.find((item) => item.id === shiftId && !item.endedAt);
        if (!shift) throw new HttpError(404, 'shift_not_found');
        if (actorId && shift.workerId !== actorId) throw new HttpError(403, 'forbidden');
        shift.lastSeenAt = new Date().toISOString();
        await write(data);
        return presentShift(data, shift);
      });
    },
    async endShift(shiftId, actorId) {
      return lock(async () => {
        const data = await read();
        const shift = data.shifts.find((item) => item.id === shiftId);
        if (!shift) throw new HttpError(404, 'shift_not_found');
        if (actorId && shift.workerId !== actorId) throw new HttpError(403, 'forbidden');
        if (!shift.endedAt) {
          const now = new Date().toISOString();
          shift.endedAt = now;
          shift.lastSeenAt = now;
          await write(data);
        }
        return presentShift(data, shift);
      });
    },
    async addSales(shiftId, sales, actorId) {
      return lock(async () => {
        const data = await read();
        const shift = data.shifts.find((item) => item.id === shiftId && !item.endedAt);
        if (!shift) throw new HttpError(404, 'shift_not_found');
        if (actorId && shift.workerId !== actorId) throw new HttpError(403, 'forbidden');
        if (data.sales.length + sales.length > MAX_SALES) throw new HttpError(409, 'too_many_sales');
        let added = 0;
        let voided = 0;
        let ignored = 0;
        for (const sale of sales) {
          const existing = data.sales.find(
            (item) => item.workerId === shift.workerId && item.orderId === sale.orderId
          );
          if (sale.status === 'refunded') {
            if (existing && !existing.voided) {
              existing.voided = true;
              voided += 1;
            } else {
              ignored += 1;
            }
            continue;
          }
          if (!existing) {
            data.sales.push({
              id: crypto.randomUUID(),
              workerId: shift.workerId,
              shiftId: shift.id,
              orderId: sale.orderId,
              title: sale.title,
              qty: sale.qty,
              amountCents: sale.amountCents,
              source: sale.source,
              voided: false,
              createdAt: new Date().toISOString(),
            });
            added += 1;
          } else if (existing.voided) {
            existing.voided = false;
            existing.amountCents = sale.amountCents;
            existing.qty = sale.qty;
            existing.title = sale.title;
            existing.shiftId = shift.id;
            existing.source = sale.source;
            existing.createdAt = new Date().toISOString();
            added += 1;
          } else {
            ignored += 1;
          }
        }
        shift.lastSeenAt = new Date().toISOString();
        await write(data);
        return { added, voided, ignored, shift: presentShift(data, shift) };
      });
    },
    async voidSale(saleId) {
      return lock(async () => {
        const data = await read();
        const sale = data.sales.find((item) => item.id === saleId);
        if (!sale) throw new HttpError(404, 'sale_not_found');
        sale.voided = true;
        await write(data);
      });
    },
    async dashboard(range, workerId) {
      return lock(async () => {
        const data = await read();
        const from = rangeStart(range);
        const fromMs = from ? from.getTime() : null;
        const inRange = (sale) => fromMs === null || Date.parse(sale.createdAt) >= fromMs;
        const workers = data.workers
          .map((worker) => {
            const rows = data.sales.filter((sale) => sale.workerId === worker.id && inRange(sale));
            const open = data.shifts.find((shift) => shift.workerId === worker.id && !shift.endedAt);
            return {
              id: worker.id,
              name: worker.name,
              ...sumSales(rows),
              openShift: open ? presentShift(data, open) : null,
            };
          })
          .sort((a, b) => b.grossRub - a.grossRub || a.name.localeCompare(b.name, 'ru'));
        const scoped = workerId ? data.sales.filter((sale) => sale.workerId === workerId) : data.sales;
        const totals = sumSales(scoped.filter(inRange));
        const sales = scoped
          .filter(inRange)
          .slice()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, 40)
          .map((sale) => ({
            id: sale.id,
            workerId: sale.workerId,
            workerName: (data.workers.find((worker) => worker.id === sale.workerId) || {}).name || '',
            shiftId: sale.shiftId,
            orderId: sale.orderId,
            title: sale.title,
            qty: sale.qty,
            source: sale.source,
            voided: sale.voided,
            createdAt: sale.createdAt,
            ...presentAmounts(sale.voided ? 0 : sale.amountCents),
            grossRub: sale.voided ? 0 : presentAmounts(sale.amountCents).grossRub,
            profitRub: sale.voided ? 0 : presentAmounts(sale.amountCents).profitRub,
          }));
        return {
          range,
          timezone: 'Asia/Vladivostok',
          generatedAt: new Date().toISOString(),
          profitRate: 0.1,
          totals,
          workers,
          openShifts: data.shifts.filter((shift) => !shift.endedAt).map((shift) => presentShift(data, shift)),
          sales,
        };
      });
    },
  };
}

function databaseConnectionString(connectionString) {
  const at = connectionString.lastIndexOf('@');
  const host = at === -1 ? connectionString : connectionString.slice(at + 1);
  if (/^(localhost|127\.0\.0\.1)([:/]|$)/.test(host)) return connectionString;
  const splitAt = connectionString.indexOf('?');
  const base = splitAt === -1 ? connectionString : connectionString.slice(0, splitAt);
  const params = new URLSearchParams(splitAt === -1 ? '' : connectionString.slice(splitAt + 1));
  if (!params.has('sslmode')) params.set('sslmode', 'require');
  if ((params.get('sslmode') === 'require' || params.get('sslmode') === 'prefer') && !params.has('uselibpqcompat')) {
    params.set('uselibpqcompat', 'true');
  }
  return `${base}?${params.toString()}`;
}

function sqlStatements(sql) {
  return sql
    .split(';')
    .map((part) => part.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
}

function createPgStore(env) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: databaseConnectionString(env.DATABASE_URL),
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });
  pool.on('error', () => {
    console.error('database pool error');
  });

  function mapShift(row, totals) {
    return {
      id: row.id,
      workerId: row.worker_id,
      workerName: row.worker_name || '',
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      ...totals,
    };
  }

  async function shiftTotals(client, shiftId) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS orders,
              COALESCE(SUM(qty), 0)::int AS qty,
              COALESCE(SUM(amount_cents), 0)::int AS cents
       FROM sales
       WHERE shift_id = $1 AND NOT voided`,
      [shiftId]
    );
    const row = rows[0];
    return { orders: row.orders, qty: row.qty, ...presentAmounts(row.cents) };
  }

  async function loadShift(client, shiftId) {
    const { rows } = await client.query(
      `SELECT s.*, w.name AS worker_name
       FROM shifts s
       JOIN workers w ON w.id = s.worker_id
       WHERE s.id = $1`,
      [shiftId]
    );
    if (!rows[0]) return null;
    return mapShift(rows[0], await shiftTotals(client, shiftId));
  }

  return {
    kind: 'postgres',
    pool,
    async init() {
      const sql = await fs.promises.readFile(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');
      for (const statement of sqlStatements(sql)) {
        await pool.query(statement);
      }
    },
    async createSession(adminId) {
      const id = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + SESSION_MS);
      await pool.query(
        'INSERT INTO sessions (id, admin_id, expires_at) VALUES ($1, $2, $3)',
        [id, adminId, expires]
      );
      return { id, adminId, expiresAt: expires.toISOString() };
    },
    async getSession(id) {
      const { rows } = await pool.query('SELECT id, admin_id, expires_at FROM sessions WHERE id = $1', [id]);
      if (!rows[0]) return null;
      if (new Date(rows[0].expires_at).getTime() <= Date.now()) {
        await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
        return null;
      }
      return {
        id: rows[0].id,
        adminId: rows[0].admin_id,
        expiresAt: new Date(rows[0].expires_at).toISOString(),
      };
    },
    async deleteSession(id) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    },
    async ensureOwner(password) {
      if (!password) return;
      const existing = await pool.query('SELECT 1 FROM admins LIMIT 1');
      if (existing.rows[0]) return;
      await pool.query(
        `INSERT INTO admins (id, name, name_key, password_hash)
         VALUES ($1, 'owner', 'owner', $2)
         ON CONFLICT (name_key) DO NOTHING`,
        [crypto.randomUUID(), hashPassword(password)]
      );
    },
    async loginAdmin(name, password) {
      const wanted = String(name || '').trim().toLocaleLowerCase('ru-RU');
      const { rows } = wanted
        ? await pool.query('SELECT id, name, password_hash FROM admins WHERE name_key = $1', [wanted])
        : await pool.query('SELECT id, name, password_hash FROM admins');
      const admin = wanted ? rows[0] : rows.length === 1 ? rows[0] : rows.find((row) => row.name === 'owner');
      if (!admin || !verifyPassword(password, admin.password_hash)) return null;
      return { id: admin.id, name: admin.name };
    },
    async createAdmin(name, password) {
      const nameKey = name.toLocaleLowerCase('ru-RU');
      try {
        await pool.query(
          `INSERT INTO admins (id, name, name_key, password_hash) VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), name, nameKey, hashPassword(password)]
        );
      } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'name_taken');
        throw error;
      }
    },
    async issueWorker(name) {
      const nameKey = name.toLocaleLowerCase('ru-RU');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const count = await client.query('SELECT COUNT(*)::int AS n FROM workers');
        if (count.rows[0].n >= MAX_WORKERS) throw new HttpError(409, 'too_many_workers');
        const token = newToken();
        const workerId = crypto.randomUUID();
        await client.query(
          `INSERT INTO workers (id, name, name_key) VALUES ($1, $2, $3)`,
          [workerId, name, nameKey]
        );
        await client.query(
          `INSERT INTO worker_tokens (id, worker_id, token_hash) VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), workerId, hashToken(token)]
        );
        await client.query('COMMIT');
        return { worker: { id: workerId, name }, token };
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw new HttpError(409, 'name_taken');
        throw error;
      } finally {
        client.release();
      }
    },
    async rotateWorkerToken(workerId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const worker = await client.query('SELECT id, name FROM workers WHERE id = $1', [workerId]);
        if (!worker.rows[0]) throw new HttpError(404, 'not_found');
        await client.query(
          `UPDATE worker_tokens SET revoked_at = now() WHERE worker_id = $1 AND revoked_at IS NULL`,
          [workerId]
        );
        const token = newToken();
        await client.query(
          `INSERT INTO worker_tokens (id, worker_id, token_hash) VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), workerId, hashToken(token)]
        );
        await client.query('COMMIT');
        return { worker: { id: worker.rows[0].id, name: worker.rows[0].name }, token };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async workerFromToken(token) {
      const { rows } = await pool.query(
        `SELECT w.id, w.name
         FROM worker_tokens t
         JOIN workers w ON w.id = t.worker_id
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
        [hashToken(token)]
      );
      return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
    },
    async startShiftForWorker(workerId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const worker = await client.query('SELECT id, name FROM workers WHERE id = $1', [workerId]);
        if (!worker.rows[0]) throw new HttpError(404, 'not_found');
        const open = await client.query(
          `SELECT id FROM shifts WHERE worker_id = $1 AND ended_at IS NULL LIMIT 1`,
          [workerId]
        );
        let resumed = true;
        let shiftId = open.rows[0] && open.rows[0].id;
        if (!shiftId) {
          shiftId = crypto.randomUUID();
          try {
            await client.query(`INSERT INTO shifts (id, worker_id) VALUES ($1, $2)`, [shiftId, workerId]);
            resumed = false;
          } catch (error) {
            if (error.code !== '23505') throw error;
            const again = await client.query(
              `SELECT id FROM shifts WHERE worker_id = $1 AND ended_at IS NULL LIMIT 1`,
              [workerId]
            );
            shiftId = again.rows[0].id;
            resumed = true;
          }
        } else {
          await client.query('UPDATE shifts SET last_seen_at = now() WHERE id = $1', [shiftId]);
        }
        const shift = await loadShift(client, shiftId);
        await client.query('COMMIT');
        return { shift, resumed };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async startShift(name) {
      const nameKey = name.toLocaleLowerCase('ru-RU');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const count = await client.query('SELECT COUNT(*)::int AS n FROM workers');
        let worker = (
          await client.query('SELECT id, name FROM workers WHERE name_key = $1', [nameKey])
        ).rows[0];
        if (!worker) {
          if (count.rows[0].n >= MAX_WORKERS) throw new HttpError(409, 'too_many_workers');
          const inserted = await client.query(
            `INSERT INTO workers (id, name, name_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (name_key) DO NOTHING
             RETURNING id, name`,
            [crypto.randomUUID(), name, nameKey]
          );
          worker =
            inserted.rows[0] ||
            (await client.query('SELECT id, name FROM workers WHERE name_key = $1', [nameKey])).rows[0];
        }
        const open = await client.query(
          `SELECT id FROM shifts WHERE worker_id = $1 AND ended_at IS NULL LIMIT 1`,
          [worker.id]
        );
        let resumed = true;
        let shiftId = open.rows[0] && open.rows[0].id;
        if (!shiftId) {
          shiftId = crypto.randomUUID();
          try {
            await client.query(
              `INSERT INTO shifts (id, worker_id) VALUES ($1, $2)`,
              [shiftId, worker.id]
            );
            resumed = false;
          } catch (error) {
            if (error.code !== '23505') throw error;
            const again = await client.query(
              `SELECT id FROM shifts WHERE worker_id = $1 AND ended_at IS NULL LIMIT 1`,
              [worker.id]
            );
            shiftId = again.rows[0].id;
            resumed = true;
          }
        } else {
          await client.query('UPDATE shifts SET last_seen_at = now() WHERE id = $1', [shiftId]);
        }
        const shift = await loadShift(client, shiftId);
        await client.query('COMMIT');
        return { shift, resumed };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async touchShift(shiftId, actorId) {
      const found = await pool.query(
        `SELECT worker_id FROM shifts WHERE id = $1 AND ended_at IS NULL`,
        [shiftId]
      );
      if (!found.rows[0]) throw new HttpError(404, 'shift_not_found');
      if (actorId && found.rows[0].worker_id !== actorId) throw new HttpError(403, 'forbidden');
      const { rowCount } = await pool.query(
        `UPDATE shifts SET last_seen_at = now() WHERE id = $1 AND ended_at IS NULL`,
        [shiftId]
      );
      if (!rowCount) throw new HttpError(404, 'shift_not_found');
      const client = await pool.connect();
      try {
        return await loadShift(client, shiftId);
      } finally {
        client.release();
      }
    },
    async endShift(shiftId, actorId) {
      const found = await pool.query('SELECT worker_id FROM shifts WHERE id = $1', [shiftId]);
      if (!found.rows[0]) throw new HttpError(404, 'shift_not_found');
      if (actorId && found.rows[0].worker_id !== actorId) throw new HttpError(403, 'forbidden');
      await pool.query(
        `UPDATE shifts SET ended_at = COALESCE(ended_at, now()), last_seen_at = now() WHERE id = $1`,
        [shiftId]
      );
      const client = await pool.connect();
      try {
        const shift = await loadShift(client, shiftId);
        if (!shift) throw new HttpError(404, 'shift_not_found');
        return shift;
      } finally {
        client.release();
      }
    },
    async addSales(shiftId, sales, actorId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(
          `SELECT id, worker_id FROM shifts WHERE id = $1 AND ended_at IS NULL FOR UPDATE`,
          [shiftId]
        );
        if (!found.rows[0]) throw new HttpError(404, 'shift_not_found');
        if (actorId && found.rows[0].worker_id !== actorId) throw new HttpError(403, 'forbidden');
        const workerId = found.rows[0].worker_id;
        const total = await client.query('SELECT COUNT(*)::int AS n FROM sales');
        if (total.rows[0].n + sales.length > MAX_SALES) throw new HttpError(409, 'too_many_sales');
        let added = 0;
        let voided = 0;
        let ignored = 0;
        for (const sale of sales) {
          const existing = await client.query(
            `SELECT id, voided FROM sales WHERE worker_id = $1 AND order_id = $2`,
            [workerId, sale.orderId]
          );
          const row = existing.rows[0];
          if (sale.status === 'refunded') {
            if (row && !row.voided) {
              await client.query('UPDATE sales SET voided = true WHERE id = $1', [row.id]);
              voided += 1;
            } else ignored += 1;
            continue;
          }
          if (!row) {
            try {
              await client.query(
                `INSERT INTO sales
                  (id, worker_id, shift_id, order_id, title, qty, amount_cents, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                  crypto.randomUUID(),
                  workerId,
                  shiftId,
                  sale.orderId,
                  sale.title,
                  sale.qty,
                  sale.amountCents,
                  sale.source,
                ]
              );
              added += 1;
            } catch (error) {
              if (error.code !== '23505') throw error;
              ignored += 1;
            }
          } else if (row.voided) {
            await client.query(
              `UPDATE sales
               SET voided = false, amount_cents = $2, qty = $3, title = $4,
                   shift_id = $5, source = $6, created_at = now()
               WHERE id = $1`,
              [row.id, sale.amountCents, sale.qty, sale.title, shiftId, sale.source]
            );
            added += 1;
          } else ignored += 1;
        }
        await client.query('UPDATE shifts SET last_seen_at = now() WHERE id = $1', [shiftId]);
        const shift = await loadShift(client, shiftId);
        await client.query('COMMIT');
        return { added, voided, ignored, shift };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async voidSale(saleId) {
      const { rowCount } = await pool.query('UPDATE sales SET voided = true WHERE id = $1', [saleId]);
      if (!rowCount) throw new HttpError(404, 'sale_not_found');
    },
    async dashboard(range, workerId) {
      const from = rangeStart(range);
      const workersResult = await pool.query(
        `SELECT w.id, w.name,
                COUNT(s.id) FILTER (WHERE NOT s.voided AND ($1::timestamptz IS NULL OR s.created_at >= $1))::int AS orders,
                COALESCE(SUM(s.qty) FILTER (WHERE NOT s.voided AND ($1::timestamptz IS NULL OR s.created_at >= $1)), 0)::int AS qty,
                COALESCE(SUM(s.amount_cents) FILTER (WHERE NOT s.voided AND ($1::timestamptz IS NULL OR s.created_at >= $1)), 0)::int AS cents,
                sh.id AS shift_id
         FROM workers w
         LEFT JOIN sales s ON s.worker_id = w.id
         LEFT JOIN shifts sh ON sh.worker_id = w.id AND sh.ended_at IS NULL
         GROUP BY w.id, sh.id
         ORDER BY cents DESC, w.name ASC`,
        [from]
      );
      const openResult = await pool.query(
        `SELECT s.*, w.name AS worker_name
         FROM shifts s
         JOIN workers w ON w.id = s.worker_id
         WHERE s.ended_at IS NULL
         ORDER BY s.started_at ASC`
      );
      const client = await pool.connect();
      let openShifts;
      try {
        openShifts = [];
        for (const row of openResult.rows) {
          openShifts.push(mapShift(row, await shiftTotals(client, row.id)));
        }
      } finally {
        client.release();
      }
      const openByWorker = new Map(openShifts.map((shift) => [shift.workerId, shift]));
      const workers = workersResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        orders: row.orders,
        qty: row.qty,
        ...presentAmounts(row.cents),
        openShift: openByWorker.get(row.id) || null,
      }));
      const totalsResult = await pool.query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(qty), 0)::int AS qty,
                COALESCE(SUM(amount_cents), 0)::int AS cents
         FROM sales
         WHERE NOT voided
           AND ($1::timestamptz IS NULL OR created_at >= $1)
           AND ($2::uuid IS NULL OR worker_id = $2)`,
        [from, workerId]
      );
      const salesResult = await pool.query(
        `SELECT s.*, w.name AS worker_name
         FROM sales s
         JOIN workers w ON w.id = s.worker_id
         WHERE ($1::timestamptz IS NULL OR s.created_at >= $1)
           AND ($2::uuid IS NULL OR s.worker_id = $2)
         ORDER BY s.created_at DESC
         LIMIT 40`,
        [from, workerId]
      );
      const totalsRow = totalsResult.rows[0];
      return {
        range,
        timezone: 'Asia/Vladivostok',
        generatedAt: new Date().toISOString(),
        profitRate: 0.1,
        totals: {
          orders: totalsRow.orders,
          qty: totalsRow.qty,
          ...presentAmounts(totalsRow.cents),
        },
        workers,
        openShifts,
        sales: salesResult.rows.map((sale) => {
          const amounts = sale.voided ? { grossRub: 0, profitRub: 0 } : presentAmounts(sale.amount_cents);
          return {
            id: sale.id,
            workerId: sale.worker_id,
            workerName: sale.worker_name,
            shiftId: sale.shift_id,
            orderId: sale.order_id,
            title: sale.title,
            qty: sale.qty,
            source: sale.source,
            voided: sale.voided,
            createdAt: new Date(sale.created_at).toISOString(),
            ...amounts,
          };
        }),
      };
    },
  };
}

module.exports = { createAppStore, presentAmounts };
