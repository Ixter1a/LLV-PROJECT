(function (root) {
  function config() {
    return root.LLV ? root.LLV.current() : {};
  }

  function ready() {
    var settings = config();
    return !!(settings.aiKey && settings.aiBase);
  }

  function ask(prompt, system) {
    var settings = config();
    if (!settings.aiKey) return Promise.resolve("");
    var base = String(settings.aiBase || "https://api.openai.com/v1").replace(/\/+$/, "");
    return fetch(base + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.aiKey
      },
      body: JSON.stringify({
        model: settings.aiModel || "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 900,
        messages: [
          { role: "system", content: system || "Ты продавец на FunPay. Пишешь коротко, по-русски, без разметки." },
          { role: "user", content: prompt }
        ]
      })
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).then(function (data) {
      var choice = data && data.choices && data.choices[0];
      return choice && choice.message ? String(choice.message.content || "").trim() : "";
    }).catch(function () {
      return "";
    });
  }

  function review(rating, text, template) {
    var prompt = "Покупатель оставил отзыв на FunPay и поставил оценку " + rating + " из 5. " +
      "Ответь коротко (до 300 символов), вежливо, без воды и списков. " +
      (template ? ("Учти обычный ответ продавца: " + template + ". ") : "") +
      "Текст отзыва: " + (text || "(без текста)");
    return ask(prompt);
  }

  function lot(title, description) {
    var prompt = "Название лота: " + title + "\n\nОписание лота:\n" + String(description || "").slice(0, 1500) +
      "\n\nНапиши более привлекательное название (до 70 символов) и описание (до 800 символов). " +
      "Ответ строго двумя частями: первая строка — название, пустая строка, дальше описание. Без заголовков и разметки.";
    return ask(prompt).then(function (answer) {
      if (!answer) return null;
      var parts = answer.split(/\n\s*\n/);
      var head = parts[0].replace(/^название[:\s]*/i, "").replace(/[#*]/g, "").trim();
      var body = parts.slice(1).join("\n\n").trim();
      return { title: head, description: body || head };
    });
  }

  function reply(message, topic) {
    var prompt = "Покупатель написал на FunPay: " + message +
      (topic ? ("\nКонтекст заказа: " + topic) : "") +
      "\nНапиши короткий ответ продавца (до 300 символов), по-русски, по делу.";
    return ask(prompt);
  }

  root.LLVAi = {
    ready: ready,
    ask: ask,
    review: review,
    lot: lot,
    reply: reply
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
