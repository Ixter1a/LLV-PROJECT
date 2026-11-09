const crypto = require('crypto');

const EXTENSION_ORIGIN = 'chrome-extension://linlopillbkbbjmadiijjafkkogioied';
const SCRYPT = { N: 16384, r: 8, p: 1 };

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return `llv_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (!salt.length || expected.length !== 32) return false;
  const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  EXTENSION_ORIGIN,
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
};
