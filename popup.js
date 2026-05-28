const SETTINGS = {
  toggleAutoConfirm: 'autoConfirmEnabled',
  toggleExpandToolCalls: 'autoExpandToolCalls',
  toggleExpandInputs: 'autoExpandInputs',
  toggleExpandOutputs: 'autoExpandOutputs'
};

function initToggle(inputId, storageKey) {
  const input = document.getElementById(inputId);
  input.addEventListener('change', (e) => {
    const value = e.target.checked;
    chrome.storage.local.set({ [storageKey]: value });
    if (storageKey === 'autoConfirmEnabled') {
      chrome.runtime.sendMessage({ action: 'toggleAutoConfirm', isEnabled: value });
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(Object.values(SETTINGS), (result) => {
    for (const [inputId, storageKey] of Object.entries(SETTINGS)) {
      const value = result[storageKey] || false;
      document.getElementById(inputId).checked = value;
    }
  });

  for (const [inputId, storageKey] of Object.entries(SETTINGS)) {
    initToggle(inputId, storageKey);
  }
});