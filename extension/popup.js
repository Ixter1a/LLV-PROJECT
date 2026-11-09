const form = document.querySelector('#form');
const status = document.querySelector('#status');
const shift = document.querySelector('#shift');
const apiBase = document.querySelector('#apiBase');
const workerToken = document.querySelector('#workerToken');

function showShift(stored) {
  if (stored.shift && stored.shift.workerName) {
    shift.textContent = `${stored.shift.workerName} на смене`;
    return;
  }
  shift.textContent = 'Смена не начата. Откройте FunPay.';
}

chrome.storage.local.get(['apiBase', 'workerToken', 'shift', 'workerName']).then((stored) => {
  apiBase.value = stored.apiBase || 'https://llv-shifts.apps.grok.bot';
  workerToken.value = stored.workerToken || '';
  showShift(stored);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.shift) return;
  chrome.storage.local.get(['shift']).then(showShift);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await llvSaveConnection(apiBase.value, workerToken.value);
    status.textContent = 'Сохранено. Обновите страницу FunPay.';
  } catch (error) {
    status.textContent = error.message || 'Проверьте адрес и ключ';
  } finally {
    button.disabled = false;
  }
});
