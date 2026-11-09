const LLV_TOKEN = /^llv_[A-Za-z0-9_-]{40,80}$/;

function llvOrigin(value) {
  const url = new URL(String(value || '').trim());
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.username || url.password) throw new Error('Адрес без логина внутри ссылки');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Нужен адрес https://');
  }
  return url.origin;
}

async function llvSaveConnection(apiBase, workerToken) {
  const origin = llvOrigin(apiBase);
  const token = String(workerToken || '').trim();
  if (!LLV_TOKEN.test(token)) {
    throw new Error('Ключ начинается с llv_ и копируется из панели целиком');
  }
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) throw new Error('Без доступа к этому адресу смена не отправится');
  await chrome.storage.local.set({ apiBase: origin, workerToken: token });
  await chrome.storage.local.remove(['extensionKey']);
  return origin;
}
