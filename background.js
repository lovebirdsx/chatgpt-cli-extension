const NATIVE_HOST_NAME = "lovebird.chatgpt_native_host";

let communicationPort = null;

// --- Native Messaging Setup ---
function connectNativeHost() {
    console.log(`Attempting to connect to native host: ${NATIVE_HOST_NAME}`);
    communicationPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    communicationPort.onMessage.addListener((message) => {
        console.log("Received from native host:", message);
        handleCliCommand(message);
    });

    communicationPort.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
            console.error("Native host disconnected:", chrome.runtime.lastError.message);
        } else {
            console.log("Native host disconnected.");
        }
        communicationPort = null;
        // Optionally, attempt to reconnect after a delay
        // setTimeout(connectNativeHost, 5000);
    });
    console.log("Native messaging port connected or connection attempt initiated.");
}

const allCommands = [
    'ping',
    'sendMessage',
    'newChat',
    'deleteChat',
    'stop',
]

// --- Handle commands from CLI (via Native Host or WebSocket) ---
function handleCliCommand(command, options = {}) {
    chrome.tabs.query({ url: "https://chatgpt.com/*", ...options }, (tabs) => {
        if (!allCommands.includes(command.action)) {
            console.warn("Unknown command from CLI:", command);
            sendToCli({ status: "error", message: "Unknown command", originalCommand: command });
            return;
        }

        if (!tabs || tabs.length <= 0) {
            console.warn("No active ChatGPT tab found.");
            sendToCli({ status: "error", message: "No active ChatGPT tab found.", details: command });
            return;
        }

        const tab = tabs.find((t) => t.active) || tabs[0];
        chrome.tabs.sendMessage(tab.id, command, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`Error sending message to ${tab.id}:${tab.url} content script:`, chrome.runtime.lastError.message);
                sendToCli({ status: "error", message: `Error interacting with page: ${chrome.runtime.lastError.message}`, details: command });
            } else {
                console.log("Response from content script:", response);
                sendToCli({ status: response?.success ? "success" : "partial_error", data: response });
            }
        });
    });
}

function sendToCli(message) {
    if (communicationPort) {
        communicationPort.postMessage(message);
        console.log("Sent to CLI:", message);
    } else {
        console.error("No communication port available to send to CLI:", message);
    }
}

function main() {
    chrome.runtime.onStartup.addListener(() => {
        console.log("onStartup fired — trying to connect native host");
        connectNativeHost();
    });
    
    chrome.runtime.onInstalled.addListener((details) => {
        console.log("onInstalled fired (reason:", details.reason, ")");
        connectNativeHost();
    });
    
    console.log("ChatGPT Connector background script loaded.");
}

main();

// --- Test functions for CLI commands ---
function m() {
    handleCliCommand({ action: "sendMessage", text: '世界上最好的编程语言是？' });
}

function n() {
    handleCliCommand({ action: "newChat" });
}

function d() {
    handleCliCommand({ action: "deleteChat" });
}

function s() {
    handleCliCommand({ action: "stop" });
}

function p() {
    handleCliCommand({ action: "ping" });
}

function test() {
    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
        console.log("Active ChatGPT tabs found:", tabs.length);
        tabs.forEach((tab) => {
            console.log("Tab ID:", tab.id, "URL:", tab.url);
        });
    });
}
