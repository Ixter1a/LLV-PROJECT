const assert = require('node:assert/strict');
const test = require('node:test');
const { parseHTML } = require('linkedom');

require('../extension/parse.js');

test('reads FunPay order rows and skips other currencies', () => {
  const { document } = parseHTML(`
    <a class="tc-item" href="https://funpay.com/orders/ABCD12/">
      <div class="tc-status text-success">Закрыт</div>
      <div class="order-desc"><div>100 алмазов, 3 шт</div></div>
      <div class="tc-price">1 250 ₽</div>
    </a>
    <a class="tc-item" href="/orders/REFUND9/">
      <div class="tc-status text-warning">Возврат</div>
      <div class="order-desc"><div>возврат</div></div>
      <div class="tc-price">500 ₽</div>
    </a>
    <a class="tc-item" href="/orders/PAID01/">
      <div class="tc-status text-primary">Оплачен</div>
      <div class="order-desc"><div>аккаунт</div></div>
      <div class="tc-price">99,50 ₽</div>
    </a>
    <a class="tc-item" href="/orders/USD001/">
      <div class="tc-status text-success">Закрыт</div>
      <div class="order-desc"><div>usd</div></div>
      <div class="tc-price">10 $</div>
    </a>
  `);
  const orders = globalThis.LLVParse.parseOrders(document);
  assert.deepEqual(orders.map((order) => ({
    id: order.orderId,
    status: order.status,
    qty: order.qty,
    amount: order.amountRub,
    currency: order.currency,
  })), [
    { id: 'ABCD12', status: 'completed', qty: 3, amount: 1250, currency: 'RUB' },
    { id: 'REFUND9', status: 'refunded', qty: 1, amount: 500, currency: 'RUB' },
    { id: 'PAID01', status: 'paid', qty: 1, amount: 99.5, currency: 'RUB' },
    { id: 'USD001', status: 'completed', qty: 1, amount: 10, currency: 'OTHER' },
  ]);
});
