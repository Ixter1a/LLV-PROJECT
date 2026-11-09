chrome.storage.local.get(['workerName', 'shift']).then((stored) => {
  const status = document.querySelector('#status');
  if (stored.shift && stored.shift.workerName) {
    status.textContent = `${stored.shift.workerName} на смене`;
    return;
  }
  if (stored.workerName) {
    status.textContent = `${stored.workerName} не на смене. Откройте FunPay.`;
    return;
  }
  status.textContent = 'Откройте настройки и впишите имя.';
});
