CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open
  ON shifts (worker_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  order_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL CHECK (qty > 0 AND qty <= 10000),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
  source TEXT NOT NULL CHECK (source IN ('funpay', 'manual')),
  voided BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_worker_order_uidx
  ON sales (worker_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_created_idx ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_shift_idx ON sales (shift_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
