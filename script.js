// --- ADDED: Import ethers for module usage ---
import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";

// --- DOM Elements ---
const chatList = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const chatInterface = document.getElementById('chat-interface');
const chatTitle = document.getElementById('chat-title');
const chatWindow = document.getElementById('chat-window');
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const welcomeScreen = document.getElementById('welcome-screen');
const welcomeMessage = document.getElementById('welcome-message'); // Welcome text element

// Settings Modal Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const apiKeyInput = document.getElementById('api-key');
const apiEndpointInput = document.getElementById('api-endpoint');
const modelNameInput = document.getElementById('model-name');
const systemPromptInput = document.getElementById('system-prompt');
const temperatureInput = document.getElementById('temperature');
const topPInput = document.getElementById('top_p');
const presencePenaltyInput = document.getElementById('presence_penalty');
const frequencyPenaltyInput = document.getElementById('frequency_penalty');

// Wallet Auth Elements
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletInfoDiv = document.getElementById('wallet-info');
const connectedAddressSpan = document.getElementById('connected-address');
const disconnectWalletBtn = document.getElementById('disconnect-wallet-btn');

// --- State Management ---
const DEFAULT_SETTINGS = {
    apiKey: '',
    apiBaseUrl: 'https://llama70b.gaia.domains/v1', // Original default
    modelName: 'llama70b', // Original default
    systemPrompt: '',
    temperature: 1.0,
    top_p: 1.0,
    presence_penalty: 0.0,
    frequency_penalty: 0.0,
};
let settings = { ...DEFAULT_SETTINGS };
let chats = [];
let activeChatId = null;
let web3Provider = null;
let signer = null;
let connectedAddress = null; // Wallet address state
const CHAT_COMPLETIONS_PATH = '/chat/completions';
const MAX_TITLE_LENGTH = 35;
let abortController = null;

// --- Initialization & State ---
function getStorageKey(baseKey) {
    return connectedAddress ? `${baseKey}_${connectedAddress}` : `${baseKey}_local`;
}
function loadSettings() {
    const savedSettings = localStorage.getItem('aiChatSettingsGlobal');
    if (savedSettings) {
        try {
            const parsedSettings = JSON.parse(savedSettings);
            settings = { ...DEFAULT_SETTINGS, ...parsedSettings };
            settings.temperature = parseFloat(settings.temperature ?? DEFAULT_SETTINGS.temperature);
            settings.top_p = parseFloat(settings.top_p ?? DEFAULT_SETTINGS.top_p);
            settings.presence_penalty = parseFloat(settings.presence_penalty ?? DEFAULT_SETTINGS.presence_penalty);
            settings.frequency_penalty = parseFloat(settings.frequency_penalty ?? DEFAULT_SETTINGS.frequency_penalty);
        } catch (e) { console.error("Failed to parse global settings:", e); settings = { ...DEFAULT_SETTINGS }; }
    } else { settings = { ...DEFAULT_SETTINGS }; }
    console.log("Loaded global settings:", settings);
}
function safeParseFloat(value, defaultValue) { const parsed = parseFloat(value); return isNaN(parsed) ? defaultValue : parsed; }
function saveSettings() {
    settings.apiKey = apiKeyInput.value.trim();
    let baseUrl = apiEndpointInput.value.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    settings.apiBaseUrl = baseUrl || DEFAULT_SETTINGS.apiBaseUrl;
    settings.modelName = modelNameInput.value.trim() || DEFAULT_SETTINGS.modelName;
    settings.systemPrompt = systemPromptInput.value.trim();
    settings.temperature = safeParseFloat(temperatureInput.value, DEFAULT_SETTINGS.temperature);
    settings.top_p = safeParseFloat(topPInput.value, DEFAULT_SETTINGS.top_p);
    settings.presence_penalty = safeParseFloat(presencePenaltyInput.value, DEFAULT_SETTINGS.presence_penalty);
    settings.frequency_penalty = safeParseFloat(frequencyPenaltyInput.value, DEFAULT_SETTINGS.frequency_penalty);
    try { localStorage.setItem('aiChatSettingsGlobal', JSON.stringify(settings)); console.log("Global settings saved:", settings); } catch (e) { console.error("Failed to save global settings:", e); alert("Error saving settings."); }
    hideSettingsModal();
}
function loadChats() {
    if (!connectedAddress) {
        chats = []; renderSidebar(); showWelcomeScreen("Connect your wallet to load chats."); console.log("Wallet not connected, skipping chat load."); return;
    }
    const storageKey = getStorageKey('aiChats');
    const savedChats = localStorage.getItem(storageKey);
    if (savedChats) { try { chats = JSON.parse(savedChats); chats.forEach(chat => { chat.messages = chat.messages || []; }); console.log(`Chats loaded for ${connectedAddress}:`, chats.length); } catch (e) { console.error("Failed to parse chats:", e); chats = []; } }
    else { chats = []; console.log(`No chats found for ${connectedAddress}.`); }
    const lastActiveKey = getStorageKey('aiChatLastActiveId');
    const lastActiveId = localStorage.getItem(lastActiveKey);
    const chatExists = chats.some(chat => chat.id === lastActiveId);
    if (chatExists) { setActiveChat(lastActiveId); }
    else if (chats.length > 0) { chats.sort((a, b) => (b.id > a.id ? 1 : -1)); setActiveChat(chats[0].id); }
    else { showWelcomeScreen("Start a new chat or select one."); setActiveChat(null); }
    renderSidebar();
}
function saveChats() {
    if (!connectedAddress) return;
    const storageKey = getStorageKey('aiChats'); const lastActiveKey = getStorageKey('aiChatLastActiveId');
    try { localStorage.setItem(storageKey, JSON.stringify(chats)); if (activeChatId) localStorage.setItem(lastActiveKey, activeChatId); else localStorage.removeItem(lastActiveKey); } catch (e) { console.error("Failed to save chats:", e); alert("Error saving chat history."); }
}

// --- UI Update Functions ---
function renderSidebar() {
    chatList.innerHTML = ''; chats.sort((a, b) => (b.id > a.id ? 1 : -1));
    chats.forEach(chat => {
        const listItem = document.createElement('div'); listItem.classList.add('chat-list-item'); listItem.dataset.chatId = chat.id; if (chat.id === activeChatId) listItem.classList.add('active');
        const titleSpan = document.createElement('span'); titleSpan.classList.add('chat-title-span'); titleSpan.textContent = chat.title || 'Untitled Chat'; listItem.appendChild(titleSpan);
        const actionsDiv = document.createElement('div'); actionsDiv.classList.add('chat-item-actions');
        const renameBtn = document.createElement('button'); renameBtn.innerHTML = '✏️'; renameBtn.title = 'Rename Chat'; renameBtn.addEventListener('click', (e) => { e.stopPropagation(); handleRenameChat(chat.id, listItem, titleSpan); }); actionsDiv.appendChild(renameBtn);
        const clearBtn = document.createElement('button'); clearBtn.innerHTML = '🧹'; clearBtn.title = 'Clear History'; clearBtn.addEventListener('click', (e) => { e.stopPropagation(); handleClearChatHistory(chat.id); }); actionsDiv.appendChild(clearBtn);
        const deleteBtn = document.createElement('button'); deleteBtn.innerHTML = '🗑️'; deleteBtn.title = 'Delete Chat'; deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleDeleteChat(chat.id); }); actionsDiv.appendChild(deleteBtn);
        listItem.appendChild(actionsDiv);
        listItem.addEventListener('click', () => { if (!listItem.classList.contains('editing')) { if (abortController) { abortController.abort(); } setActiveChat(chat.id); } });
        chatList.appendChild(listItem);
    });
}
function renderChatHistory() {
    chatHistory.innerHTML = ''; const activeChat = chats.find(chat => chat.id === activeChatId);
    if (activeChat && activeChat.messages) { activeChat.messages.forEach(msg => { const { messageElement, metaElement } = createMessageElement( msg.role, msg.content, msg.type || 'text', msg.id || `msg_${Date.now()}`, msg.responseTime ); if(messageElement) chatHistory.appendChild(messageElement); if(metaElement) chatHistory.appendChild(metaElement); }); chatTitle.textContent = activeChat.title || 'Chat'; showChatInterface(); scrollToBottom(); }
    else if (activeChat) { chatTitle.textContent = activeChat.title || 'Chat'; showChatInterface(); } // Empty chat
    else { showWelcomeScreen(); }
}
function createMessageElement(role, content, type = 'text', messageId, responseTime = null) {
    const messageDiv = document.createElement('div'); messageDiv.classList.add('message', role); messageDiv.dataset.messageId = messageId; if (type === 'error') messageDiv.classList.add('error');
    const paragraph = document.createElement('p'); paragraph.style.whiteSpace = 'pre-wrap'; paragraph.innerHTML = applyMarkdown(content); messageDiv.appendChild(paragraph);
    let metaDiv = null; if (role === 'assistant' && responseTime !== null) { metaDiv = document.createElement('div'); metaDiv.classList.add('message-meta'); metaDiv.dataset.metaFor = messageId; metaDiv.textContent = `⏱️ ${responseTime}s`; }
    return { messageElement: messageDiv, metaElement: metaDiv };
}
function applyMarkdown(text) {
    if (typeof text !== 'string') return ''; let escapedText = text.replace(/</g, '<').replace(/>/g, '>');
    const codeBlockPlaceholder = '___CODE_BLOCK___' + Math.random() + '___'; const codeBlocks = [];
    escapedText = escapedText.replace(/```([\s\S]*?)```/gs, (match, code) => { const escapedCode = code.replace(/</g, '<').replace(/>/g, '>'); codeBlocks.push(`<pre><code>${escapedCode.trim()}</code></pre>`); return codeBlockPlaceholder; });
    escapedText = escapedText .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') .replace(/`([^`]+)`/g, (match, code) => `<code>${code.replace(/</g, '<').replace(/>/g, '>')}</code>`);
    codeBlocks.forEach(block => { escapedText = escapedText.replace(codeBlockPlaceholder, block); });
    return escapedText;
}
function renderOrUpdateMessage(role, content, type = 'text', messageId, isStreaming = false) {
    let messageDiv = chatHistory.querySelector(`.message[data-message-id="${messageId}"]`); let isNew = false;
    if (!messageDiv) { isNew = true; messageDiv = document.createElement('div'); messageDiv.classList.add('message', role); messageDiv.dataset.messageId = messageId; if (type === 'error') messageDiv.classList.add('error'); const paragraph = document.createElement('p'); paragraph.style.whiteSpace = 'pre-wrap'; messageDiv.appendChild(paragraph); chatHistory.appendChild(messageDiv); }
    const paragraph = messageDiv.querySelector('p');
    if (isStreaming) { if (isNew && role === 'assistant') { paragraph.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>'; } else if (role === 'assistant' && paragraph.querySelector('.typing-indicator')) { paragraph.textContent = content; } else { paragraph.textContent = content; } }
    else { paragraph.innerHTML = applyMarkdown(content); }
    if (!isStreaming) { const existingMeta = chatHistory.querySelector(`.message-meta[data-meta-for="${messageId}"]`); if(existingMeta) existingMeta.remove(); }
    scrollToBottom();
}
function scrollToBottom() { setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 0); }
function showChatInterface() { welcomeScreen.classList.add('hidden'); chatInterface.classList.remove('hidden'); if (connectedAddress) userInput.focus(); }
function showWelcomeScreen(message = "Connect your wallet to begin.") { if (welcomeMessage) welcomeMessage.textContent = message; welcomeScreen.classList.remove('hidden'); chatInterface.classList.add('hidden'); }

// --- Chat Management Functions ---
function createNewChat() { if (!connectedAddress) { alert("Please connect your wallet first."); return; } if (abortController) { abortController.abort(); } const newChatId = `chat_${Date.now()}`; const newChat = { id: newChatId, title: 'New Chat', messages: [] }; chats.unshift(newChat); setActiveChat(newChatId); saveChats(); }
function setActiveChat(chatId) { if (chatId === null) { activeChatId = null; if (connectedAddress) localStorage.removeItem(getStorageKey('aiChatLastActiveId')); showWelcomeScreen(`Start a new chat or select one.`); renderSidebar(); return; } if (activeChatId === chatId && !chatInterface.classList.contains('hidden')) return; activeChatId = chatId; if (connectedAddress) localStorage.setItem(getStorageKey('aiChatLastActiveId'), activeChatId); renderSidebar(); renderChatHistory(); userInput.value = ''; userInput.style.height = 'auto'; if (chatId) { showChatInterface(); } else { showWelcomeScreen(); } }
function generateChatTitle(messageContent) { const words = messageContent.split(' '); let title = words.slice(0, 5).join(' '); if (title.length > MAX_TITLE_LENGTH) title = title.substring(0, MAX_TITLE_LENGTH) + '...'; return title || "Untitled Chat"; }
function addMessageToData(chatId, role, content, type = 'text', messageId, responseTime = null) { const chat = chats.find(c => c.id === chatId); if (!chat) return null; const existingMessageIndex = chat.messages.findIndex(m => m.id === messageId); if (existingMessageIndex !== -1) { chat.messages[existingMessageIndex].content = content; if(type) chat.messages[existingMessageIndex].type = type; if(responseTime !== null) chat.messages[existingMessageIndex].responseTime = responseTime; } else { const newMessage = { id: messageId, role, content, type, responseTime }; chat.messages.push(newMessage); if (role === 'user' && chat.title === 'New Chat' && chat.messages.filter(m => m.role === 'user').length === 1) { chat.title = generateChatTitle(content); chatTitle.textContent = chat.title; renderSidebar(); } } saveChats(); return messageId; }
function handleRenameChat(chatId, listItemElement, titleSpanElement) { listItemElement.classList.add('editing'); const currentTitle = titleSpanElement.textContent; const input = document.createElement('input'); input.type = 'text'; input.value = currentTitle; input.classList.add('rename-input'); listItemElement.replaceChild(input, titleSpanElement); input.focus(); input.select(); const saveRename = () => { const newTitle = input.value.trim() || "Untitled Chat"; const chat = chats.find(c => c.id === chatId); if (chat) { chat.title = newTitle; saveChats(); if (activeChatId === chatId) chatTitle.textContent = newTitle; } listItemElement.classList.remove('editing'); renderSidebar(); }; const cancelRename = () => { listItemElement.classList.remove('editing'); renderSidebar(); }; input.addEventListener('blur', saveRename); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } else if (e.key === 'Escape') { cancelRename(); } }); }
function handleDeleteChat(chatId) { const chatToDelete = chats.find(c => c.id === chatId); if (!chatToDelete) return; if (confirm(`Are you sure you want to delete the chat "${chatToDelete.title || 'Untitled Chat'}"?`)) { chats = chats.filter(chat => chat.id !== chatId); saveChats(); if (activeChatId === chatId) { activeChatId = null; if (chats.length > 0) { setActiveChat(chats[0].id); } else { setActiveChat(null); } } else { renderSidebar(); } } }
function handleClearChatHistory(chatId) { const chatToClear = chats.find(c => c.id === chatId); if (!chatToClear) return; if (confirm(`Are you sure you want to clear all messages in "${chatToClear.title || 'Untitled Chat'}"?`)) { chatToClear.messages = []; saveChats(); if (activeChatId === chatId) renderChatHistory(); } }

// --- Wallet Connection Logic ---
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') { alert('MetaMask (or another Ethereum wallet provider) not found. Please install it.'); return; }
    try {
        web3Provider = new ethers.BrowserProvider(window.ethereum, "any");
        await web3Provider.send("eth_requestAccounts", []);
        signer = await web3Provider.getSigner();
        const address = await signer.getAddress();
        // const messageToSign = `Sign this message...Nonce: ${Date.now()}`; // Optional Sign Message
        // await signer.signMessage(messageToSign); // Optional Sign Message

        connectedAddress = address;
        updateWalletUI(true);
        loadChats();
        addWalletListeners();
    } catch (error) {
        console.error("Wallet connection/signing failed:", error);
        // ADDED: More specific error handling
        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            alert('You rejected the connection or signature request in your wallet.');
        } else if (error.code === -32002) { // Specific code for request already pending
             alert('Please check your wallet, a connection request is already pending.');
        } else {
            // Generic error message
            alert(`Wallet connection failed: ${error.message || 'Unknown error'}`);
        }
        disconnectWallet(); // Reset state on failure
    }
}
function disconnectWallet() {
    console.log("Disconnecting wallet.");
    if (window.ethereum?.removeListener) { window.ethereum.removeListener('accountsChanged', handleAccountsChanged); }
    web3Provider = null; signer = null; connectedAddress = null; activeChatId = null; chats = [];
    updateWalletUI(false); showWelcomeScreen("Connect your wallet to begin."); renderSidebar();
}
function updateWalletUI(isConnected) {
    if (isConnected && connectedAddress) {
        walletInfoDiv.classList.remove('hidden'); connectWalletBtn.classList.add('hidden');
        const truncatedAddress = `${connectedAddress.substring(0, 6)}...${connectedAddress.substring(connectedAddress.length - 4)}`;
        connectedAddressSpan.textContent = truncatedAddress; connectedAddressSpan.title = connectedAddress;
        welcomeMessage.textContent = "Start a new chat or select one.";
        userInput.disabled = false; userInput.placeholder = "Enter your message...";
    } else {
        walletInfoDiv.classList.add('hidden'); connectWalletBtn.classList.remove('hidden');
        connectedAddressSpan.textContent = ''; connectedAddressSpan.title = '';
        welcomeMessage.textContent = "Connect your wallet to begin.";
        userInput.disabled = true; userInput.placeholder = "Connect wallet to chat...";
    }
}
function handleAccountsChanged(accounts) {
    console.log("Wallet accounts changed", accounts);
    if (accounts.length === 0) { console.log('Wallet disconnected or locked.'); disconnectWallet(); }
    else if (accounts[0].toLowerCase() !== connectedAddress?.toLowerCase()) { console.log('Account changed to:', accounts[0]); disconnectWallet(); connectWallet(); }
}
function addWalletListeners() { if (window.ethereum?.on) window.ethereum.on('accountsChanged', handleAccountsChanged); }
function copyAddress() { if (connectedAddress) navigator.clipboard.writeText(connectedAddress).then(() => alert('Address copied!'), () => alert('Failed to copy address.')); }

// --- API Interaction (Streaming) ---
async function getAIResponse() {
    if (!connectedAddress) { alert("Please connect your wallet first."); return; }
    if (!activeChatId) { alert("Please start or select a chat first."); return; }
    if (!settings.apiBaseUrl || !settings.modelName) { alert("API Base URL or Model Name missing in Settings."); showSettingsModal(); return; }
    if (!settings.apiKey) { alert("API Key missing in Settings."); showSettingsModal(); return; } // Keep API key check
    const userMessageContent = userInput.value.trim(); if (!userMessageContent) return;
    if (abortController) { abortController.abort(); } abortController = new AbortController(); const startTime = Date.now();
    const userMessageId = `msg_${Date.now()}`; addMessageToData(activeChatId, 'user', userMessageContent, 'text', userMessageId);
    const { messageElement: userMsgEl, metaElement: userMetaEl } = createMessageElement('user', userMessageContent, 'text', userMessageId); if (userMsgEl) chatHistory.appendChild(userMsgEl); if (userMetaEl) chatHistory.appendChild(userMetaEl); scrollToBottom();
    userInput.value = ''; userInput.style.height = 'auto'; sendBtn.disabled = true; userInput.disabled = true;
    const assistantMessageId = `msg_${Date.now() + 1}`; let assistantContent = ''; addMessageToData(activeChatId, 'assistant', '', 'text', assistantMessageId); renderOrUpdateMessage('assistant', '', 'text', assistantMessageId, true);
    let apiEndpointFull = settings.apiBaseUrl; if (apiEndpointFull.endsWith('/')) apiEndpointFull = apiEndpointFull.slice(0, -1); if (!apiEndpointFull.endsWith(CHAT_COMPLETIONS_PATH)) apiEndpointFull += CHAT_COMPLETIONS_PATH;
    const currentChat = chats.find(chat => chat.id === activeChatId); let messagesToSend = currentChat ? currentChat.messages.map(m => ({ role: m.role, content: m.content })) : []; if (settings.systemPrompt) messagesToSend.unshift({ role: 'system', content: settings.systemPrompt }); messagesToSend = messagesToSend.filter(m => !(m.role === 'assistant' && m.content === ''));
    const payload = { model: settings.modelName, messages: messagesToSend, stream: true, temperature: settings.temperature, top_p: settings.top_p, presence_penalty: settings.presence_penalty, frequency_penalty: settings.frequency_penalty };
    console.log("Sending API Payload:", payload);
    try {
        const headers = { 'Content-Type': 'application/json' }; headers['Authorization'] = `Bearer ${settings.apiKey}`;
        const response = await fetch(apiEndpointFull, { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: abortController.signal });
        if (!response.ok) { let errorBodyText = await response.text(); let errorJson = null; try { errorJson = JSON.parse(errorBodyText); } catch (e) {} console.error("API Error:", response.status, response.statusText, errorJson || errorBodyText); const errorMessage = errorJson?.error?.message || errorJson?.detail || errorBodyText || `Request failed with status ${response.status}`; throw new Error(`API Error: ${response.status} - ${errorMessage}`); }
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
            const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop();
            for (const line of lines) { if (line.startsWith('data: ')) { const dataJson = line.substring(6).trim(); if (dataJson === '[DONE]') break; try { const chunk = JSON.parse(dataJson); const deltaContent = chunk.choices?.[0]?.delta?.content; if (deltaContent) { assistantContent += deltaContent; renderOrUpdateMessage('assistant', assistantContent, 'text', assistantMessageId, true); } } catch (e) { console.error('Error parsing stream chunk:', e, 'Data:', dataJson); } } }
            if (abortController.signal.aborted) throw new Error('Fetch aborted');
        }
        const endTime = Date.now(); const responseTime = ((endTime - startTime) / 1000).toFixed(2);
        addMessageToData(activeChatId, 'assistant', assistantContent, 'text', assistantMessageId, responseTime); renderOrUpdateMessage('assistant', assistantContent, 'text', assistantMessageId, false);
        const finalMsgElement = chatHistory.querySelector(`.message[data-message-id="${assistantMessageId}"]`); const { metaElement: finalMetaEl } = createMessageElement('assistant', '', 'text', assistantMessageId, responseTime);
        if(finalMsgElement && finalMetaEl) { const existingMeta = chatHistory.querySelector(`.message-meta[data-meta-for="${assistantMessageId}"]`); if (!existingMeta) finalMsgElement.insertAdjacentElement('afterend', finalMetaEl); }
    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'Fetch aborted') { console.log('Fetch aborted.'); const failedMsgElement = chatHistory.querySelector(`.message[data-message-id="${assistantMessageId}"]`); if (failedMsgElement) failedMsgElement.remove(); const chat = chats.find(c => c.id === activeChatId); if(chat) chat.messages = chat.messages.filter(m => m.id !== assistantMessageId); saveChats(); }
        else { console.error("Streaming Fetch Error:", error); const errorMsg = `⚠️ Error: ${error.message}. Check console/settings.`; addMessageToData(activeChatId, 'assistant', errorMsg, 'error', assistantMessageId); renderOrUpdateMessage('assistant', errorMsg, 'error', assistantMessageId, false); }
    } finally { sendBtn.disabled = false; userInput.disabled = !connectedAddress; userInput.focus(); abortController = null; }
}

// --- Settings Modal Logic ---
function showSettingsModal() {
    const requiredInputs = [apiKeyInput, apiEndpointInput, modelNameInput, systemPromptInput, temperatureInput, topPInput, presencePenaltyInput, frequencyPenaltyInput];
    if (requiredInputs.some(el => !el)) { console.error("Settings input elements not found!"); alert("Error: Settings panel elements missing."); return; }
    apiKeyInput.value = settings.apiKey || ''; apiEndpointInput.value = settings.apiBaseUrl || ''; modelNameInput.value = settings.modelName || ''; systemPromptInput.value = settings.systemPrompt || '';
    temperatureInput.value = settings.temperature.toFixed(1); topPInput.value = settings.top_p.toFixed(1); presencePenaltyInput.value = settings.presence_penalty.toFixed(1); frequencyPenaltyInput.value = settings.frequency_penalty.toFixed(1);
    settingsModal.classList.remove('hidden');
}
function hideSettingsModal() { settingsModal.classList.add('hidden'); }

// --- Auto-resize Textarea ---
userInput.addEventListener('input', () => { userInput.style.height = 'auto'; const maxHeight = 150; const scrollHeight = userInput.scrollHeight; userInput.style.height = Math.min(scrollHeight, maxHeight) + 'px'; });

// --- Event Listeners ---
newChatBtn.addEventListener('click', createNewChat);
sendBtn.addEventListener('click', getAIResponse);
userInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); getAIResponse(); } });
settingsBtn.addEventListener('click', showSettingsModal);
closeSettingsBtn.addEventListener('click', hideSettingsModal);
saveSettingsBtn.addEventListener('click', saveSettings);
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) hideSettingsModal(); });
connectWalletBtn.addEventListener('click', connectWallet);
disconnectWalletBtn.addEventListener('click', disconnectWallet);
connectedAddressSpan.addEventListener('click', copyAddress);

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing chat...");
    loadSettings();
    updateWalletUI(false);
    showWelcomeScreen();
    userInput.disabled = true;
    userInput.placeholder = "Connect wallet to chat...";
    userInput.style.height = 'auto'; userInput.style.height = userInput.scrollHeight + 'px';
});