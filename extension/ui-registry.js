(function (root) {
  var ICONS = {
    labs: "lab",
    lots: "lot",
    palette: "drop",
    sliders: "slider",
    bell: "bell",
    wallet: "wallet",
    cash: "cash"
  };

  var SECTIONS = [
    {
      id: "offers",
      name: "Предложения",
      icon: "labs",
      hint: "15 функций",
      tone: "#2fbf8f",
      cards: [
        {
          key: "autoRaise",
          title: "Автоподнятие предложений",
          text: "Поднимает все ваши лоты в каждом открытом разделе, даже если вкладка свёрнута. Браузер должен быть запущен.",
          fields: [
            { key: "raiseMinutes", label: "Интервал, минут (не меньше 5)", kind: "number", parse: function (value) { return Math.max(5, Number(String(value).replace(",", ".")) || 30); } }
          ],
          toggles: [
            { key: "quietOn", label: "Тихие часы" }
          ],
          fields2: [
            { key: "quietFrom", label: "С часа", kind: "number", half: true },
            { key: "quietTo", label: "До часа", kind: "number", half: true }
          ]
        },
        {
          key: "raiseNotice",
          title: "Уведомления о поднятии",
          text: "Показывать уведомление при каждом успешном поднятии: и для кнопки «Поднять все», и для автоподнятия."
        },
        {
          key: "widget:promo",
          title: "Отображать значки промо-лотов",
          text: "Показывает все значки промо-лотов в таблице предложений, даже если FunPay их скрывает.",
          widget: "promo",
          emulate: "promo"
        },
        {
          key: "widget:highlight",
          title: "Подсветка своих лотов",
          text: "В общей таблице раздела ваши лоты выделены цветом, их сразу видно среди чужих.",
          widget: "highlight",
          emulate: "highlight"
        },
        {
          key: "exactOn",
          title: "Точная цена",
          text: "В окне редактирования лота появляются поля для ввода цены как для продавца, так и для покупателя.",
          on: true,
          fields: [
            { key: "commission", label: "Комиссия, %", hint: "Например, 10" }
          ]
        },
        {
          key: "showCard",
          title: "Панель управления лотами в профиле",
          text: "На профилях FunPay показывает панель «Управление лотами»: поиск, клонирование, поднять все, экспорт и импорт.",
          on: true
        },
        {
          key: null,
          title: "Перевод лота на английский",
          text: "На странице редактирования лота появляется кнопка «Перевести на английский»: заполняет английское название и описание по русскому.",
          fields: [
            { key: "tranBase", label: "Сервис перевода", hint: "https://libretranslate.com" },
            { key: "tranKey", label: "Ключ сервиса", kind: "password" }
          ]
        },
        {
          key: "realPrice",
          title: "Реальные цены лотов",
          text: "Под ценой лота показывает, сколько вы фактически получите на руки без комиссии FunPay и платёжных систем.",
          on: true
        },
        {
          key: null,
          title: "Массовое редактирование лотов",
          text: "Кнопка «Выбрать лоты»: включить, выключить, изменить цену, клонировать или удалить сразу несколько лотов.",
          note: "Работает через панель «Управление лотами» и раздел «Лоты» в карточке."
        },
        {
          key: null,
          title: "Заполнение лота нейросетью",
          text: "Кнопка «Написать текст лота»: нейросеть пишет название, описание и сообщение после оплаты по данным лота.",
          fields: [
            {
              key: "aiBase",
              label: "Сервис",
              kind: "select",
              options: [
                ["https://api.openai.com/v1", "OpenAI"],
                ["https://openrouter.ai/api/v1", "OpenRouter"],
                ["https://api.deepseek.com/v1", "DeepSeek"],
                ["http://127.0.0.1:1234/v1", "Локальный (LM Studio)"],
                ["http://localhost:11434/v1", "Локальный (Ollama)"]
              ]
            },
            { key: "aiModel", label: "Модель", hint: "gpt-4o-mini" },
            { key: "aiKey", label: "Ключ API", kind: "password", hint: "Ключ хранится только в браузере" }
          ]
        },
        {
          key: null,
          title: "Комиссия раздела",
          text: "Показывает процент комиссии FunPay для раздела рядом с заголовком на странице ваших предложений.",
          note: "Процент берётся из поля «Комиссия, %» выше."
        },
        {
          key: null,
          title: "Себестоимость лотов",
          text: "Поле себестоимости на странице редактирования лота и чистая прибыль. Себестоимость попадает в экспорт заказов.",
          widget: "costs"
        },
        {
          key: null,
          title: "Экспорт лотов",
          text: "Ваши лоты и валютные разделы сохраняются в один файл JSON или Excel (CSV открывается в Excel).",
          buttons: [
            { label: "Экспорт JSON", run: "lotsJson" },
            { label: "Экспорт Excel (CSV)", run: "lotsCsv" }
          ]
        },
        {
          key: null,
          title: "Импорт лотов",
          text: "Создаёт лоты из ранее сохранённого файла. Существующие лоты не меняются: создаются только новые.",
          picker: { label: "Файл лотов", accept: "application/json,.json,.csv", run: "importLots" }
        },
        {
          key: null,
          title: "Клонирование лотов",
          text: "Кнопка «Клонировать лот» на странице чужого лота, а на чужом профиле — клонирование нескольких лотов сразу.",
          note: "Переносятся описание, параметры, цена и картинки, когда форма FunPay это позволяет."
        }
      ]
    },
    {
      id: "messages",
      name: "Сообщения",
      icon: "chat",
      hint: "5 функций",
      tone: "#5b8cff",
      cards: [
        {
          key: "widget:emoji",
          title: "Панель эмодзи",
          text: "Под полем сообщения в чате появляется кнопка «Эмодзи» с набором символов.",
          widget: "widgetToggle",
          spec: { key: "emoji", label: "Панель под полем сообщения", on: true }
        },
        {
          key: null,
          title: "Быстрые сообщения",
          text: "Напишите / в чате, чтобы быстро отправить заранее подготовленные сообщения.",
          widget: "quick",
          toggles: [
            { key: "autoSend", label: "Отправлять шаблон самой", note: "Если включено, шаблон из меню «/» сразу уходит в чат." }
          ]
        },
        {
          key: "welcomeOn",
          title: "Приветственное сообщение",
          text: "Отправляет сообщение покупателю, который написал вам впервые или снова — по истечении таймаута.",
          fields: [
            { key: "welcome", label: "Текст приветствия", kind: "area" },
            { key: "welcomeTimeout", label: "Таймаут, часов", kind: "number", parse: function (value) { return Number(value) || 24; }, def: 24 }
          ]
        },
        {
          key: "keywordsOn",
          title: "Автоответ по ключевым словам",
          text: "Отправляет ответ, когда сообщение покупателя точно совпадает с командой или содержит слово либо фразу.",
          widget: "keywords"
        },
        {
          key: "thanksOn",
          title: "Автоответ после подтверждения заказа",
          text: "Отправляет сообщение сразу после того, как покупатель подтвердил выполнение заказа.",
          fields: [
            { key: "thanks", label: "Текст", kind: "area" }
          ]
        }
      ]
    },
    {
      id: "reviews",
      name: "Отзывы",
      icon: "star",
      hint: "2 функции",
      tone: "#e0a13a",
      cards: [
        {
          key: "reviewsAuto",
          title: "Автоответ на отзывы",
          text: "Отправляет заданный ответ на отзыв покупателя — свой текст для каждой оценки от 1 до 5 звёзд.",
          fields: [
            { key: "reviews.5", label: "5 звёзд — текст", kind: "star" },
            { key: "reviews.4", label: "4 звезды — текст", kind: "star" },
            { key: "reviews.3", label: "3 звезды — текст", kind: "star" },
            { key: "reviews.2", label: "2 звезды — текст", kind: "star" },
            { key: "reviews.1", label: "1 звезда — текст", kind: "star" }
          ],
          buttons: [
            { label: "Ответить на открытой странице", run: "reviewPage" }
          ]
        },
        {
          key: "reviewAi",
          title: "ИИ авто-ответ на отзыв покупателя",
          text: "Отвечает текстом, который пишет нейросеть по словам самого покупателя. Если нейросеть недоступна, отправится ваш шаблон.",
          note: "Ключ и модель задаются в «Предложения → Заполнение лота нейросетью»."
        }
      ]
    },
    {
      id: "sales",
      name: "Продажи",
      icon: "cart",
      hint: "6 функций",
      tone: "#f97316",
      cards: [
        {
          key: "salesStats",
          title: "Отображать статистику продаж",
          text: "Детальная статистика на странице Продажи: по дням, по статусам и по категориям.",
          on: true,
          widget: "salesChart"
        },
        {
          key: null,
          title: "Графики продаж и покупок",
          text: "Выручка и заказы по дням, разбивка по категориям, статусам и валютам.",
          buttons: [
            { label: "График по дням", run: "chartDays" },
            { label: "По категориям", run: "chartTitles" }
          ]
        },
        {
          key: "unpaidCopy",
          title: "Копирование номера заказа",
          text: "На странице заказа добавляется иконка копирования — нажмите, чтобы скопировать номер.",
          on: true
        },
        {
          key: null,
          title: "Экспорт продаж",
          text: "JSON или Excel (CSV) с себестоимостью и прибылью по вашим заказам.",
          buttons: [
            { label: "Экспорт JSON", run: "salesJson" },
            { label: "Экспорт Excel (CSV)", run: "salesCsv" }
          ]
        },
        {
          key: "unpaidCopy",
          title: "Копировать ID неподтверждённых продаж",
          text: "Номера заказов, которые оплачены, но ещё не подтверждены.",
          buttons: [
            { label: "Скопировать сейчас", run: "unpaidIds" }
          ]
        },
        {
          key: "salesSupport",
          title: "Заявки в поддержку на подтверждение заказов",
          text: "Если покупатель не подтверждает заказ, отправьте заявку в поддержку FunPay кнопкой на странице заказа.",
          on: true,
          buttons: [
            { label: "Проверить формы на странице", run: "supportForms" }
          ]
        }
      ]
    },
    {
      id: "purchases",
      name: "Покупки",
      icon: "bag",
      hint: "2 функции",
      tone: "#a855f7",
      cards: [
        {
          key: "purchasesStats",
          title: "Отображать статистику покупок",
          text: "Детальная статистика на странице Покупки: сколько заказов, на какую сумму, у кого.",
          on: true,
          widget: "purchasesLine"
        },
        {
          key: "purchasesExport",
          title: "Экспорт покупок",
          text: "Кнопка «Экспорт» на странице Покупки: JSON или Excel (CSV).",
          on: true,
          buttons: [
            { label: "Экспорт JSON", run: "buyJson" },
            { label: "Экспорт Excel (CSV)", run: "buyCsv" }
          ]
        }
      ]
    },
    {
      id: "finance",
      name: "Финансы",
      icon: "wallet",
      hint: "3 функции",
      tone: "#22c55e",
      cards: [
        {
          key: "hideBalance",
          title: "Скрыть отображение баланса",
          text: "Прячет баланс за размытием: можно показывать экран, не открывая суммы в шапке."
        },
        {
          key: "financeStats",
          title: "Статистика финансов",
          text: "На странице баланса показывает поступления, расходы, чистый поток, разбивку по типам и график.",
          on: true,
          widget: "financeLine"
        },
        {
          key: null,
          title: "Экспорт финансов",
          text: "История операций со страницы баланса в Excel или JSON.",
          buttons: [
            { label: "Экспорт JSON", run: "moneyJson" },
            { label: "Экспорт Excel (CSV)", run: "moneyCsv" }
          ]
        }
      ]
    },
    {
      id: "theme",
      name: "Тема",
      icon: "palette",
      hint: "2 функции",
      tone: "#ec4899",
      cards: [
        {
          key: null,
          title: "Выбор темы",
          text: "Восемь наборов цветов: Светлая, Тёмная, Firewatch, Red Moon, Полночь, Графит, Мята и Чёрно-белая.",
          widget: "themeGrid",
          toggles: [
            { key: "randomTheme", label: "Случайная тема под картинку", note: "При каждой загрузке выбирается другой набор." }
          ]
        },
        {
          key: null,
          title: "Фоны и наборы тем",
          text: "Галерея обоев, свои картинки и видео, жидкое стекло.",
          widget: "wallGrid",
          toggles: [
            { key: "glass", label: "Жидкое стекло" }
          ],
          picker: { label: "Своя картинка или видео", accept: "image/*,video/mp4,video/webm", run: "wall" },
          buttons: [
            { label: "Убрать фон", run: "wallNone" }
          ]
        },
        {
          key: "privacy",
          title: "Режим приватности",
          text: "Прячет за размытием ваш ник, ник собеседника, баланс и номера заказов. Наведите курсор, чтобы прочитать."
        }
      ]
    },
    {
      id: "custom",
      name: "Кастомизация",
      icon: "sliders",
      hint: "4 функции",
      tone: "#14b8a6",
      cards: [
        {
          key: null,
          title: "Оформление LLV",
          text: "Карточки, панель лотов и настройки используют цвета выбранной темы.",
          toggles: [
            { key: "showCard", label: "Показывать карточку «Управление лотами»", on: true },
            { key: "highlight", label: "Подсветка своих лотов" }
          ]
        },
        {
          key: null,
          title: "Публичные стили ника",
          text: "Цвет вашего ника на страницах FunPay в этом браузере.",
          fields: [
            { key: "nickColor", label: "Цвет вашего ника", kind: "color" }
          ]
        },
        {
          key: "hideNickStyles",
          title: "Скрывать стили ников",
          text: "Не показывать стили ников других пользователей вне их профилей."
        },
        {
          key: "aboutOn",
          title: "Описание профиля",
          text: "Описание хранится в браузере и показывается рядом с вашим ником на FunPay.",
          fields: [
            { key: "about", label: "Описание", kind: "area" }
          ]
        }
      ]
    },
    {
      id: "notices",
      name: "Уведомления",
      icon: "bell",
      hint: "2 функции",
      tone: "#eab308",
      cards: [
        {
          key: "hideNotificationSound",
          title: "Кастомный звук уведомлений",
          text: "Не заменять звук FunPay и проигрывать свой при новом сообщении в чате.",
          picker: { label: "Звук уведомления", accept: "audio/*", run: "noticeSound" },
          buttons: [
            { label: "Проверить", run: "testNotice" }
          ]
        },
        {
          key: "notifyOrder",
          title: "Свой звук для нового заказа",
          text: "Проигрывает выбранный звук при новом заказе, даже если вкладка FunPay не открыта.",
          on: true,
          picker: { label: "Звук нового заказа", accept: "audio/*", run: "orderSound" },
          buttons: [
            { label: "Проверить", run: "testOrder" }
          ]
        }
      ]
    },
    {
      id: "api",
      name: "API",
      icon: "plug",
      hint: "1 функция",
      tone: "#64748b",
      cards: [
        {
          key: null,
          title: "Авторизация — Golden Key",
          text: "Ключ сессии FunPay даёт полный доступ к аккаунту, поэтому LLV его не читает и никуда не передаёт.",
          note: "Все запросы идут через вашу же вкладку с её куками."
        },
        {
          key: null,
          title: "Внешние сервисы",
          text: "Что LLV вызывает, кроме FunPay.",
          widget: "external"
        }
      ]
    },
    {
      id: "shift",
      name: "Смена",
      icon: "clock",
      hint: "Учёт смен",
      tone: "#3b82f6",
      cards: [
        {
          key: null,
          title: "Смена",
          text: "Имя берётся из шапки FunPay. Если его нет, впишите его здесь.",
          widget: "shift"
        },
        {
          key: null,
          title: "Цель смены",
          text: "Карточка над таблицей лотов показывает штуки, выручку, прибыль 10% и остаток до цели.",
          widget: "goal"
        },
        {
          key: null,
          title: "Подключение",
          text: "URL и anon key Supabase. Очередь уходит после сохранения ключей.",
          widget: "supabase"
        }
      ]
    },
    {
      id: "shop",
      name: "Лоты на странице",
      icon: "tools",
      hint: "Живая FunPay",
      tone: "#0ea5e9",
      live: true,
      cards: [
        {
          key: null,
          title: "Работа на открытой FunPay",
          text: "Эти действия открывают нужную страницу FunPay во второй вкладке и работают там.",
          liveButtons: [
            { label: "Поднять все лоты", run: "raise" },
            { label: "Открыть мои лоты", href: "https://funpay.com/lots/offer" },
            { label: "Открыть продажи", href: "https://funpay.com/orders/trade" },
            { label: "Открыть баланс", href: "https://funpay.com/account/balance" },
            { label: "Открыть чат", href: "https://funpay.com/chat/" }
          ]
        },
        {
          key: null,
          title: "Массовые действия",
          text: "Отметьте лоты галочками, затем включите, выключите, поднимите или удалите их списком.",
          liveButtons: [
            { label: "Массовое редактирование", run: "bulk" },
            { label: "Экспорт лотов со страницы", run: "pageLotsJson" },
            { label: "Экспорт лотов в CSV", run: "pageLotsCsv" }
          ]
        }
      ]
    }
  ];

  function sectionById(id) {
    for (var i = 0; i < SECTIONS.length; i += 1) {
      if (SECTIONS[i].id === id) return SECTIONS[i];
    }
    return SECTIONS[0];
  }

  function cardTotal() {
    var count = 0;
    SECTIONS.forEach(function (section) {
      if (!section.live) count += section.cards.length;
    });
    return count;
  }

  root.LLVRegistry = {
    sections: SECTIONS,
    sectionById: sectionById,
    cards: cardTotal,
    icons: ICONS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
