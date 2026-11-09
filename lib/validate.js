const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_ID = /^[A-Za-z0-9_-]{4,80}$/;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,30}$/u;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function cleanName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!NAME.test(name) || name.length < 2) {
    throw new HttpError(400, 'bad_name');
  }
  return name;
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function toCents(value) {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  const cents = Math.round(n * 100);
  if (cents < 1 || cents > 100_000_000) return null;
  return cents;
}

function cleanSale(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'bad_sale');
  const status = input.status === 'refunded' ? 'refunded' : input.status === 'paid' ? 'paid' : 'completed';
  const source = input.source === 'manual' ? 'manual' : 'funpay';
  const orderId = cleanText(input.orderId, 80);
  if (!ORDER_ID.test(orderId)) throw new HttpError(400, 'bad_order');
  const qty = Number(input.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new HttpError(400, 'bad_qty');
  const amountCents = status === 'refunded' ? toCents(input.amountRub || 1) : toCents(input.amountRub);
  if (!amountCents) throw new HttpError(400, 'bad_amount');
  return {
    orderId,
    title: cleanText(input.title, 180),
    qty,
    amountCents,
    source,
    status,
  };
}

function isUuid(value) {
  return UUID.test(String(value || ''));
}

module.exports = {
  HttpError,
  cleanName,
  cleanSale,
  cleanText,
  isUuid,
  toCents,
};
