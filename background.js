const CONFIG = {
  STORAGE_KEYS: {
    AUTO_CONFIRM: 'autoConfirmEnabled',
    AUTO_EXPAND_TOOL_CALLS: 'autoExpandToolCalls',
    AUTO_EXPAND_INPUTS: 'autoExpandInputs',
    AUTO_EXPAND_OUTPUTS: 'autoExpandOutputs'
  },
  ICONS: { ON: 'icon_on.png', OFF: 'icon_off.png' }
};
function log(...args) { /* console.log('🔧 [Background]', ...args); */ }
function updateIcon(isEnabled) { const path = isEnabled ? CONFIG.ICONS.ON : CONFIG.ICONS.OFF; chrome.action.setIcon({ path }); log('🎨 Icon:', path); }
function getActiveTabId(callback) { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { callback(tabs[0]?.id || null); }); }
function setDefault(key, defaultValue) { chrome.storage.local.get(key, (result) => { if (result[key] === undefined) chrome.storage.local.set({ [key]: defaultValue }); }); }
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('📨 Message:', message);
    if (message.action === 'toggleAutoConfirm') {
        const newValue = message.isEnabled;
        chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.AUTO_CONFIRM]: newValue }, () => {
            updateIcon(newValue);
            getActiveTabId((tabId) => { if (tabId) chrome.tabs.sendMessage(tabId, { action: 'stateChanged', enabled: newValue }).catch(() => { chrome.tabs.reload(tabId); }); });
        });
    }
});
chrome.runtime.onInstalled.addListener((details) => {
  log('📦 Installed:', details.reason);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_TOOL_CALLS, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_INPUTS, false);
  setDefault(CONFIG.STORAGE_KEYS.AUTO_EXPAND_OUTPUTS, false);
});
chrome.tabs.onActivated.addListener(() => { chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => { updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false); }); });
chrome.windows.onFocusChanged.addListener(() => { chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => { updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false); }); });
chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTO_CONFIRM, (result) => { updateIcon(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false); });