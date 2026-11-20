(function (root) {
  var MONTHS = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11
  };

  function normalize(text) {
    return String(text || "").replace(/[\u00a0\u202f]/g, " ");
  }

  function parseRub(text) {
    var src = normalize(text);
    var re = /(\d{1,3}(?:[ .]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|руб(?:\.|лей|ля|ль)?)/gi;
    var match = null;
    var last = null;
    while ((match = re.exec(src))) last = match;
    if (!last) return null;
    var whole = last[1].replace(/[ .]/g, "");
    var fraction = last[2] ? "." + last[2] : "";
    var amount = Number(whole + fraction);
    if (!isFinite(amount) || amount < 0) return null;
    return Math.round(amount * 100) / 100;
  }

  function parseCount(text) {
    var src = normalize(text);
    var match = src.match(/(\d+)\s*(?:шт\.?|штук(?:и|а)?)/i) ||
      src.match(/[×xх]\s*(\d+)/i) ||
      src.match(/(\d+)\s*[×xх]/i);
    if (!match) return 1;
    var count = Number(match[1]);
    if (!isFinite(count) || count <= 0 || count > 100000) return 1;
    return count;
  }

  function isCompleted(text) {
    return /закрыт|выполнен|подтвержд[её]н/i.test(normalize(text));
  }

  function extractOrderId(hrefs, text) {
    var list = hrefs || [];
    for (var i = 0; i < list.length; i += 1) {
      var match = String(list[i] || "").match(/\/orders\/([A-Za-z0-9_-]{4,})(?:\/|\?|#|$)/);
      if (!match) continue;
      if (/^(trade|new|list)$/i.test(match[1])) continue;
      return match[1];
    }
    var fromText = normalize(text).match(/(?:заказ\s*)?[#№]\s*([A-Za-z0-9]{5,})/i);
    return fromText ? fromText[1] : null;
  }

  function parseSoldAt(text, now) {
    var src = normalize(text).toLowerCase();
    var clock = src.match(/(?:в\s+)?(\d{1,2}):(\d{2})/);
    var month = src.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/);
    var minuteAgo = src.match(/(\d+)\s+мин/);
    var hourAgo = src.match(/(\d+)\s+час/);
    if (/только что/.test(src)) return new Date(now.getTime());
    if (minuteAgo) return new Date(now.getTime() - Number(minuteAgo[1]) * 60000);
    if (hourAgo) return new Date(now.getTime() - Number(hourAgo[1]) * 3600000);
    if (!clock && !month && src.indexOf("сегодня") === -1 && src.indexOf("вчера") === -1) return null;
    var date = new Date(now.getTime());
    date.setSeconds(0, 0);
    if (month) {
      var year = month[3] ? Number(month[3]) : date.getFullYear();
      date.setFullYear(year, MONTHS[month[2]], Number(month[1]));
    } else if (src.indexOf("вчера") !== -1) {
      date.setDate(date.getDate() - 1);
    }
    if (clock) date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return date;
  }

  function inspectBlock(text, hrefs, now) {
    var body = normalize(text);
    if (!isCompleted(body)) return null;
    var amount = parseRub(body);
    if (amount === null) return null;
    var id = extractOrderId(hrefs, body);
    if (!id) return null;
    var soldAt = parseSoldAt(body, now || new Date());
    return {
      sourceKey: "funpay:" + id,
      orderId: id,
      count: parseCount(body),
      amountRub: amount,
      soldAt: soldAt ? soldAt.toISOString() : null
    };
  }

  root.LLVParser = {
    parseRub: parseRub,
    parseCount: parseCount,
    isCompleted: isCompleted,
    extractOrderId: extractOrderId,
    parseSoldAt: parseSoldAt,
    inspectBlock: inspectBlock
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
