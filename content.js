const PROMPT_TEXTAREA_ID = 'prompt-textarea';
const SEND_BUTTON_TEST_IDS = ['send-button', 'composer-speech-button'];

let promptTextarea = null;
let sendButton = null;

function log(...args) {
    console.log('ChatGPT Connector:', ...args);
}

function warn(...args) {
    console.warn('ChatGPT Connector:', ...args);
}

function error(...args) {
    console.error('ChatGPT Connector:', ...args);
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function delayRandom(ms, bias = 0.25) {
    const offset = Math.floor(Math.random() * (ms * bias));
    const start = ms * (1 - bias / 2);
    const real = start + offset;
    await delay(real);
}

function getSendButton() {
    const allButtons = Array.from(document.querySelectorAll('button'));
    const sendButton = allButtons.find(button => {
        const testId = button.getAttribute('data-testid');
        return SEND_BUTTON_TEST_IDS.includes(testId);
    });
    return sendButton;
}

function getPromptTextarea() {
    const textarea = document.getElementById(PROMPT_TEXTAREA_ID);
    return textarea;
}

function getNewChatButton() {
    const newChatButton = document.querySelector('[data-testid="create-new-chat-button"]');
    return newChatButton;
}

function getOptionsButton() {
    const optionsButton = document.querySelector('[data-testid="conversation-options-button"]');
    return optionsButton;
}

async function sendMessage(text, sendResponse) {
    const editor = getPromptTextarea();
    if (!editor) {
        warn('Prompt textarea not found. Cannot send message.');
        sendResponse({ success: false, error: 'Prompt textarea not found.' });
        return;
    }

    editor.focus();
    await delayRandom(50);

    const selection = window.getSelection();
    const range = document.createRange();

    const pNode = editor.querySelector("p");
    range.selectNodeContents(pNode);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);

    await delayRandom(100);

    const sendButton = getSendButton();
    if (sendButton) {
        sendButton.click();
        log('Message sent to page:', text);
    } else {
        warn('Send button not found. Cannot send message.');
        sendResponse({ success: false, error: 'Send button not found.' });
    }

    sendResponse({ success: true });
}

async function newChat(sendResponse) {
    try {
        const downEvent = new KeyboardEvent('keydown', {
            key: 'o',
            code: 'KeyO',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(downEvent);

        const upEvent = new KeyboardEvent('keyup', {
            key: 'o',
            code: 'KeyO',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(upEvent);

        await delayRandom(100);

        sendResponse({ success: true });
        log('newChat via shortcut sent');
    } catch (err) {
        warn('Failed to dispatch newChat shortcut:', err);
        sendResponse({ success: false, error: err.message });
    }
}

async function deleteChat(sendResponse) {
    const optionsBtn = getOptionsButton();
    if (!optionsBtn) {
        warn('Options button not found. Cannot delete chat.');
        sendResponse({ success: false, error: 'Options button not found.' });
        return;
    }

    const pointerDownEvent = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
    });
    optionsBtn.dispatchEvent(pointerDownEvent);

    await delayRandom(200);

    const deleteBtn = document.querySelector('[data-testid="delete-chat-menu-item"]');
    if (!deleteBtn) {
        warn('Delete chat button not found. Cannot delete chat.');
        sendResponse({ success: false, error: 'Delete chat button not found.' });
        return;
    }

    deleteBtn.click();
    await delayRandom(200);

    const confirmBtn = document.querySelector('[data-testid="delete-conversation-confirm-button"]');
    if (!confirmBtn) {
        warn('Confirm delete button not found. Cannot confirm delete.');
        sendResponse({ success: false, error: 'Confirm delete button not found.' });
        return;
    }

    confirmBtn.click();
    sendResponse({ success: true });
}

async function stop(sendResponse) {
    const stopBtn = document.querySelector('[data-testid="stop-button"]');
    if (!stopBtn) {
        warn('Stop button not found. Cannot stop.');
        sendResponse({ success: false, error: 'Stop button not found.' });
        return;
    }

    stopBtn.click();
    sendResponse({ success: true });
}

async function selectModel(modelId, sendResponse) {
    try {
        const btn = document.querySelector('button[data-testid="model-switcher-dropdown-button"]');
        if (!btn) {
            warn('Model selector button not found.');
            sendResponse({ success: false, error: 'Model selector button not found.' });
            return;
        }

        const pointerDownEvent = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerType: 'mouse',
        });
        btn.dispatchEvent(pointerDownEvent);

        await delayRandom(100);

        const options = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
        if (options.length < modelId) {
            warn(`Only ${options.length} models found, cannot select #${modelId}.`);
            sendResponse({ success: false, error: 'Not enough model options.' });
            return;
        }

        options[modelId - 1].click();
        log(`selectModel${modelId} executed`);
        sendResponse({ success: true });
    } catch (err) {
        warn('selectModel error:', err);
        sendResponse({ success: false, error: err.message });
    }
}

function handleKeydown(event) {
    if (event.key === 'k' && event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        log('Alt+K detected — dispatching Ctrl+K to page');

        const down = new KeyboardEvent('keydown', {
            key: 'k',
            code: 'KeyK',
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(down);

        const up = new KeyboardEvent('keyup', {
            key: 'k',
            code: 'KeyK',
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(up);
    } else if (event.key === '1' && event.altKey) {
        selectModel(1, () => { });
    } else if (event.key === '2' && event.altKey) {
        selectModel(2, () => { });
    } else if (event.key === '3' && event.altKey) {
        selectModel(3, () => { });
    } else if (event.key === '4' && event.altKey) {
        selectModel(4, () => { });
    } else if (event.key === '5' && event.altKey) {
        selectModel(5, () => { });
    } else if (event.key === 's' && event.altKey) {
        stop(() => { });
    }
}

document.addEventListener('keydown', handleKeydown);

function formatRequest(request) {
    const formatted = {};
    Object.keys(request).forEach(key => {
        const value = request[key];
        if (typeof value === 'string' && value.length > 64) {
            formatted[key] = value.substring(0, 61) + '...';
        } else {
            formatted[key] = value;
        }
    });
    return formatted;
}

// --- Listen for messages from the background script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Message received in content script:', formatRequest(request));
    switch (request.action) {
        case 'sendMessage':
            sendMessage(request.text, sendResponse);
            break;
        case 'newChat':
            newChat(sendResponse);
            break;
        case 'deleteChat':
            deleteChat(sendResponse);
            break;
        case 'stop':
            stop(sendResponse);
            break;
        case 'ping':
            sendResponse({ success: true, response: 'pong' });
            break;
        case 'selectModel1':
        case 'selectModel2':
        case 'selectModel3':
        case 'selectModel4':
        case 'selectModel5': {
            const modelId = parseInt(request.action.replace('selectModel', ''), 10);
            selectModel(modelId, sendResponse);
            break;
        }

        default:
            warn('Unknown action in content script:', request.action);
            sendResponse({ success: false, error: `Unknown action: ${request.action}` });
            break;
    }

    return true;
});

log('content script loaded.');
