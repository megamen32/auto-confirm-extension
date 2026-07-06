// ================= CONFIG =================
const CONFIG = {
    DEBUG: false,
    CHECK_INTERVAL: 300,
    EXPAND_POLL_INTERVAL: 10000,
    STORAGE_KEYS: {
        AUTO_CONFIRM: 'autoConfirmEnabled',
        AUTO_EXPAND_TOOL_CALLS: 'autoExpandToolCalls',
        AUTO_EXPAND_INPUTS: 'autoExpandInputs',
        AUTO_EXPAND_OUTPUTS: 'autoExpandOutputs'
    },
    SELECTORS: {
        PRIMARY: 'button.btn-primary',
        DIALOG: '[role="dialog"], [data-radix-dialog-content]',
        BUTTON_GROUP: '.mb-2.flex.items-center.gap-2',
        SECONDARY: '.btn-secondary',
        TEXT_WRAPPER: 'div:not([class*="icon"]):not([class*="sprite"]), span:not([class*="icon"])'
    },
    EXCLUDE_WORDS: ['cancel','отмена','annulliere','cerrar','fermer','annuler','annulla','anular','deny','отклонить','отказ','отказаться','запретить','reject','refuse','decline','disallow','block','блокировать','later','not now','拒绝','拒否','거부'],
    CONFIRM_WORDS: [
        'confirm','podtverdit','potvrdi','confirma','potvrdit','bekræft','bestätigen','confirmer',
        'kinnita','vahvista','megerősít','konfirmi','staðfesta','confermare','patvirtinti',
        'apstiprināt','bekreft','bevestigen','potwierdź','confirmar','confirmă','potvrdiť',
        'potrdi','xaqiiji','konfirmo','bekräfta','thibitisha','kumpirmahin','onayla',
        'xác nhận','sahkan','mengesahkan','подтвердить','потвърди','потврди','підтвердити','разрешить','разрешить один раз',
        'επιβεβαιώστε','تأكيد','يؤكد','تایید','تصدیق کریں','নিশ্চিত করুন','પુષ્ટિ કરો',
        'पुष्टि करें','પુષ્ટિ કરો','ਪੁਸ਼ਟੀ ਕਰੋ','ಸ್ಥಿರೀಕರಿಸಿ','ಸ್ಥിരീകരിക്കുക','స్థిరీకರించು',
        'உறுதிப்படுத்து','အတည်ပြုပါ','ยืนยัน','确认','確認','확인','დაადასტურეთ',
        'հաստատել','растау','баталгаажуулах','አረጋግጥ'
    ].map(w => w.trim().toLowerCase()),
    EXPAND_LABELS: {
        TOOL_CALL: /tool\s*call|tool-call/i,
        INPUTS: /the following was shared|the following is shared|the following was provided|input|inputs/i,
        OUTPUTS: /result:|results:|output|outputs/i
    }
};

const STATE = {
    autoConfirm: false,
    autoExpandToolCalls: false,
    autoExpandInputs: false,
    autoExpandOutputs: false
};

const log = (...args) => CONFIG.DEBUG && console.log('🔍 [AutoConfirm]', ...args);

function normalizeText(str) {
    if (!str) return '';
    return str.trim().toLowerCase().normalize('NFKC').replace(/[​-‍﻿]/g, '');
}

function extractButtonText(btn) {
    const textEl = btn.querySelector(CONFIG.SELECTORS.TEXT_WRAPPER);
    const raw = textEl ? textEl.textContent : btn.textContent;
    return normalizeText(raw);
}

function isExcluded(text) {
    return CONFIG.EXCLUDE_WORDS.some(word => text.includes(word));
}

function isConfirmText(text) {
    return CONFIG.CONFIRM_WORDS.includes(text) && !isExcluded(text);
}

function isButtonValid(btn) {
    return !btn.disabled && !btn.ariaDisabled && btn.offsetParent !== null &&
           !btn.closest('[aria-hidden="true"], [hidden]') && btn.checkVisibility?.() !== false;
}

function findSiblingConfirmButton() {
    const containerSelectors = '[role="dialog"], [data-radix-dialog-content], .mb-2.flex.items-center.gap-2';
    const groups = new Set(document.querySelectorAll(containerSelectors));
    if (groups.size === 0) return null;

    for (const group of groups) {
        const buttons = Array.from(group.querySelectorAll('button, [role="button"]')).filter(isButtonValid);
        if (buttons.length < 2) continue;

        const denyCount = buttons.reduce((n, btn) => n + (isExcluded(extractButtonText(btn)) ? 1 : 0), 0);
        if (denyCount !== 1) continue;

        const confirmBtn = buttons.find(btn => !isExcluded(extractButtonText(btn)));
        if (confirmBtn) {
            log('✅ Found via SIBLING_DENY:', extractButtonText(confirmBtn));
            return confirmBtn;
        }
    }
    return null;
}

function findConfirmButton() {
    const siblingBtn = findSiblingConfirmButton();
    if (siblingBtn) return siblingBtn;

    const candidates = document.querySelectorAll(CONFIG.SELECTORS.PRIMARY);
    for (const btn of candidates) {
        const text = extractButtonText(btn);
        if (isConfirmText(text) && isButtonValid(btn)) {
            log('✅ Found via PRIMARY:', text);
            return btn;
        }
    }

    const dialog = document.querySelector(CONFIG.SELECTORS.DIALOG);
    if (dialog) {
        const dialogButtons = dialog.querySelectorAll('button, [role="button"]');
        for (const btn of dialogButtons) {
            const text = extractButtonText(btn);
            if (isConfirmText(text) && isButtonValid(btn)) {
                log('✅ Found via DIALOG:', text);
                return btn;
            }
        }
    }

    const groups = document.querySelectorAll(CONFIG.SELECTORS.BUTTON_GROUP);
    for (const group of groups) {
        const primaryBtn = group.querySelector(CONFIG.SELECTORS.PRIMARY);
        const hasSecondary = group.querySelector(CONFIG.SELECTORS.SECONDARY);
        if (primaryBtn && hasSecondary) {
            const text = extractButtonText(primaryBtn);
            if (isConfirmText(text) && isButtonValid(primaryBtn)) {
                log('✅ Found via BUTTON_GROUP:', text);
                return primaryBtn;
            }
        }
    }

    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const btn of allButtons) {
        const className = btn.className || '';
        const text = extractButtonText(btn);
        if (isConfirmText(text) && className.toLowerCase().includes('primary') && isButtonValid(btn) && !btn.closest('footer, header')) {
            log('✅ Found via FALLBACK:', text);
            return btn;
        }
    }

    return null;
}

function isContextAlive() {
    try { return !!chrome?.runtime?.id; } catch { return false; }
}

let pendingClick = null;

function startCountdown(btn) {
    cancelPendingClick();

    const orig = { outline: btn.style.outline, boxShadow: btn.style.boxShadow };
    btn.style.outline = '3px solid #10a37f';
    btn.style.outlineOffset = '2px';
    btn.style.boxShadow = '0 0 0 4px rgba(16, 163, 127, 0.3)';

    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'background:#10a37f', 'color:#fff',
        'font:600 16px system-ui,sans-serif', 'padding:4px 12px',
        'border-radius:8px', 'z-index:2147483647', 'pointer-events:none',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)', 'transform:translateX(-50%)',
        'transition:opacity .15s ease,background .15s ease'
    ].join(';');
    overlay.textContent = '3';

    const place = () => {
        const r = btn.getBoundingClientRect();
        overlay.style.left = (r.left + r.width / 2) + 'px';
        overlay.style.top = (r.top - 36) + 'px';
    };
    place();
    document.body.appendChild(overlay);

    let count = 3;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            overlay.textContent = String(count);
            place();
        } else {
            clearInterval(interval);
            overlay.remove();
            btn.style.outline = orig.outline;
            btn.style.boxShadow = orig.boxShadow;
            pendingClick = null;
            log('🎯 Clicking after countdown:', extractButtonText(btn));
            btn.click();
        }
    }, 1000);

    pendingClick = {
        btn,
        interval,
        cancel: () => {
            clearInterval(interval);
            overlay.textContent = '✕';
            overlay.style.background = '#e53e3e';
            setTimeout(() => {
                overlay.remove();
                btn.style.outline = orig.outline;
                btn.style.boxShadow = orig.boxShadow;
            }, 250);
            pendingClick = null;
            log('⛔ Countdown cancelled');
        }
    };
}

function cancelPendingClick() {
    if (pendingClick) pendingClick.cancel();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingClick) {
        e.preventDefault();
        cancelPendingClick();
    }
});

function checkAndClickButton() {
    if (!isContextAlive() || pendingClick) return;
    try {
        chrome.runtime.sendMessage({ action: 'isTabActive' }, (response) => {
            if (chrome.runtime.lastError || !response?.active) return;
            const confirmBtn = findConfirmButton();
            if (confirmBtn) {
                log('⏱ Starting countdown for:', extractButtonText(confirmBtn));
                startCountdown(confirmBtn);
                return true;
            }
            return false;
        });
    } catch (e) {
        log('⚠️ sendMessage failed:', String(e));
    }
}

function buttonLooksExpandable(btn) {
    const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`.trim();
    const text = (btn.textContent || '').trim();
    const expandWords = /\b(show more|show|more|expand|open|развернуть|показать|еще|ещё|подробнее)\b/i;
    return btn.matches('[aria-expanded="false"], [data-state="closed"], [aria-pressed="false"]') || expandWords.test(`${text} ${label}`);
}

function clickExpandableElements(container) {
    const details = container.querySelector('details:not([open])');
    if (details) {
        details.open = true;
        log('🔓 Opened details');
        return true;
    }

    const summaries = Array.from(container.querySelectorAll('summary')).filter((summary) => !summary.parentElement.open);
    if (summaries.length) {
        summaries.forEach((summary) => { summary.parentElement.open = true; });
        log('🔓 Opened summary sections');
        return true;
    }

    const buttons = Array.from(container.querySelectorAll('button, [role="button"]')).filter(buttonLooksExpandable);
    if (buttons.length) {
        buttons.forEach((btn) => { btn.click(); });
        log('🔓 Clicked expandable buttons:', buttons.length);
        return true;
    }

    return false;
}

function expandByLabel(regex) {
    const candidates = Array.from(document.querySelectorAll('div, section, article')).filter((node) => regex.test(node.textContent || ''));
    candidates.forEach((container) => clickExpandableElements(container));
}

const clickedExpandButtons = new WeakSet();

function expandByClass(selector, label) {
    const containers = document.querySelectorAll(selector);
    let count = 0;
    containers.forEach((container) => {
        const btn = container.querySelector('button');
        if (btn && isButtonValid(btn) && !clickedExpandButtons.has(btn)) {
            clickedExpandButtons.add(btn);
            btn.click();
            count++;
        }
    });
    if (count) log(`🔓 Clicked ${count} ${label} expand button(s)`);
}

function expandCollapsedCarets() {
    const carets = document.querySelectorAll('svg.transition-transform.rotate-90');
    let count = 0;
    carets.forEach((svg) => {
        const btn = svg.closest('button');
        if (btn && isButtonValid(btn) && !clickedExpandButtons.has(btn)) {
            clickedExpandButtons.add(btn);
            btn.click();
            count++;
        }
    });
    if (count) log(`🔓 Clicked ${count} collapsed input/output caret(s)`);
}

function expandAllIfNeeded() {
    if (STATE.autoExpandToolCalls) {
        expandByClass('[class*="tool-message"], [class*="group/tool-message"]', 'tool-message');
        expandByLabel(CONFIG.EXPAND_LABELS.TOOL_CALL);
    }
    if (STATE.autoExpandInputs || STATE.autoExpandOutputs) {
        expandCollapsedCarets();
        expandByLabel(CONFIG.EXPAND_LABELS.INPUTS);
        expandByLabel(CONFIG.EXPAND_LABELS.OUTPUTS);
    }
}

let intervalId = null;
let isVisible = document.visibilityState === 'visible';

function updateAutoConfirmState(isEnabled) {
    STATE.autoConfirm = !!isEnabled;
    log('🔄 Auto-confirm state:', STATE.autoConfirm);
    if (STATE.autoConfirm) {
        if (!intervalId) {
            checkAndClickButton();
            intervalId = setInterval(checkAndClickButton, CONFIG.CHECK_INTERVAL);
            log('⏱ Interval started');
        }
    } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        log('⏹ Interval stopped');
    }
}

function updateExpandState(key, value) {
    STATE[key] = !!value;
    log('🔄 Expand state changed:', key, STATE[key]);
    if (STATE[key] && isVisible) expandAllIfNeeded();
}

function handleVisibilityChange() {
    isVisible = document.visibilityState === 'visible';
    log('👁 Visibility:', isVisible ? 'visible' : 'hidden');
    if (isVisible) {
        if (STATE.autoConfirm) checkAndClickButton();
        if (STATE.autoExpandToolCalls || STATE.autoExpandInputs || STATE.autoExpandOutputs) expandAllIfNeeded();
    }
}

let observer = null;

function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
        if (!isVisible) return;
        if (STATE.autoConfirm) {
            const hasDialog = document.querySelector(CONFIG.SELECTORS.DIALOG) || document.querySelector(CONFIG.SELECTORS.BUTTON_GROUP);
            if (hasDialog) checkAndClickButton();
        }
        if (STATE.autoExpandToolCalls || STATE.autoExpandInputs || STATE.autoExpandOutputs) {
            expandAllIfNeeded();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    log('🔭 Observer attached');
}

function init() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!isContextAlive()) {
        log('⚠️ Extension context not available, skipping init');
        return;
    }
    try {
        chrome.storage.local.get(Object.values(CONFIG.STORAGE_KEYS), (result) => {
            if (chrome.runtime.lastError) return;
            updateAutoConfirmState(result[CONFIG.STORAGE_KEYS.AUTO_CONFIRM] || false);
            updateExpandState('autoExpandToolCalls', result[CONFIG.STORAGE_KEYS.AUTO_EXPAND_TOOL_CALLS] || false);
            updateExpandState('autoExpandInputs', result[CONFIG.STORAGE_KEYS.AUTO_EXPAND_INPUTS] || false);
            updateExpandState('autoExpandOutputs', result[CONFIG.STORAGE_KEYS.AUTO_EXPAND_OUTPUTS] || false);
            log('🚀 Initial state:', STATE);
            expandAllIfNeeded();
        });
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (chrome.runtime.lastError) return;
            if (namespace !== 'local') return;
            if (changes[CONFIG.STORAGE_KEYS.AUTO_CONFIRM]) updateAutoConfirmState(changes[CONFIG.STORAGE_KEYS.AUTO_CONFIRM].newValue);
            if (changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_TOOL_CALLS]) updateExpandState('autoExpandToolCalls', changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_TOOL_CALLS].newValue);
            if (changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_INPUTS]) updateExpandState('autoExpandInputs', changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_INPUTS].newValue);
            if (changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_OUTPUTS]) updateExpandState('autoExpandOutputs', changes[CONFIG.STORAGE_KEYS.AUTO_EXPAND_OUTPUTS].newValue);
        });
    } catch (e) {
        log('⚠️ Init failed:', String(e));
    }
    setupObserver();

    setInterval(() => {
        if (STATE.autoExpandToolCalls || STATE.autoExpandInputs || STATE.autoExpandOutputs) {
            expandAllIfNeeded();
        }
    }, CONFIG.EXPAND_POLL_INTERVAL);
    log('⏱ Expand polling started (every ' + (CONFIG.EXPAND_POLL_INTERVAL / 1000) + 's)');

    log('✅ AutoConfirm initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.addEventListener('unload', () => {
    if (intervalId) clearInterval(intervalId);
    if (observer) observer.disconnect();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
});
