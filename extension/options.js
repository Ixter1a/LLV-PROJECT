const form = document.querySelector('#form');
const status = document.querySelector('#status');
const apiBase = document.querySelector('#apiBase');
const workerToken = document.querySelector('#workerToken');

chrome.storage.local.get(['apiBase', 'workerToken']).then((stored) => {
  apiBase.value = stored.apiBase || '';
  workerToken.value = stored.workerToken || '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  let origin;
  try {
    const url = new URL(apiBase.value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.username || url.password) throw new Error('Адрес без логина внутри ссылки');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      throw new Error('Нужен адрес https://');
    }
    origin = url.origin;
  } catch (error) {
    status.textContent = error.message || 'Проверьте адрес';
    return;
  }
  const token = workerToken.value.trim();
  if (!/^llv_[A-Za-z0-9_-]{40,80}$/.test(token)) {
    status.textContent = 'Ключ начинается с llv_ и копируется из панели целиком';
    return;
  }
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    status.textContent = 'Без доступа к этому адресу смена не отправится';
    return;
  }
  await chrome.storage.local.set({
    apiBase: origin,
    workerToken: token,
  });
  await chrome.storage.local.remove(['extensionKey']);
  status.textContent = 'Сохранено';
});
