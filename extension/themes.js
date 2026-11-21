(function (root) {
  var WALLS = [
    { id: "none", name: "Без фона" },
    { id: "w-aurora", name: "Аврора", css: "radial-gradient(1200px 600px at 10% 0%, #1b3a5c 0%, transparent 60%), radial-gradient(900px 500px at 90% 20%, #3a1b5c 0%, transparent 55%), linear-gradient(180deg, #070b12, #0b1220)" },
    { id: "w-ember", name: "Угли", css: "radial-gradient(800px 500px at 80% 0%, #5c2410 0%, transparent 60%), radial-gradient(700px 400px at 10% 30%, #3a1c07 0%, transparent 60%), linear-gradient(180deg, #0d0805, #140a06)" },
    { id: "w-moon", name: "Луна", css: "radial-gradient(500px 500px at 85% 8%, rgba(220,220,255,.22) 0%, transparent 60%), linear-gradient(180deg, #05060c, #0d1020)" },
    { id: "w-moss", name: "Мох", css: "radial-gradient(900px 500px at 0% 10%, #1d3a26 0%, transparent 55%), radial-gradient(800px 400px at 100% 40%, #2b3d18 0%, transparent 60%), linear-gradient(180deg, #060b07, #0a110b)" },
    { id: "w-sakura", name: "Сакура", css: "radial-gradient(900px 500px at 20% 0%, #4a2438 0%, transparent 60%), radial-gradient(700px 400px at 90% 30%, #2c1a33 0%, transparent 55%), linear-gradient(180deg, #0b060a, #140a10)" },
    { id: "w-ocean", name: "Океан", css: "radial-gradient(1000px 600px at 50% -20%, #0f4a5c 0%, transparent 60%), linear-gradient(180deg, #03090d, #06121a)" },
    { id: "w-carbon", name: "Карбон", css: "repeating-linear-gradient(45deg, #0b0b0b 0 6px, #111 6px 12px)" },
    { id: "w-grid", name: "Сетка", css: "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px, linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px, #070707" },
    { id: "w-liquid", name: "Жидкое стекло", css: "radial-gradient(600px 400px at 15% 10%, rgba(120,170,255,.75) 0%, transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(255,120,190,.7) 0%, transparent 60%), radial-gradient(600px 400px at 60% 30%, rgba(120,255,200,.55) 0%, transparent 60%), linear-gradient(135deg, #1a1a2e, #16213e)", glass: true },
    { id: "w-sunset", name: "Закат", css: "radial-gradient(900px 500px at 50% 110%, #7a2b12 0%, transparent 60%), radial-gradient(700px 400px at 20% 0%, #3c1d55 0%, transparent 60%), linear-gradient(180deg, #0a0509, #1a0a0d)" },
    { id: "w-forest", name: "Лес", css: "radial-gradient(900px 600px at 30% 100%, #12321c 0%, transparent 60%), radial-gradient(700px 500px at 80% 0%, #1b2b12 0%, transparent 60%), linear-gradient(180deg, #050a06, #0a120c)", animated: true }
  ];

  var THEMES = [
    {
      id: "light", name: "Светлая", accent: "#111111", dark: false,
      vars: {}
    },
    {
      id: "dark", name: "Тёмная", accent: "#ffffff", dark: true,
      vars: { "--llv-bg": "#141414", "--llv-panel": "#1c1c1c", "--llv-panel-2": "#222", "--llv-text": "#f3f3f3", "--llv-muted": "#a3a3a3", "--llv-line": "rgba(255,255,255,.16)", "--llv-field": "#0f0f0f" }
    },
    {
      id: "firewatch", name: "Firewatch", accent: "#e8722f", dark: true,
      vars: { "--llv-bg": "#1a1410", "--llv-panel": "#241a13", "--llv-panel-2": "#2d2017", "--llv-text": "#f6e5d3", "--llv-muted": "#c2a184", "--llv-line": "rgba(232,114,47,.28)", "--llv-field": "#170f0b", "--llv-accent": "#e8722f" }
    },
    {
      id: "redmoon", name: "Red Moon", accent: "#e0364a", dark: true,
      vars: { "--llv-bg": "#150a0d", "--llv-panel": "#1f0d12", "--llv-panel-2": "#281016", "--llv-text": "#fbe9ec", "--llv-muted": "#c99aa3", "--llv-line": "rgba(224,54,74,.3)", "--llv-field": "#11070a", "--llv-accent": "#e0364a" }
    },
    {
      id: "midnight", name: "Полночь", accent: "#5b8cff", dark: true,
      vars: { "--llv-bg": "#080b18", "--llv-panel": "#0e1428", "--llv-panel-2": "#131b33", "--llv-text": "#e6ecff", "--llv-muted": "#93a2c9", "--llv-line": "rgba(91,140,255,.28)", "--llv-field": "#070a14", "--llv-accent": "#5b8cff" }
    },
    {
      id: "graphite", name: "Графит", accent: "#d7d7d7", dark: true,
      vars: { "--llv-bg": "#1b1b1b", "--llv-panel": "#242424", "--llv-panel-2": "#2c2c2c", "--llv-text": "#e9e9e9", "--llv-muted": "#a0a0a0", "--llv-line": "rgba(255,255,255,.14)", "--llv-field": "#161616", "--llv-accent": "#d7d7d7" }
    },
    {
      id: "mint", name: "Мята", accent: "#2fbf8f", dark: true,
      vars: { "--llv-bg": "#08140f", "--llv-panel": "#0c1c16", "--llv-panel-2": "#11241c", "--llv-text": "#e3fbf1", "--llv-muted": "#8fbfaa", "--llv-line": "rgba(47,191,143,.26)", "--llv-field": "#06100c", "--llv-accent": "#2fbf8f" }
    },
    {
      id: "mono", name: "Чёрно-белая", accent: "#000000", dark: false,
      vars: { "--llv-panel": "#ffffff", "--llv-panel-2": "#f2f2f2", "--llv-text": "#000000", "--llv-muted": "#5a5a5a", "--llv-line": "rgba(0,0,0,.2)", "--llv-field": "#fafafa", "--llv-accent": "#000000" }
    }
  ];

  function list() {
    return THEMES.map(function (theme) { return theme.id; });
  }

  function byId(id) {
    for (var i = 0; i < THEMES.length; i += 1) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return THEMES[0];
  }

  function accent(id) {
    return byId(id).accent || "#111111";
  }

  function isDark(id) {
    return !!byId(id).dark;
  }

  function resolve(settings) {
    var id = settings.theme || (settings.dark ? "dark" : "light");
    if (settings.randomTheme) {
      var pool = THEMES.filter(function (theme) { return theme.id !== "light" && theme.id !== "mono"; });
      id = pool[Math.floor(Math.random() * pool.length)].id;
    }
    return byId(id).id;
  }

  function wallById(id) {
    for (var i = 0; i < WALLS.length; i += 1) {
      if (WALLS[i].id === id) return WALLS[i];
    }
    return WALLS[0];
  }

  function paintBackground(settings) {
    var style = document.documentElement.style;
    var id = settings.theme || (settings.dark ? "dark" : "light");
    var bg = settings.background || "";
    var video = settings.backgroundVideo || "";
    style.setProperty("--llv-bg-color", byId(id).vars["--llv-bg"] || (isDark(id) ? "#141414" : "#f7f7f7"));
    if (video) {
      ensureVideo(video);
      document.documentElement.classList.add("llv-has-video");
      style.setProperty("--llv-wall", "none");
    } else {
      removeVideo();
      document.documentElement.classList.remove("llv-has-video");
      if (bg && bg.indexOf("wall:") === 0) {
        var wall = wallById(bg.slice(5));
        style.setProperty("--llv-wall", wall.css || "none");
        document.documentElement.classList.toggle("llv-glass", !!(settings.glass || wall.glass));
        document.documentElement.classList.toggle("llv-wall-animated", !!wall.animated);
      } else if (bg && /^(data:|https?:)/.test(bg)) {
        style.setProperty("--llv-wall", "url(\"" + bg.replace(/"/g, "%22") + "\")");
        document.documentElement.classList.toggle("llv-glass", !!settings.glass);
        document.documentElement.classList.remove("llv-wall-animated");
      } else {
        style.setProperty("--llv-wall", "none");
        document.documentElement.classList.toggle("llv-glass", !!settings.glass);
        document.documentElement.classList.remove("llv-wall-animated");
      }
    }
  }

  function ensureVideo(src) {
    var host = document.body;
    if (!host) return;
    var node = document.getElementById("llv-wall-video");
    if (!node) {
      node = document.createElement("video");
      node.id = "llv-wall-video";
      node.muted = true;
      node.loop = true;
      node.autoplay = true;
      node.playsInline = true;
      node.setAttribute("aria-hidden", "true");
      host.insertBefore(node, host.firstChild);
    }
    if (node.getAttribute("src") !== src) node.setAttribute("src", src);
    var playing = node.play();
    if (playing && playing.catch) playing.catch(function () { /* автоплей может быть запрещён без звука-разрешения */ });
  }

  function removeVideo() {
    var node = document.getElementById("llv-wall-video");
    if (node) node.remove();
  }

  function resolveWallFor(image) {
    var best = WALLS[1];
    var pool = WALLS.filter(function (wall) { return wall.id !== "none" && !wall.animated; });
    for (var i = 0; i < pool.length; i += 1) {
      if (pool[i].name.toLowerCase().slice(0, 3) === String(image || "").slice(0, 3)) best = pool[i];
    }
    return pool[Math.floor(Math.random() * pool.length)] || best;
  }

  function colorFromImage(dataUrl, done) {
    var image = new Image();
    image.onload = function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        var context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 24, 24);
        var data = context.getImageData(0, 0, 24, 24).data;
        var r = 0, g = 0, b = 0, count = 0;
        for (var i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count += 1;
        }
        if (!count) { done(null); return; }
        done({ r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) });
      } catch (error) {
        done(null);
      }
    };
    image.onerror = function () { done(null); };
    image.src = dataUrl;
  }

  root.LLVThemes = {
    list: list,
    walls: function () { return WALLS.slice(); },
    byId: byId,
    accent: accent,
    isDark: isDark,
    resolve: resolve,
    resolveWallFor: resolveWallFor,
    colorFromImage: colorFromImage,
    paintBackground: paintBackground
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
