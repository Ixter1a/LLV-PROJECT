(function (root) {
  function session() {
    return root.LLVLots ? root.LLVLots.readSession(document) : { userId: 0, csrf: "" };
  }

  function profileId() {
    var match = location.pathname.match(/\/users\/(\d+)/);
    return match ? match[1] : "";
  }

  function isOwnProfile() {
    var id = profileId();
    var me = session().userId;
    return !!(id && me && String(id) === String(me));
  }

  function profileName() {
    var node = document.querySelector(".user-link-name, .media-user-name");
    return node ? root.LLV.visibleText(node) : "";
  }

  function nickStyles() {
    var out = [];
    var nodes = document.querySelectorAll("a[href*='/users/'][style], .user-link-name[style], .media-user-name[style]");
    var seen = {};
    Array.prototype.forEach.call(nodes, function (node) {
      var style = node.getAttribute("style") || "";
      var color = (style.match(/color:\s*([^;]+)/i) || [])[1];
      var weight = /font-weight/i.test(style);
      var glow = /text-shadow/i.test(style);
      if (!color && !weight && !glow) return;
      var key = color || "style";
      if (seen[key]) return;
      seen[key] = true;
      var name = root.LLV.visibleText(node.querySelector(".user-link-name, .media-user-name") || node);
      out.push({
        userId: (node.getAttribute("href") || "").replace(/^.*\/users\//, "").replace(/\/$/, ""),
        name: name,
        color: color || "",
        bold: weight,
        glow: glow,
        node: node
      });
    });
    return out;
  }

  function images(doc) {
    return root.LLVLots.imagesOf(doc || document);
  }

  function similarText(left, right) {
    var a = String(left || "").toLowerCase().trim();
    var b = String(right || "").toLowerCase().trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    var words = function (value) { return value.split(/\s+/).filter(Boolean); };
    var wa = words(a);
    var wb = words(b);
    var hit = wa.filter(function (word) { return wb.indexOf(word) !== -1; }).length;
    return hit / Math.max(wa.length, wb.length);
  }

  function bestMatch(title, lots) {
    var best = null;
    var score = 0;
    lots.forEach(function (lot) {
      var value = similarText(title, lot.title);
      if (value > score) {
        score = value;
        best = lot;
      }
    });
    return { lot: best, score: score };
  }

  function foreignLots(doc) {
    var result = root.LLVLots.collectLots(doc || document);
    return result.lots.concat(result.foreign);
  }

  async function cloneForeignLot(lot, fetchImpl, templateLot) {
    var fetcher = fetchImpl || fetch;
    if (!templateLot) return { ok: false, error: "Нет своего лота в этом разделе, чтобы создать копию" };
    var images = images();
    var result = await root.LLVLots.createFromTemplate(templateLot, location, fetcher, {
      title: lot.title,
      price: lot.price,
      currency: lot.currency,
      description: "Копия лота " + (lot.title || "")
    });
    return result;
  }

  function supportRequest(orderId, text) {
    var id = orderId || (root.LLVChat ? root.LLVChat.orderId() : "");
    if (!id) return Promise.resolve({ ok: false, error: "Нет номера заказа" });
    var message = text || ("Прошу подтвердить выполнение заказа #" + id + ". Покупатель не подтверждает заказ.");
    var form = null;
    document.querySelectorAll("form").forEach(function (item) {
      if (form) return;
      if (/поддержк/i.test(item.innerText || "")) form = item;
    });
    if (form) {
      var area = form.querySelector("textarea, input[type='text']");
      if (area) {
        root.LLV.formField(area, message);
        return Promise.resolve({ ok: true, form: true });
      }
    }
    return Promise.reject(new Error("no-support-form"));
  }

  root.LLVMarket = {
    session: session,
    profileId: profileId,
    isOwnProfile: isOwnProfile,
    profileName: profileName,
    nickStyles: nickStyles,
    images: images,
    similarText: similarText,
    bestMatch: bestMatch,
    foreignLots: foreignLots,
    cloneForeignLot: cloneForeignLot,
    supportRequest: supportRequest
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
