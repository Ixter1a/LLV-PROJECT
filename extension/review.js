(function (root) {
  var STARS = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5" };

  function settings() {
    return root.LLV ? root.LLV.current() : {};
  }

  function base() {
    var locale = root.LLVLots ? root.LLVLots.pageLocale(document) : "ru";
    return (locale === "ru" ? "" : "/" + locale) + "/orders/trade";
  }

  function starsIn(text) {
    var src = String(text || "");
    var match = src.match(/([1-5])\s*(?:из\s*5|\/5|звезд|звёзд)/i);
    if (match) return match[1];
    var full = (src.match(/★/g) || []).length;
    var empty = (src.match(/☆/g) || []).length;
    if (full || empty) return String(Math.min(5, Math.max(1, full)));
    var classes = src.match(/rating-(\d)|stars?-(\d)/);
    if (classes) return classes[1] || classes[2];
    return "5";
  }

  function formOnPage() {
    var forms = Array.prototype.slice.call(document.querySelectorAll("form"));
    for (var i = 0; i < forms.length; i += 1) {
      var form = forms[i];
      if (form.closest && (form.closest("#llv-settings") || form.closest("#llv-shift-root"))) continue;
      var area = form.querySelector("textarea");
      if (!area) continue;
      if (/отзыв|review/i.test(form.innerText || "")) return form;
      if (form.action && /review/i.test(form.action)) return form;
    }
    return null;
  }

  function textOnPage() {
    var blocks = document.querySelectorAll(".review-item-text, .review-text, .review");
    var last = blocks[blocks.length - 1];
    return last ? (last.innerText || last.textContent || "").trim() : (document.body.innerText || "").slice(0, 2000);
  }

  function build(rating, review) {
    var config = settings();
    var template = (config.reviews && config.reviews[rating]) || "";
    var fallback = template || "Спасибо за отзыв! Будем рады видеть вас снова.";
    if (!config.reviewAi || !root.LLVAi || !root.LLVAi.ready()) return Promise.resolve({ text: fallback, ai: false });
    return root.LLVAi.review(rating, review, template).then(function (answer) {
      return answer ? { text: answer, ai: true } : { text: fallback, ai: false };
    });
  }

  function aiReply(prompt) {
    if (!root.LLVAi) return Promise.resolve("");
    return root.LLVAi.ask(prompt);
  }

  function onPage(applyOnly) {
    var form = formOnPage();
    if (!form) return null;
    var area = form.querySelector("textarea");
    var rating = starsIn(textOnPage());
    var review = textOnPage();
    return build(rating, review).then(function (result) {
      root.LLV.formField(area, result.text);
      return { ok: true, rating: rating, text: result.text, ai: result.ai, applied: true };
    });
  }

  function replyTo(id, text) {
    return post({ node: id, action: "review", rating: "", content: text });
  }

  function post(data) {
    if (root.LLVChat) return root.LLVChat.post(base(), data);
    return Promise.resolve({ ok: false, error: "Модуль чата не загрузился" });
  }

  function list(doc) {
    var rows = [];
    Array.prototype.forEach.call(doc.querySelectorAll(".review-item"), function (item) {
      var id = item.getAttribute("data-order") || item.getAttribute("data-id") || "";
      var area = item.querySelector("textarea[name='text']");
      if (!id && area) {
        var form = area.closest("form");
        var hidden = form && form.querySelector("[name='node'], [name='order'], [name='order_id']");
        id = hidden ? hidden.value : "";
      }
      rows.push({
        id: id,
        text: (item.innerText || "").replace(/\s+/g, " ").trim().slice(0, 300),
        rating: starsIn(item.getAttribute("data-rating") || item.className + " " + item.innerText),
        form: area ? area.closest("form") : null,
        area: area
      });
    });
    return rows;
  }

  function answerPending() {
    var rows = list(document).filter(function (row) {
      return row.id && row.area && !row.area.value;
    });
    if (!rows.length) return Promise.resolve({ ok: false, error: "Нет отзывов без ответа на странице" });
    var result = { ok: true, sent: 0, failed: 0, details: [] };
    return rows.reduce(function (chain, row) {
      return chain.then(function () {
        return build(row.rating, row.text).then(function (built) {
          if (!row.form) {
            result.failed += 1;
            return null;
          }
          root.LLV.formField(row.area, built.text);
          root.LLV.submitChat(row.area);
          result.sent += 1;
          return null;
        });
      });
    }, Promise.resolve()).then(function () { return result; });
  }

  function medianRating() {
    var text = document.body.innerText || "";
    var match = text.match(/(\d[.,]\d)\s*(?:из\s*5|★|\/\s*5)/);
    return match ? match[1] : "";
  }

  root.LLVReview = {
    starsIn: starsIn,
    build: build,
    aiReply: aiReply,
    onPage: onPage,
    list: list,
    answerPending: answerPending,
    medianRating: medianRating
  };

  root.LLVReviewTick = function () {
    if (!/\/users\//.test(location.pathname)) return Promise.resolve({ ok: true, skipped: true });
    var config = settings();
    if (!config.reviewsAuto) return Promise.resolve({ ok: true, skipped: true });
    var rows = root.LLVReview.list(document).filter(function (row) {
      return row.id && row.area && !row.area.value.trim();
    });
    if (!rows.length) return Promise.resolve({ ok: true, sent: 0 });
    var row = rows[0];
    var key = "review:" + row.id;
    if (root.LLVChat && root.LLVChat.marked("review", key)) return Promise.resolve({ ok: true, skipped: true });
    return build(row.rating, row.text).then(function (built) {
      if (!row.form) return { ok: false, error: "Нет формы ответа" };
      if (root.LLVChat) root.LLVChat.mark(key, "review");
      root.LLV.formField(row.area, built.text);
      root.LLV.submitChat(row.area);
      root.LLV.toast("Ответ на отзыв " + row.rating + "★ " + (built.ai ? "нейросетью" : "по шаблону"));
      return { ok: true, sent: 1 };
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
