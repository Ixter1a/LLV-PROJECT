const form = document.querySelector('#form');
const status = document.querySelector('#status');
const apiBase = document.querySelector('#apiBase');
const workerToken = document.querySelector('#workerToken');

chrome.storage.local.get(['apiBase', 'workerToken']).then((stored) => {
  apiBase.value = stored.apiBase || 'https://llv-shifts.apps.grok.bot';
  workerToken.value = stored.workerToken || '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  try {
    await llvSaveConnection(apiBase.value, workerToken.value);
    status.textContent = 'Сохранено';
  } catch (error) {
    status.textContent = error.message || 'Проверьте адрес и ключ';
  }
});
