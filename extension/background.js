importScripts('settings.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'llv-post' || !sender || sender.id !== chrome.runtime.id) return;
  sendToPanel(message).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, code: error.code || '', error: error.message || 'offline' })
  );
  return true;
});

async function sendToPanel(message) {
  const origin = llvOrigin(message.apiBase);
  const token = String(message.token || '').trim();
  const path = String(message.path || '');
  if (!LLV_TOKEN.test(token)) {
    const error = new Error('unauthorized');
    error.code = 'unauthorized';
    throw error;
  }
  if (!path.startsWith('/api/ext/')) {
    const error = new Error('offline');
    error.code = 'bad_path';
    throw error;
  }
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LLV-Token': token,
      },
      body: JSON.stringify(message.body || {}),
    });
  } catch {
    const error = new Error('offline');
    error.code = 'offline';
    throw error;
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'server_error');
    error.code = payload.error || 'server_error';
    throw error;
  }
  return payload;
}
