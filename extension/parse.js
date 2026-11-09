(function (root) {
  function orderIdFromHref(href) {
    const clean = String(href || '').split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const index = parts.lastIndexOf('orders');
    if (index === -1 || !parts[index + 1]) return '';
    return parts[index + 1];
  }

  function parseMoney(text) {
    const raw = String(text || '').replace(/\u00a0/g, ' ').trim();
    const hasRub = raw.includes('₽') || raw.includes('¤');
    const hasOther = raw.includes('$') || raw.includes('€');
    const currency = hasRub || !hasOther ? 'RUB' : 'OTHER';
    const match = raw.match(/(\d[\d\s]*)([.,]\d{1,2})?/);
    if (!match) return { amount: null, currency };
    const amount = Number(match[1].replace(/\s/g, '') + (match[2] ? match[2].replace(',', '.') : ''));
    if (!Number.isFinite(amount)) return { amount: null, currency };
    return { amount, currency };
  }

  function parseQty(title) {
    const patterns = [
      /(\d{1,6})\s*(?:штук|шт|pcs|pc)(?!\p{L})/iu,
      /[xх×]\s*(\d{1,6})(?!\d)/iu,
      /(?<!\d)(\d{1,6})\s*[xх×](?!\p{L})/iu,
    ];
    for (const pattern of patterns) {
      const match = String(title || '').match(pattern);
      if (!match) continue;
      const qty = Number(match[1]);
      if (qty >= 1 && qty <= 10000) return qty;
    }
    return 1;
  }

  function statusFromClass(className) {
    const value = String(className || '').toLowerCase();
    if (value.includes('text-warning')) return 'refunded';
    if (value.includes('text-success')) return 'completed';
    if (value.includes('text-primary')) return 'paid';
    return 'unknown';
  }

  function parseOrders(doc) {
    const nodes = doc.querySelectorAll('a.tc-item');
    const orders = [];
    nodes.forEach((node) => {
      const orderId = orderIdFromHref(node.getAttribute('href'));
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(orderId)) return;
      const statusNode = node.querySelector('.tc-status');
      const status = statusFromClass(statusNode && statusNode.className);
      const price = parseMoney((node.querySelector('.tc-price') || {}).textContent || '');
      const title = String((node.querySelector('.order-desc') || {}).textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      orders.push({
        orderId,
        status,
        title,
        qty: parseQty(title),
        amountRub: price.amount,
        currency: price.currency,
      });
    });
    return orders;
  }

  root.LLVParse = { parseOrders, parseMoney, parseQty, orderIdFromHref };
})(typeof globalThis !== 'undefined' ? globalThis : this);
