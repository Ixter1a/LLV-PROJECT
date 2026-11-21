(function (root) {
  var GLOSSARY = [
    ["Скины", "Skins"],
    ["Скин", "Skin"],
    ["Игровая валюта", "In-game currency"],
    ["Валюта", "Currency"],
    ["Монеты", "Coins"],
    ["Ключи", "Keys"],
    ["Ключ", "Key"],
    ["Римворд", "Rimworld"],
    ["Набор", "Bundle"],
    ["Аккаунт", "Account"],
    ["Подарочная карта", "Gift card"],
    ["Подарочный сертификат", "Gift voucher"],
    ["Буст", "Boost"],
    ["Буст уровня", "Level boost"],
    ["Прокачка", "Leveling"],
    ["Услуга", "Service"],
    ["Квест", "Quest"],
    ["Помощь", "Help"],
    ["Быстро", "Fast"],
    ["Дешёво", "Cheap"],
    ["Недорого", "Affordable"],
    ["Дёшево", "Cheap"],
    ["Аренда", "Rent"],
    ["Продажа", "Sale"],
    ["Покупка", "Purchase"],
    ["Оригинал", "Genuine"],
    ["Чистый", "Clean"],
    ["Гарантия", "Guarantee"],
    ["Мгновенно", "Instant"],
    ["Онлайн", "Online"],
    ["Пиратский", "Pirated"],
    ["Стильно", "Stylish"],
    ["Качественно", "High quality"],
    ["Быстро и дешево", "Fast and cheap"],
    ["Скайрим", "Skyrim"],
    ["Гта", "GTA"],
    ["Гта 5", "GTA 5"],
    ["Майнкрафт", "Minecraft"],
    ["Роблокс", "Roblox"],
    ["Фортнайт", "Fortnite"],
    ["Кс го", "CS:GO"],
    ["Дота", "Dota"],
    ["Дота 2", "Dota 2"],
    ["Валорант", "Valorant"],
    ["Бравл старс", "Brawl Stars"],
    ["Геншин", "Genshin"],
    ["Геншин Импакт", "Genshin Impact"],
    ["Бравл Пасс", "Brawl Pass"],
    ["Гемы", "Gems"],
    ["Изумруды", "Emeralds"],
    ["Алмазы", "Diamonds"],
    ["Рубли", "Rubles"],
    ["Рублей", "Rubles"],
    ["России", "of Russia"],
    ["Российская", "Russian"],
    ["Россия", "Russia"],
    ["Сша", "USA"],
    ["Европа", "Europe"],
    ["Европейский", "European"],
    ["Турция", "Turkey"],
    ["Турецкий", "Turkish"],
    ["Аргентина", "Argentina"],
    ["Аргентинский", "Argentinian"],
    ["Индия", "India"],
    ["Индийский", "Indian"],
    ["Казахстан", "Kazakhstan"],
    ["Беларусь", "Belarus"],
    ["Украина", "Ukraine"],
    ["Снг", "CIS"],
    ["Друзьями", "friends"],
    ["Друзьям", "friends"],
    ["Друзья", "friends"],
    ["Друг", "friend"],
    ["Семейный", "Family"],
    ["Поделиться", "Share"],
    ["Мгновенная доставка", "Instant delivery"],
    ["Без посредников", "No middlemen"],
    ["Круглосуточно", "Around the clock"],
    ["Работаем 24/7", "We work 24/7"],
    ["Скидка", "Discount"],
    ["Акция", "Promo"],
    ["Цифровой", "Digital"],
    ["Код", "Code"],
    ["Активация", "Activation"],
    ["Стимуляция", "Stimulation"],
    ["Обучение", "Tutorial"],
    ["Повышение", "Increase"],
    ["Навсегда", "Forever"],
    ["Всегда", "Always"],
    ["Очень", "Very"],
    ["Самый", "The most"],
    ["Лучший", "Best"],
    ["Русский", "Russian"],
    ["Английский", "English"],
    ["Игра", "Game"],
    ["Игры", "Games"],
    ["Сервер", "Server"],
    ["Сервера", "servers"],
    ["Версия", "Version"],
    ["Платформа", "Platform"],
    ["Компьютер", "PC"],
    ["Телефон", "Phone"],
    ["Подписка", "Subscription"],
    ["Месяц", "Month"],
    ["Год", "Year"],
    ["Неделя", "Week"],
    ["День", "Day"],
    ["Работа", "Work"],
    ["Гарантия возврата", "Money-back guarantee"]
  ];

  function known(text) {
    var out = String(text || "");
    GLOSSARY.forEach(function (pair) {
      var re = new RegExp(pair[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, pair[1]);
    });
    return out;
  }

  function latin(text) {
    return String(text || "").replace(/[^A-Za-z0-9 :,.!?+\-/%()&]/g, "").replace(/\s{2,}/g, " ").trim();
  }

  function translateLocally(text) {
    var knownText = known(text);
    var cleaned = latin(knownText) || latin(String(text || "").replace(/[^\x00-\x7F]/g, " "));
    return cleaned.replace(/\s+/g, " ").trim();
  }

  function translateOnline(text, config) {
    var base = String(config.tranBase || "https://libretranslate.com").replace(/\/+$/, "");
    var body = { q: text, source: "ru", target: "en", format: "text" };
    if (config.tranKey) body.api_key = config.tranKey;
    return fetch(base + "/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) throw new Error("Переводчик ответил " + response.status);
      return response.json();
    }).then(function (data) {
      return data && data.translatedText ? String(data.translatedText) : "";
    });
  }

  function english(value, config) {
    var clean = String(value || "");
    var local = translateLocally(clean);
    if (!config || !config.tranBase) return Promise.resolve(local);
    return translateOnline(clean, config).catch(function () {
      return local;
    }).then(function (result) {
      return result || local;
    });
  }

  function fill(scope) {
    return english(root.LLV.visibleText(scope), root.LLV.current());
  }

  root.LLVTranslate = {
    english: english,
    translateLocally: translateLocally,
    glossarySize: GLOSSARY.length
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
