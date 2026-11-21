(function (root) {
  var KEY = "llvSeller";
  var EMOJI = ["👍", "🙏", "✅", "🔥", "⭐", "💬", "📦", "⚡", "🎯", "🙂"];

  function defaults() {
    return {
      autoRaise: false,
      raiseMinutes: 30,
      raiseNotice: true,
      quietOn: false,
      quietFrom: "23",
      quietTo: "8",
      highlight: false,
      promo: false,
      commission: "",
      realPrice: false,
      costs: {},
      quick: [],
      welcomeOn: false,
      welcome: "",
      keywordsOn: false,
      keywords: [],
      thanksOn: false,
      thanks: "",
      autoSend: false,
      reviews: { "1": "", "2": "", "3": "", "4": "", "5": "" },
      hideBalance: false,
      privacy: false,
      dark: false,
      background: "",
      sound: ""
    };
  }

  var settings = defaults();
  var raiseTimer = null;
  var quietNoted = false;
  var booted = false;

  function attach(panelRoot) {
    var more = null;
    if (panelRoot && !panelRoot.querySelector(".llv-more")) {
    var box = document.createElement("div");
    box.className = "llv-more-wrap";
    box.innerHTML =
      '<button type="button" class="llv-link llv-more-open">Ещё команды</button>' +
      '<div class="llv-more" hidden></div>';
    panelRoot.querySelector(".llv-panel").appendChild(box);
    more = box.querySelector(".llv-more");
    box.querySelector(".llv-more-open").addEventListener("click", function () {
      more.hidden = !more.hidden;
      if (!more.hidden) paintMore();
    });
    }

    function storageGet(done) {
      var local = root.chrome && root.chrome.storage && root.chrome.storage.local;
      if (!local || !local.get) {
        done(defaults());
        return;
      }
      local.get(KEY, function (data) {
        done(Object.assign(defaults(), (data && data[KEY]) || {}));
      });
    }

    function storageSet() {
      var local = root.chrome && root.chrome.storage && root.chrome.storage.local;
      if (!local || !local.set) return;
      var payload = {};
      payload[KEY] = settings;
      local.set(payload);
    }

    function toast(text) {
      var node = document.createElement("p");
      node.className = "llv-toast";
      node.textContent = text;
      var card = document.querySelector("#llv-shift-root .llv-panel");
      if (card) card.appendChild(node);
      else {
        var slot = document.querySelector("main, #content, .container") || document.body;
        slot.appendChild(node);
      }
      setTimeout(function () { node.remove(); }, 3500);
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Скопировано"); }, function () { fallbackCopy(text); });
        return;
      }
      fallbackCopy(text);
    }

    function fallbackCopy(text) {
      var area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); toast("Скопировано"); } catch (error) { toast("Не удалось скопировать"); }
      area.remove();
    }

    function download(name, content, type) {
      var blob = new Blob([content], { type: type });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function fee() {
      var value = Number(String(settings.commission).replace(",", "."));
      if (!isFinite(value) || value <= 0 || value >= 100) return 0;
      return value;
    }

    function money(value) {
      var number = Math.round(Number(value) * 100) / 100;
      return String(number).replace(".", ",");
    }

    function orderLinks() {
      var rows = [];
      var seen = {};
      document.querySelectorAll("a[href*='/orders/']").forEach(function (link) {
        if (link.closest && link.closest("#llv-shift-root")) return;
        var href = link.getAttribute("href") || "";
        var match = href.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
        if (!match || /^(trade|new|list|buy)$/i.test(match[1]) || seen[match[1]]) return;
        seen[match[1]] = true;
        var text = (link.innerText || "").replace(/\s+/g, " ").trim();
        var amount = root.LLVParser ? root.LLVParser.parseRub(text) : null;
        var completed = root.LLVParser ? root.LLVParser.isCompleted(text) : false;
        var paid = /оплачен/i.test(text) && !completed;
        rows.push({ id: match[1], text: text, amount: amount, completed: completed, paid: paid });
      });
      return rows;
    }

    function currentOrderId() {
      var match = location.pathname.match(/\/orders\/([A-Za-z0-9_-]{4,})/);
      if (!match || /^(trade|new|list|buy)$/i.test(match[1])) return "";
      return match[1];
    }

    function chatArea() {
      var area = document.querySelector("textarea[name='message'], .chat-form textarea, form.chat textarea");
      if (!area || (area.closest && area.closest("#llv-shift-root"))) return null;
      var named = area.getAttribute("name") === "message";
      var inChat = area.closest && area.closest(".chat, .chat-form, form.chat");
      if (!named && !inChat && !/\/(chat|orders)\//.test(location.pathname)) return null;
      return area;
    }

    function insertAt(area, text) {
      var start = area.selectionStart == null ? area.value.length : area.selectionStart;
      var end = area.selectionEnd == null ? start : area.selectionEnd;
      area.value = area.value.slice(0, start) + text + area.value.slice(end);
      area.dispatchEvent(new Event("input", { bubbles: true }));
      if (settings.autoSend) {
        var form = area.closest("form");
        var button = form && form.querySelector("button[type='submit'], button");
        if (button && !/куп/i.test(button.textContent || "")) button.click();
      }
    }

    function once(key) {
      var bag = {};
      try { bag = JSON.parse(sessionStorage.getItem("llvOnce") || "{}"); } catch (error) { bag = {}; }
      if (bag[key]) return false;
      bag[key] = 1;
      sessionStorage.setItem("llvOnce", JSON.stringify(bag));
      return true;
    }

    function armRaise() {
      if (raiseTimer) clearInterval(raiseTimer);
      raiseTimer = null;
      if (!settings.autoRaise || !root.LLVLots) return;
      var minutes = Math.max(5, Number(settings.raiseMinutes) || 30);
      raiseTimer = setInterval(function () {
        if (root.LLVLots.withinHours(new Date().getHours(), settings.quietFrom, settings.quietTo) && settings.quietOn) {
          if (settings.raiseNotice && !quietNoted) {
            quietNoted = true;
            toast("Тихие часы, поднятие на паузе");
          }
          return;
        }
        quietNoted = false;
        var result = root.LLVLots.raiseOnPage(document);
        if (settings.raiseNotice) toast(result.ok ? "Раздел: поднято" : (result.error || "Не удалось поднять"));
      }, minutes * 60000);
    }

    function paintPage() {
      document.documentElement.classList.toggle("llv-hide-balance", !!settings.hideBalance);
      document.documentElement.classList.toggle("llv-privacy", !!settings.privacy);
      document.documentElement.classList.toggle("llv-dark", !!settings.dark);
      document.documentElement.classList.toggle("llv-show-promo", !!settings.promo);
      if (settings.background) {
        document.body.style.backgroundImage = "url(\"" + settings.background + "\")";
        document.body.style.backgroundSize = "cover";
      } else if (document.body.style.backgroundImage.indexOf("data:") !== -1) {
        document.body.style.backgroundImage = "";
      }

      document.querySelectorAll(".llv-own").forEach(function (node) { node.classList.remove("llv-own"); });
      if (settings.highlight && root.LLVLots) {
        root.LLVLots.collectLots(document).lots.forEach(function (lot) {
          var row = root.LLVLots.rowById(document, lot.id);
          if (row) row.classList.add("llv-own");
        });
      }

      document.querySelectorAll(".llv-real, .llv-cost-line, .llv-fee").forEach(function (node) { node.remove(); });
      var rate = fee();
      if (settings.realPrice && rate && root.LLVParser) {
        document.querySelectorAll(".tc-price").forEach(function (node) {
          if (node.closest && node.closest("#llv-shift-root")) return;
          var amount = root.LLVParser.parseRub(node.textContent);
          if (amount === null) return;
          var line = document.createElement("div");
          line.className = "llv-real";
          line.textContent = "вам " + money(amount * (1 - rate / 100)) + " ₽";
          node.appendChild(line);
        });
      }
      if (settings.commission) {
        var heading = document.querySelector("h1");
        if (heading && !(heading.closest && heading.closest("#llv-shift-root"))) {
          var mark = document.createElement("span");
          mark.className = "llv-fee";
          mark.textContent = "Комиссия " + settings.commission + "%";
          heading.appendChild(mark);
        }
      }
      if (root.LLVLots) {
        root.LLVLots.collectLots(document).lots.forEach(function (lot) {
          var cost = Number(settings.costs[lot.id]);
          var row = root.LLVLots.rowById(document, lot.id);
          if (!row || !isFinite(cost)) return;
          var price = Number(lot.price);
          var line = document.createElement("div");
          line.className = "llv-cost-line";
          line.textContent = isFinite(price) ? ("прибыль " + money(price - cost) + " ₽") : ("себестоимость " + money(cost) + " ₽");
          row.appendChild(line);
        });
      }

      var priceInput = document.querySelector("input[name='price'], input[name*='price']");
      var priceForm = priceInput && priceInput.closest && priceInput.closest("form");
      if (priceForm && root.LLVLots && root.LLVLots.isPurchaseForm(priceForm)) priceInput = null;
      if (settings.exactOn !== false && priceInput && !(priceInput.closest && priceInput.closest("#llv-shift-root")) && !document.querySelector(".llv-exact")) {
        var exact = document.createElement("div");
        exact.className = "llv-exact";
        exact.innerHTML = '<label>Для продавца <input class="llv-seller" inputmode="decimal" /></label><label>Для покупателя <input class="llv-buyer" inputmode="decimal" /></label>';
        priceInput.parentNode.insertBefore(exact, priceInput);
        var seller = exact.querySelector(".llv-seller");
        var buyer = exact.querySelector(".llv-buyer");
        seller.value = priceInput.value || "";
        function syncBuyer() {
          var value = Number(String(seller.value).replace(",", "."));
          buyer.value = rate && isFinite(value) ? money(value / (1 - rate / 100)) : seller.value;
        }
        syncBuyer();
        seller.addEventListener("input", function () {
          priceInput.value = seller.value;
          priceInput.dispatchEvent(new Event("input", { bubbles: true }));
          syncBuyer();
        });
        buyer.addEventListener("input", function () {
          var value = Number(String(buyer.value).replace(",", "."));
          if (!isFinite(value)) return;
          seller.value = rate ? money(value * (1 - rate / 100)) : buyer.value;
          priceInput.value = seller.value;
          priceInput.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }

      var area = chatArea();
      if (area && !area.dataset.llvChat) {
        area.dataset.llvChat = "1";
        var emoji = document.createElement("button");
        emoji.type = "button";
        emoji.className = "llv-emoji";
        emoji.textContent = "Эмодзи";
        emoji.addEventListener("click", function (event) {
          event.preventDefault();
          var pop = document.querySelector(".llv-emoji-pop");
          if (pop) { pop.remove(); return; }
          pop = document.createElement("div");
          pop.className = "llv-emoji-pop";
          EMOJI.forEach(function (symbol) {
            var item = document.createElement("button");
            item.type = "button";
            item.textContent = symbol;
            item.addEventListener("click", function () { insertAt(area, symbol); pop.remove(); });
            pop.appendChild(item);
          });
          emoji.parentNode.insertBefore(pop, emoji.nextSibling);
        });
        area.parentNode.insertBefore(emoji, area);
        area.addEventListener("keyup", function () {
          var old = document.querySelector(".llv-quick-pop");
          if (old) old.remove();
          if (area.value.charAt(0) !== "/" || !settings.quick.length) return;
          var pop = document.createElement("div");
          pop.className = "llv-quick-pop";
          var query = area.value.slice(1).toLowerCase();
          settings.quick.filter(function (item) {
            return !query || item.title.toLowerCase().indexOf(query) !== -1;
          }).forEach(function (item) {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = item.title;
            button.addEventListener("click", function () {
              area.value = "";
              insertAt(area, item.text);
              pop.remove();
            });
            pop.appendChild(button);
          });
          if (pop.childElementCount) area.parentNode.insertBefore(pop, area);
          else pop.remove();
        });
      }

      var orderId = currentOrderId();
      if (orderId && !document.querySelector(".llv-copy-order")) {
        var copy = document.createElement("button");
        copy.type = "button";
        copy.className = "llv-copy-order";
        copy.textContent = "Скопировать номер";
        copy.addEventListener("click", function () { copyText(orderId); });
        var heading = document.querySelector("h1") || document.body;
        heading.appendChild(copy);
      }

      var chat = chatArea();
      if (chat && settings.welcomeOn && settings.welcome && once("welcome:" + location.pathname)) insertAt(chat, settings.welcome);
      if (chat && settings.thanksOn && settings.thanks && /подтвержд/i.test(document.body.innerText) && once("thanks:" + location.pathname)) {
        insertAt(chat, settings.thanks);
      }
    }

    function watchKeywords() {
      if (!settings.keywordsOn || !settings.keywords.length) return;
      var chat = chatArea();
      if (!chat) return;
      var host = chat.closest("form") ? chat.closest("form").parentNode : document.body;
      if (!host || host.dataset.llvKeys) return;
      host.dataset.llvKeys = "1";
      var observer = new MutationObserver(function () {
        var blocks = host.querySelectorAll(".chat-msg, .chat-message, .message");
        var last = blocks.length ? (blocks[blocks.length - 1].innerText || "") : "";
        if (!last) return;
        settings.keywords.forEach(function (rule) {
          if (!rule.word || !rule.text || last.trim() === rule.text.trim()) return;
          if (last.toLowerCase().indexOf(rule.word.toLowerCase()) === -1) return;
          if (!once("kw:" + rule.word + ":" + last.slice(0, 80))) return;
          insertAt(chat, rule.text);
        });
      });
      observer.observe(host, { childList: true, subtree: true });
    }

    function field(label, value, onInput) {
      var wrap = document.createElement("label");
      wrap.className = "llv-field";
      var span = document.createElement("span");
      span.textContent = label;
      var input = document.createElement("input");
      input.value = value == null ? "" : value;
      input.addEventListener("input", function () { onInput(input.value); });
      wrap.appendChild(span);
      wrap.appendChild(input);
      return wrap;
    }

    function check(label, checked, onChange) {
      var wrap = document.createElement("label");
      wrap.className = "llv-check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!checked;
      input.addEventListener("change", function () { onChange(input.checked); });
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(label));
      return wrap;
    }

    function button(label, onClick) {
      var node = document.createElement("button");
      node.type = "button";
      node.className = "llv-cmd";
      node.textContent = label;
      node.addEventListener("click", onClick);
      return node;
    }

    function readFile(file, limit, done) {
      if (!file) return;
      if (file.size > limit) { toast("Файл больше допустимого"); return; }
      var reader = new FileReader();
      reader.onload = function () { done(String(reader.result || "")); };
      reader.readAsDataURL(file);
    }

    function paintMore() {
      if (!more) return;
      more.innerHTML = "";
      var offers = document.createElement("section");
      offers.innerHTML = "<p class='llv-kicker'>Предложения</p>";
      offers.appendChild(check("Автоподнятие предложений", settings.autoRaise, function (on) {
        settings.autoRaise = on;
        storageSet();
        armRaise();
      }));
      offers.appendChild(field("Интервал, минут", settings.raiseMinutes, function (value) {
        settings.raiseMinutes = value;
        storageSet();
        armRaise();
      }));
      offers.appendChild(check("Тихие часы", settings.quietOn, function (on) {
        settings.quietOn = on;
        quietNoted = false;
        storageSet();
        armRaise();
      }));
      offers.appendChild(field("С часа", settings.quietFrom, function (value) {
        settings.quietFrom = value;
        quietNoted = false;
        storageSet();
      }));
      offers.appendChild(field("До часа", settings.quietTo, function (value) {
        settings.quietTo = value;
        quietNoted = false;
        storageSet();
      }));
      offers.appendChild(check("Уведомление о поднятии", settings.raiseNotice, function (on) {
        settings.raiseNotice = on;
        storageSet();
      }));
      offers.appendChild(check("Подсветка своих лотов", settings.highlight, function (on) {
        settings.highlight = on;
        storageSet();
        paintPage();
      }));
      offers.appendChild(check("Значки промо-лотов", settings.promo, function (on) {
        settings.promo = on;
        storageSet();
        paintPage();
      }));
      offers.appendChild(field("Комиссия раздела, %", settings.commission, function (value) {
        settings.commission = value;
        storageSet();
        paintPage();
      }));
      offers.appendChild(check("Реальная цена", settings.realPrice, function (on) {
        settings.realPrice = on;
        storageSet();
        paintPage();
      }));
      var lots = root.LLVLots ? root.LLVLots.collectLots(document).lots : [];
      if (lots.length) {
        var select = document.createElement("select");
        select.className = "llv-select";
        lots.forEach(function (lot) {
          var option = document.createElement("option");
          option.value = lot.id;
          option.textContent = lot.title || lot.id;
          select.appendChild(option);
        });
        var cost = field("Себестоимость выбранного лота", settings.costs[select.value] || "", function (value) {
          settings.costs[select.value] = value;
          storageSet();
          paintPage();
        });
        select.addEventListener("change", function () { cost.querySelector("input").value = settings.costs[select.value] || ""; });
        offers.appendChild(select);
        offers.appendChild(cost);
      }
      offers.appendChild(button("Таблица лотов", function () {
        var lines = ["\uFEFFtitle,price"];
        lots.forEach(function (lot) {
          lines.push('"' + String(lot.title || "").replace(/"/g, '""') + '",' + (lot.price || ""));
        });
        download("lots.csv", lines.join("\n"), "text/csv");
      }));
      more.appendChild(offers);

      var messages = document.createElement("section");
      messages.innerHTML = "<p class='llv-kicker'>Сообщения</p>";
      messages.appendChild(check("Отправлять шаблон самой", settings.autoSend, function (on) {
        settings.autoSend = on;
        storageSet();
      }));
      messages.appendChild(check("Приветственное сообщение", settings.welcomeOn, function (on) {
        settings.welcomeOn = on;
        storageSet();
      }));
      messages.appendChild(field("Текст приветствия", settings.welcome, function (value) {
        settings.welcome = value;
        storageSet();
      }));
      messages.appendChild(check("Автоответ по слову", settings.keywordsOn, function (on) {
        settings.keywordsOn = on;
        storageSet();
        watchKeywords();
      }));
      messages.appendChild(field("Слово", (settings.keywords[0] && settings.keywords[0].word) || "", function (value) {
        settings.keywords[0] = settings.keywords[0] || { word: "", text: "" };
        settings.keywords[0].word = value;
        storageSet();
      }));
      messages.appendChild(field("Ответ на слово", (settings.keywords[0] && settings.keywords[0].text) || "", function (value) {
        settings.keywords[0] = settings.keywords[0] || { word: "", text: "" };
        settings.keywords[0].text = value;
        storageSet();
      }));
      messages.appendChild(check("Сообщение после подтверждения", settings.thanksOn, function (on) {
        settings.thanksOn = on;
        storageSet();
      }));
      messages.appendChild(field("Текст после подтверждения", settings.thanks, function (value) {
        settings.thanks = value;
        storageSet();
      }));
      messages.appendChild(field("Быстрое сообщение: имя", "", function (value) { messages.dataset.quickName = value; }));
      messages.appendChild(field("Быстрое сообщение: текст", "", function (value) { messages.dataset.quickText = value; }));
      messages.appendChild(button("Сохранить быстрое сообщение", function () {
        var title = messages.dataset.quickName || "";
        var text = messages.dataset.quickText || "";
        if (!title || !text) { toast("Нужны имя и текст"); return; }
        settings.quick.push({ title: title, text: text });
        storageSet();
        toast("Сохранено. В чате начните с /");
      }));
      ["1", "2", "3", "4", "5"].forEach(function (star) {
        messages.appendChild(field("Отзыв " + star, settings.reviews[star] || "", function (value) {
          settings.reviews[star] = value;
          storageSet();
        }));
      });
      messages.appendChild(button("Ответить по шаблону", function () {
        var form = null;
        document.querySelectorAll("form").forEach(function (item) {
          if (form || (item.closest && item.closest("#llv-shift-root"))) return;
          if (/отзыв/i.test(item.innerText || "") && item.querySelector("textarea")) form = item;
        });
        if (!form) { toast("На странице нет ответа на отзыв"); return; }
        var stars = (document.body.innerText.match(/([1-5])\s*(?:из\s*5|звезд)/i) || [])[1] || "5";
        var text = settings.reviews[stars] || "";
        if (!text) { toast("Нет шаблона для оценки " + stars); return; }
        insertAt(form.querySelector("textarea"), text);
      }));
      more.appendChild(messages);

      var orders = document.createElement("section");
      orders.innerHTML = "<p class='llv-kicker'>Заказы</p>";
      var rows = orderLinks();
      var sum = 0;
      var paid = [];
      rows.forEach(function (row) {
        if (row.amount !== null) sum += row.amount;
        if (row.paid) paid.push(row.id);
      });
      var note = document.createElement("p");
      note.className = "llv-note";
      note.textContent = "На экране: " + rows.length + " заказов, " + money(sum) + " ₽. Неподтверждённых: " + paid.length;
      orders.appendChild(note);
      orders.appendChild(button("Экспорт продаж", function () {
        download("orders.json", JSON.stringify(rows, null, 2), "application/json");
      }));
      orders.appendChild(button("Скопировать неподтверждённые", function () {
        if (!paid.length) { toast("Неподтверждённых на экране нет"); return; }
        copyText(paid.join("\n"));
      }));
      orders.appendChild(button("График по дням", function () {
        var days = {};
        rows.forEach(function (row) {
          var sold = root.LLVParser && root.LLVParser.parseSoldAt(row.text, new Date());
          var key = sold ? sold.toISOString().slice(0, 10) : "без даты";
          days[key] = (days[key] || 0) + (row.amount || 0);
        });
        var keys = Object.keys(days);
        var max = Math.max.apply(null, keys.map(function (key) { return days[key]; }).concat([1]));
        var chart = document.createElement("div");
        chart.className = "llv-chart";
        if (!keys.length) chart.textContent = "На экране нет сумм";
        keys.forEach(function (key) {
          var line = document.createElement("div");
          var bar = document.createElement("span");
          bar.style.width = Math.max(8, Math.round(days[key] / max * 160)) + "px";
          line.appendChild(bar);
          line.appendChild(document.createTextNode(" " + key + " · " + money(days[key]) + " ₽"));
          chart.appendChild(line);
        });
        var old = orders.querySelector(".llv-chart");
        if (old) old.remove();
        orders.appendChild(chart);
      }));
      orders.appendChild(button("Текст для поддержки", function () {
        var id = currentOrderId() || paid[0] || "";
        if (!id) { toast("Нет номера заказа"); return; }
        copyText("Прошу подтвердить выполнение заказа #" + id);
      }));
      orders.appendChild(button("Экспорт операций", function () {
        var table = document.querySelector("table");
        if (!table || !/balance|финанс|баланс/i.test(location.pathname + " " + document.body.innerText.slice(0, 400))) {
          toast("Откройте страницу баланса");
          return;
        }
        var lines = [];
        table.querySelectorAll("tr").forEach(function (row) {
          lines.push(Array.prototype.map.call(row.cells, function (cell) { return (cell.innerText || "").trim(); }));
        });
        download("balance.json", JSON.stringify(lines, null, 2), "application/json");
      }));
      more.appendChild(orders);

      var look = document.createElement("section");
      look.innerHTML = "<p class='llv-kicker'>Вид</p>";
      look.appendChild(check("Скрыть баланс", settings.hideBalance, function (on) {
        settings.hideBalance = on;
        storageSet();
        paintPage();
      }));
      look.appendChild(check("Режим приватности", settings.privacy, function (on) {
        settings.privacy = on;
        storageSet();
        paintPage();
      }));
      look.appendChild(check("Тёмная тема", settings.dark, function (on) {
        settings.dark = on;
        storageSet();
        paintPage();
      }));
      var background = document.createElement("input");
      background.type = "file";
      background.accept = "image/*";
      background.addEventListener("change", function () {
        readFile(background.files[0], 700000, function (url) {
          settings.background = url;
          storageSet();
          paintPage();
        });
      });
      look.appendChild(background);
      look.appendChild(button("Убрать фон", function () {
        settings.background = "";
        storageSet();
        document.body.style.backgroundImage = "";
      }));
      var sound = document.createElement("input");
      sound.type = "file";
      sound.accept = "audio/*";
      sound.addEventListener("change", function () {
        readFile(sound.files[0], 400000, function (url) {
          settings.sound = url;
          storageSet();
          toast("Звук нового заказа сохранён");
        });
      });
      look.appendChild(sound);
      look.appendChild(button("Проверить звук", function () {
        if (!settings.sound) { toast("Сначала выберите звук"); return; }
        new Audio(settings.sound).play().catch(function () { toast("Браузер не дал проиграть звук"); });
      }));
      more.appendChild(look);
    }

    if (booted) return;
    booted = true;

    if (root.chrome && root.chrome.storage && root.chrome.storage.onChanged) {
      root.chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes[KEY]) return;
        settings = Object.assign(defaults(), changes[KEY].newValue || {});
        settings.reviews = Object.assign(defaults().reviews, settings.reviews || {});
        settings.costs = settings.costs || {};
        settings.quick = settings.quick || [];
        settings.keywords = settings.keywords || [];
        armRaise();
        paintPage();
        watchKeywords();
      });
    }

    document.addEventListener("llv-raised", function () {
      if (settings.raiseNotice) toast("Раздел: поднято");
    });
    document.addEventListener("llv-sale", function () {
      if (!settings.sound) return;
      new Audio(settings.sound).play().catch(function () {});
    });

    storageGet(function (stored) {
      settings = stored;
      settings.reviews = Object.assign(defaults().reviews, settings.reviews || {});
      settings.costs = settings.costs || {};
      settings.quick = settings.quick || [];
      settings.keywords = settings.keywords || [];
      armRaise();
      paintPage();
      watchKeywords();
      setInterval(paintPage, 4000);
    });
  }

  root.LLVSeller = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
