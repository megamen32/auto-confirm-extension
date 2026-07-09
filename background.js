const CONFIG = {
  STORAGE_KEYS: {
    AUTO_CONFIRM: 'autoConfirmEnabled',
    AUTO_EXPAND_TOOL_CALLS: 'autoExpandToolCalls',
    AUTO_EXPAND_INPUTS: 'autoExpandInputs',
    AUTO_EXPAND_OUTPUTS: 'autoExpandOutputs',
    BACKGROUND_CLICKS: 'backgroundClicksEnabled',
    TAB_TITLE_CHANGES: 'tabTitleChangesEnabled'
  },
  ICONS: { ON: 'icon_on.png', OFF: 'icon_off.png' },
  CDP_VERSION: '1.3'
};

function log(...args) { /* console.log('🔧 [Background]', ...args); */ }

function updateIcon(isEnabled) {
  const path = isEnabled ? CONFIG.ICONS.ON : CONFIG.ICONS.OFF;
  chrome.action.setIcon({ path });
  log('🎨 Icon:', path);
}

function getActiveTabId(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs[0]?.id || null);
  });
}

function setDefault(key, defaultValue) {
  chrome.storage.local.get(key, (result) => {
    if (result[key] === undefined) chrome.storage.local.set({ [key]: defaultValue });
  });
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function attachDebugger(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, CONFIG.CDP_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        const msg = String(err.message || '');
        if (msg.includes('already attached') || msg.includes('Already attached')) {
          resolve({ attachedNow: false });
          return;
        }
        reject(err);
        return;
      }
      resolve({ attachedNow: true });
    });
  });
}

function detachDebugger(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => resolve());
  });
}

function sendCdp(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function dispatchBackgroundClick(tabId, x, y) {
  const target = { tabId };
  const attachResult = await attachDebugger(target);
  try {
    await sendCdp(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      clickCount: 0
    });
    await sendCdp(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await sendCdp(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
  } finally {
    if (attachResult.attachedNow) await detachDebugger(target);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('📨 Message:', message);

  if (message.action === 'toggleAutoConfirm') {
    const newValue = message.isEnabled;
    chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.AUTO_CONFIRM]: newValue }, () => {
      updateIcon(newValue);
      getActiveTabId((tabId) => {
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: 'stateChanged', enabled: newValue }).catch(() => {
            chrome.tabs.reload(tabId);
          });
        }
      });
    });
    return;
  }

  if (message.action === 'backgroundClick') {
    const tabId = sender.tab?.id;
    const x = Number(message.x);
    const y = Number(message.y);

    (async () => {
      if (!tabId || !Number.isFinite(x) || !Number.isFinite(y)) {
        sendResponse({ ok: false, error: 'Missing tabId or click coordinates' });
        return;
      }

      const settings = await getStorage([
        CONFIG.STORAGE_KEYS.AUTO_CONFIRM,
        CONFIG.STORAGE_KEYS.BACKGROUND_CLICKS
      ]);

      if (!settings[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || !settings[CONFIG.STORAGE_KEYS.BACKGROUND_CLICKS]) {
        sendResponse({ ok: false, error: 'Background clicks are disabled' });
        return;
      }

      try {
        await dispatchBackgroundClick(tabId, x, y);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();

    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  log('📦 Installed:', details.reason);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_TOOL_CALLS, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_INPUTS, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_OUTPUTS, false);
  setDefault(CONFIG.STORAGE_KEYS.BACKGROUND_CLICKS, false);
  setDefault(CONFIG.STORAGE_KEYS.TAB_TITLE_CHANGES, false);
});

chrome.tabs.onActivated.addListener(() => {
  chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => {
    updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false);
  });
});

chrome.windows.onFocusChanged.addListener(() => {
  chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => {
    updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false);
  });
});

chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => {
  updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false);
});
