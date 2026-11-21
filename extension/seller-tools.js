(function (root) {
  // Старый модуль продавца. Всё, что он делал (автоподнятие, темы, звуки,
  // автоответы, подсветка, приватность), теперь живёт в отдельных модулях:
  // seller-utils.js, themes.js, chat.js, background-loop.js, page-tools.js.
  // Оставлен как точка входа: карточка в content.js зовёт LLVSeller.attach().
  //
  // Расписание автоподнятия живёт только в service worker (background.js):
  // там chrome.alarms и поднятие в открытой вкладке FunPay. Здесь — лишь
  // разовые действия: разовый подъём, автоответы и звуки на этой странице.

  function start() {
    if (!root.LLV) return;
    root.LLV.load(function (settings) {
      root.LLV.watch();
      if (root.LLV.applyTheme) root.LLV.applyTheme();
      if (root.LLVBackground) root.LLVBackground.loop(settings);
    });
  }

  var started = false;

  function attach() {
    if (started) return;
    started = true;
    if (root.chrome && root.chrome.storage && root.chrome.storage.local) start();
  }

  root.LLVSeller = { attach: attach };
})(typeof globalThis !== "undefined" ? globalThis : this);
