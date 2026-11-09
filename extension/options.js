const form = document.querySelector('#form');
const status = document.querySelector('#status');
const apiBase = document.querySelector('#apiBase');
const extensionKey = document.querySelector('#extensionKey');
const workerName = document.querySelector('#workerName');

chrome.storage.local.get(['apiBase', 'extensionKey', 'workerName']).then((stored) => {
  apiBase.value = stored.apiBase || '';
  extensionKey.value = stored.extensionKey || '';
  workerName.value = stored.workerName || '';
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
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    status.textContent = 'Без доступа к этому адресу смена не отправится';
    return;
  }
  const name = workerName.value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) {
    status.textContent = 'Имя — от 2 символов';
    return;
  }
  await chrome.storage.local.set({
    apiBase: origin,
    extensionKey: extensionKey.value,
    workerName: name,
  });
  status.textContent = 'Сохранено';
});
