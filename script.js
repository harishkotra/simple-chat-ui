import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js"; // Use consistent version or the one from HTML

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
const compareBtn = document.getElementById('compare-btn'); // ADDED

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
// ADDED: Settings elements for comparison
const comparisonEndpointList = document.getElementById('comparison-endpoint-list');
const addComparisonEndpointBtn = document.getElementById('add-comparison-endpoint-btn');

// Wallet Auth Elements
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletInfoDiv = document.getElementById('wallet-info');
const connectedAddressSpan = document.getElementById('connected-address');
const disconnectWalletBtn = document.getElementById('disconnect-wallet-btn');

// --- State Management ---
const DEFAULT_SETTINGS = {
    apiKey: '',
    apiBaseUrl: 'https://llama70b.gaia.domains/v1',
    modelName: 'llama70b',
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
let abortController = null; // Used for single send
let comparisonAbortController = null; // ADDED: For comparison requests

// ADDED: State for comparison endpoints
let comparisonEndpoints = [];
const MAX_COMPARISON_ENDPOINTS = 3;

// --- Initialization & State ---
function getStorageKey(baseKey) {
    return connectedAddress ? `${baseKey}_${connectedAddress}` : `${baseKey}_local`;
}

function loadSettings() {
    // Load primary settings
    const savedSettings = localStorage.getItem('aiChatSettingsGlobal');
    if (savedSettings) {
        try {
            const parsedSettings = JSON.parse(savedSettings);
            settings = { ...DEFAULT_SETTINGS, ...parsedSettings };
            // Ensure numeric types are correct after loading
            settings.temperature = safeParseFloat(settings.temperature, DEFAULT_SETTINGS.temperature);
            settings.top_p = safeParseFloat(settings.top_p, DEFAULT_SETTINGS.top_p);
            settings.presence_penalty = safeParseFloat(settings.presence_penalty, DEFAULT_SETTINGS.presence_penalty);
            settings.frequency_penalty = safeParseFloat(settings.frequency_penalty, DEFAULT_SETTINGS.frequency_penalty);
        } catch (e) { console.error("Failed to parse global settings:", e); settings = { ...DEFAULT_SETTINGS }; }
    } else { settings = { ...DEFAULT_SETTINGS }; }
    console.log("Loaded global settings:", settings);

    // ADDED: Load comparison endpoints (global, not per-wallet for now)
    const savedComparisonEndpoints = localStorage.getItem('aiChatComparisonEndpoints');
    if (savedComparisonEndpoints) {
        try {
            comparisonEndpoints = JSON.parse(savedComparisonEndpoints);
            // Basic validation/cleaning
            comparisonEndpoints = comparisonEndpoints.map(ep => ({
                id: ep.id || `comp_ep_${Date.now()}_${Math.random()}`, // Ensure ID exists
                name: ep.name || 'Untitled Endpoint',
                url: ep.url || '',
                key: ep.key || '', // Store key separately
                model: ep.model || '',
                active: !!ep.active
            }));
        } catch (e) { console.error("Failed to parse comparison endpoints:", e); comparisonEndpoints = []; }
    } else { comparisonEndpoints = []; }
    console.log("Loaded comparison endpoints:", comparisonEndpoints);
}

function safeParseFloat(value, defaultValue) { const parsed = parseFloat(value); return isNaN(parsed) ? defaultValue : parsed; }

function saveSettings() {
    // Save primary settings
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
    try { localStorage.setItem('aiChatSettingsGlobal', JSON.stringify(settings)); console.log("Global settings saved:", settings); }
    catch (e) { console.error("Failed to save global settings:", e); alert("Error saving primary settings."); }

    // ADDED: Save comparison endpoints (update state from UI first)
    updateComparisonEndpointsFromUI(); // Make sure state reflects UI before saving
    try { localStorage.setItem('aiChatComparisonEndpoints', JSON.stringify(comparisonEndpoints)); console.log("Comparison endpoints saved:", comparisonEndpoints); }
    catch (e) { console.error("Failed to save comparison endpoints:", e); alert("Error saving comparison endpoints."); }

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
        listItem.addEventListener('click', () => {
            if (!listItem.classList.contains('editing')) {
                // Abort both single and comparison fetches if switching chats
                if (abortController) abortController.abort();
                if (comparisonAbortController) comparisonAbortController.abort();
                setActiveChat(chat.id);
            }
        });
        chatList.appendChild(listItem);
    });
}

function renderChatHistory() {
    chatHistory.innerHTML = ''; const activeChat = chats.find(chat => chat.id === activeChatId);
    if (activeChat && activeChat.messages) {
        activeChat.messages.forEach(msg => {
            // ADDED: Handle rendering comparison results if stored (optional, not implemented here)
            // if (msg.type === 'comparison') {
            //     renderComparisonResult(msg.comparisonData); // Need to implement this if storing
            // } else {
                const { messageElement, metaElement } = createMessageElement( msg.role, msg.content, msg.type || 'text', msg.id || `msg_${Date.now()}`, msg.responseTime );
                if(messageElement) chatHistory.appendChild(messageElement);
                if(metaElement) chatHistory.appendChild(metaElement);
            // }
        });
        chatTitle.textContent = activeChat.title || 'Chat';
        showChatInterface();
        scrollToBottom();
    }
    else if (activeChat) { // Empty chat
        chatTitle.textContent = activeChat.title || 'Chat';
        showChatInterface();
    }
    else { showWelcomeScreen(); }
}

function createMessageElement(role, content, type = 'text', messageId, responseTime = null) {
    const messageDiv = document.createElement('div'); messageDiv.classList.add('message', role); messageDiv.dataset.messageId = messageId; if (type === 'error') messageDiv.classList.add('error');
    const paragraph = document.createElement('p'); paragraph.style.whiteSpace = 'pre-wrap'; // Keep existing pre-wrap
    paragraph.innerHTML = applyMarkdown(content); messageDiv.appendChild(paragraph);
    let metaDiv = null; if (role === 'assistant' && responseTime !== null && type !== 'error') { metaDiv = document.createElement('div'); metaDiv.classList.add('message-meta'); metaDiv.dataset.metaFor = messageId; metaDiv.textContent = `⏱️ ${responseTime}s`; }
    return { messageElement: messageDiv, metaElement: metaDiv };
}

function applyMarkdown(text) {
    if (typeof text !== 'string') return '';
    // Escape basic HTML tags first to prevent injection
    let escapedText = text.replace(/</g, '<').replace(/>/g, '>');

    // Handle code blocks ```...```
    const codeBlockPlaceholder = '___CODE_BLOCK___' + Math.random() + '___';
    const codeBlocks = [];
    escapedText = escapedText.replace(/```([\s\S]*?)```/gs, (match, code) => {
        // Re-escape inside code block is tricky, assume pre-formatted text
        codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
        return codeBlockPlaceholder;
    });

    // Handle bold **...**
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Handle inline code `...` - escape inside again
    escapedText = escapedText.replace(/`([^`]+)`/g, (match, code) => `<code>${code.replace(/</g, '<').replace(/>/g, '>')}</code>`);

    // Restore code blocks
    codeBlocks.forEach(block => {
        escapedText = escapedText.replace(codeBlockPlaceholder, block);
    });

    return escapedText;
}


function renderOrUpdateMessage(role, content, type = 'text', messageId, isStreaming = false) {
    let messageDiv = chatHistory.querySelector(`.message[data-message-id="${messageId}"]`); let isNew = false;
    if (!messageDiv) { isNew = true; messageDiv = document.createElement('div'); messageDiv.classList.add('message', role); messageDiv.dataset.messageId = messageId; if (type === 'error') messageDiv.classList.add('error'); const paragraph = document.createElement('p'); paragraph.style.whiteSpace = 'pre-wrap'; // Apply pre-wrap here too
        messageDiv.appendChild(paragraph); chatHistory.appendChild(messageDiv); }
    const paragraph = messageDiv.querySelector('p');
    if (isStreaming) { if (isNew && role === 'assistant') { // Show typing only for new streaming assistant messages
            paragraph.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
        } else if (role === 'assistant' && paragraph.querySelector('.typing-indicator')) { // Replace typing indicator with first chunk
            paragraph.innerHTML = applyMarkdown(content); // Apply markdown even for first chunk
        } else {
            paragraph.innerHTML = applyMarkdown(content); // Apply markdown to subsequent chunks
        }
    }
    else { paragraph.innerHTML = applyMarkdown(content); } // Final render, ensure markdown
    if (!isStreaming) { // Add meta only when streaming stops
        const existingMeta = chatHistory.querySelector(`.message-meta[data-meta-for="${messageId}"]`);
        if(existingMeta) existingMeta.remove(); // Remove any temp meta
        // Note: We'll add the final meta with time separately after the stream finishes
    }
    scrollToBottom();
}

function scrollToBottom() { setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 0); }
function showChatInterface() { welcomeScreen.classList.add('hidden'); chatInterface.classList.remove('hidden'); if (connectedAddress) userInput.focus(); }
function showWelcomeScreen(message = "Connect your wallet to begin.") { if (welcomeMessage) welcomeMessage.textContent = message; welcomeScreen.classList.remove('hidden'); chatInterface.classList.add('hidden'); }

// --- Chat Management Functions ---
function createNewChat() {
    if (!connectedAddress) { alert("Please connect your wallet first."); return; }
    // Abort any ongoing fetches
    if (abortController) abortController.abort();
    if (comparisonAbortController) comparisonAbortController.abort();

    const newChatId = `chat_${Date.now()}`;
    const newChat = { id: newChatId, title: 'New Chat', messages: [] };
    chats.unshift(newChat);
    setActiveChat(newChatId);
    saveChats(); // Save immediately after creating
}
function setActiveChat(chatId) {
    if (chatId === null) {
        activeChatId = null;
        if (connectedAddress) localStorage.removeItem(getStorageKey('aiChatLastActiveId'));
        showWelcomeScreen(`Start a new chat or select one.`);
        renderSidebar();
        return;
    }
    if (activeChatId === chatId && !chatInterface.classList.contains('hidden')) return; // Already active

    activeChatId = chatId;
    if (connectedAddress) localStorage.setItem(getStorageKey('aiChatLastActiveId'), activeChatId);
    renderSidebar();
    renderChatHistory();
    userInput.value = '';
    userInput.style.height = 'auto';
    if (chatId) {
        showChatInterface();
    } else {
        showWelcomeScreen();
    }
}
function generateChatTitle(messageContent) { const words = messageContent.split(' '); let title = words.slice(0, 5).join(' '); if (title.length > MAX_TITLE_LENGTH) title = title.substring(0, MAX_TITLE_LENGTH) + '...'; return title || "Untitled Chat"; }
function addMessageToData(chatId, role, content, type = 'text', messageId, responseTime = null) {
    const chat = chats.find(c => c.id === chatId); if (!chat) return null;
    const existingMessageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (existingMessageIndex !== -1) { // Update existing message (used for streaming or errors)
        chat.messages[existingMessageIndex].content = content;
        if(type) chat.messages[existingMessageIndex].type = type;
        if(responseTime !== null) chat.messages[existingMessageIndex].responseTime = responseTime;
    } else { // Add new message
        const newMessage = { id: messageId, role, content, type, responseTime };
        chat.messages.push(newMessage);
        // Generate title only for the *first* user message in a 'New Chat'
        if (role === 'user' && chat.title === 'New Chat' && chat.messages.filter(m => m.role === 'user').length === 1) {
            chat.title = generateChatTitle(content);
            chatTitle.textContent = chat.title; // Update header immediately
            renderSidebar(); // Update sidebar to show new title
        }
    }
    saveChats(); // Save after every message addition/update
    return messageId;
}
function handleRenameChat(chatId, listItemElement, titleSpanElement) { listItemElement.classList.add('editing'); const currentTitle = titleSpanElement.textContent; const input = document.createElement('input'); input.type = 'text'; input.value = currentTitle; input.classList.add('rename-input'); listItemElement.replaceChild(input, titleSpanElement); input.focus(); input.select(); const saveRename = () => { const newTitle = input.value.trim() || "Untitled Chat"; const chat = chats.find(c => c.id === chatId); if (chat) { chat.title = newTitle; saveChats(); if (activeChatId === chatId) chatTitle.textContent = newTitle; } listItemElement.classList.remove('editing'); renderSidebar(); // Re-render to update state
    }; const cancelRename = () => { listItemElement.classList.remove('editing'); renderSidebar(); // Re-render to cancel
    }; input.addEventListener('blur', saveRename); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } else if (e.key === 'Escape') { cancelRename(); } }); }
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
        connectedAddress = address;
        updateWalletUI(true);
        loadChats(); // Load chats specific to this wallet
        addWalletListeners();
    } catch (error) {
        console.error("Wallet connection failed:", error);
        if (error.code === 4001 || error.code === 'ACTION_REJECTED') { alert('You rejected the connection request in your wallet.'); }
        else if (error.code === -32002) { alert('Please check your wallet, a connection request is already pending.'); }
        else { alert(`Wallet connection failed: ${error.message || 'Unknown error'}`); }
        disconnectWallet(); // Reset state on failure
    }
}
function disconnectWallet() {
    console.log("Disconnecting wallet.");
    if (window.ethereum?.removeListener) { window.ethereum.removeListener('accountsChanged', handleAccountsChanged); }
    web3Provider = null; signer = null; connectedAddress = null; activeChatId = null; chats = [];
    updateWalletUI(false); showWelcomeScreen("Connect your wallet to begin."); renderSidebar();
    // Clear comparison UI state as well if needed (optional)
    // comparisonEndpoints.forEach(ep => ep.active = false);
    // renderComparisonEndpointsUI(); // Update settings UI if open
}
function updateWalletUI(isConnected) {
    const isChatActive = activeChatId !== null;
    if (isConnected && connectedAddress) {
        walletInfoDiv.classList.remove('hidden'); connectWalletBtn.classList.add('hidden');
        const truncatedAddress = `${connectedAddress.substring(0, 6)}...${connectedAddress.substring(connectedAddress.length - 4)}`;
        connectedAddressSpan.textContent = truncatedAddress; connectedAddressSpan.title = connectedAddress;
        welcomeMessage.textContent = isChatActive ? "Continue chatting or start a new chat." : "Start a new chat or select one.";
        userInput.disabled = false;
        userInput.placeholder = "Enter your message...";
        compareBtn.disabled = false; // Enable compare btn
        sendBtn.disabled = false; // Ensure send btn is enabled if wallet connected
    } else {
        walletInfoDiv.classList.add('hidden'); connectWalletBtn.classList.remove('hidden');
        connectedAddressSpan.textContent = ''; connectedAddressSpan.title = '';
        welcomeMessage.textContent = "Connect your wallet to begin.";
        userInput.disabled = true;
        userInput.placeholder = "Connect wallet to chat...";
        compareBtn.disabled = true; // Disable compare btn
        sendBtn.disabled = true; // Also disable send btn
    }
}
function handleAccountsChanged(accounts) {
    console.log("Wallet accounts changed", accounts);
    if (accounts.length === 0) { console.log('Wallet disconnected or locked.'); disconnectWallet(); }
    else if (accounts[0].toLowerCase() !== connectedAddress?.toLowerCase()) { console.log('Account changed to:', accounts[0]); disconnectWallet(); connectWallet(); }
}
function addWalletListeners() { if (window.ethereum?.on) window.ethereum.on('accountsChanged', handleAccountsChanged); }
function copyAddress() { if (connectedAddress) navigator.clipboard.writeText(connectedAddress).then(() => alert('Address copied!'), () => alert('Failed to copy address.')); }

// --- API Interaction (Single Chat) ---
async function getAIResponse() {
    if (!connectedAddress) { alert("Please connect your wallet first."); return; }
    if (!activeChatId) { alert("Please start or select a chat first."); return; }
    if (!settings.apiBaseUrl || !settings.modelName) { alert("Primary API Base URL or Model Name missing in Settings."); showSettingsModal(); return; }
    if (!settings.apiKey) { alert("Primary API Key missing in Settings."); showSettingsModal(); return; } // Keep API key check for primary endpoint

    const userMessageContent = userInput.value.trim(); if (!userMessageContent) return;

    // Cancel any previous single fetch, but not comparison fetch
    if (abortController) { abortController.abort(); console.log("Previous single fetch aborted."); }
    abortController = new AbortController();
    const startTime = Date.now();

    const userMessageId = `msg_${Date.now()}`;
    addMessageToData(activeChatId, 'user', userMessageContent, 'text', userMessageId);
    const { messageElement: userMsgEl, metaElement: userMetaEl } = createMessageElement('user', userMessageContent, 'text', userMessageId);
    if (userMsgEl) chatHistory.appendChild(userMsgEl);
    if (userMetaEl) chatHistory.appendChild(userMetaEl);
    scrollToBottom();

    userInput.value = ''; userInput.style.height = 'auto';
    sendBtn.disabled = true; compareBtn.disabled = true; // Disable both buttons during fetch
    userInput.disabled = true;

    const assistantMessageId = `msg_${Date.now() + 1}`;
    let assistantContent = '';
    addMessageToData(activeChatId, 'assistant', '', 'text', assistantMessageId); // Add placeholder
    renderOrUpdateMessage('assistant', '', 'text', assistantMessageId, true); // Show typing indicator

    let apiEndpointFull = settings.apiBaseUrl;
    if (apiEndpointFull.endsWith('/')) apiEndpointFull = apiEndpointFull.slice(0, -1);
    if (!apiEndpointFull.endsWith(CHAT_COMPLETIONS_PATH)) apiEndpointFull += CHAT_COMPLETIONS_PATH;

    const currentChat = chats.find(chat => chat.id === activeChatId);
    let messagesToSend = currentChat ? currentChat.messages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && m.type !== 'error')) // Exclude empty/error assistant messages
        .map(m => ({ role: m.role, content: m.content }))
        : [];
    if (settings.systemPrompt) messagesToSend.unshift({ role: 'system', content: settings.systemPrompt });

    // Ensure the last message is the user's current input
    const lastMessage = messagesToSend[messagesToSend.length - 1];
    if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== userMessageContent) {
         // This case shouldn't happen with current logic, but as a safeguard
         console.warn("Repushing user message to ensure it's last.");
         messagesToSend = messagesToSend.filter(m => m.id !== userMessageId); // Remove potential duplicates if logic error
         messagesToSend.push({ role: 'user', content: userMessageContent });
    }

    const payload = {
        model: settings.modelName,
        messages: messagesToSend,
        stream: true,
        temperature: settings.temperature,
        top_p: settings.top_p,
        presence_penalty: settings.presence_penalty,
        frequency_penalty: settings.frequency_penalty
    };
    console.log("Sending Single API Payload:", payload);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (settings.apiKey) { headers['Authorization'] = `Bearer ${settings.apiKey}`; }

        const response = await fetch(apiEndpointFull, { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: abortController.signal });

        if (!response.ok) {
            let errorBodyText = await response.text(); let errorJson = null;
            try { errorJson = JSON.parse(errorBodyText); } catch (e) {}
            console.error("API Error:", response.status, response.statusText, errorJson || errorBodyText);
            const errorMessage = errorJson?.error?.message || errorJson?.detail || errorBodyText || `Request failed with status ${response.status}`;
            throw new Error(`API Error: ${response.status} - ${errorMessage}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last partial line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataJson = line.substring(6).trim();
                    if (dataJson === '[DONE]') {
                        // console.log("Stream finished marker received.");
                        break; // Exit inner loop, outer loop will check 'done'
                    }
                    try {
                        const chunk = JSON.parse(dataJson);
                        const deltaContent = chunk.choices?.[0]?.delta?.content;
                        if (deltaContent) {
                            assistantContent += deltaContent;
                            // Update the placeholder message with real content
                            addMessageToData(activeChatId, 'assistant', assistantContent, 'text', assistantMessageId);
                            renderOrUpdateMessage('assistant', assistantContent, 'text', assistantMessageId, true); // Keep streaming flag true
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk:', e, 'Data:', dataJson);
                        // Decide how to handle chunk errors, maybe ignore?
                    }
                }
            }
             if (abortController.signal.aborted) {
                throw new Error('Fetch aborted');
            }
        }

        // Stream finished successfully
        const endTime = Date.now();
        const responseTime = ((endTime - startTime) / 1000).toFixed(2);

        // Final update to message data and UI
        addMessageToData(activeChatId, 'assistant', assistantContent, 'text', assistantMessageId, responseTime);
        renderOrUpdateMessage('assistant', assistantContent, 'text', assistantMessageId, false); // Final render

        // Add the meta element with timing
        const finalMsgElement = chatHistory.querySelector(`.message[data-message-id="${assistantMessageId}"]`);
        const { metaElement: finalMetaEl } = createMessageElement('assistant', '', 'text', assistantMessageId, responseTime);
        if(finalMsgElement && finalMetaEl) {
            const existingMeta = chatHistory.querySelector(`.message-meta[data-meta-for="${assistantMessageId}"]`);
            if (!existingMeta) finalMsgElement.insertAdjacentElement('afterend', finalMetaEl);
        }
        scrollToBottom(); // Ensure scrolled down after adding meta

    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'Fetch aborted') {
            console.log('Single fetch aborted by user.');
            // Remove the placeholder assistant message
            const failedMsgElement = chatHistory.querySelector(`.message[data-message-id="${assistantMessageId}"]`);
            if (failedMsgElement) failedMsgElement.remove();
            const chat = chats.find(c => c.id === activeChatId);
            if(chat) chat.messages = chat.messages.filter(m => m.id !== assistantMessageId);
            saveChats();
        } else {
            console.error("Single Streaming Fetch Error:", error);
            const errorMsg = `⚠️ Error: ${error.message}. Check console/settings.`;
            addMessageToData(activeChatId, 'assistant', errorMsg, 'error', assistantMessageId);
            renderOrUpdateMessage('assistant', errorMsg, 'error', assistantMessageId, false); // Render error message finally
        }
    } finally {
        sendBtn.disabled = !connectedAddress; // Re-enable based on wallet connection
        compareBtn.disabled = !connectedAddress;
        userInput.disabled = !connectedAddress;
        if (connectedAddress) userInput.focus();
        abortController = null; // Clear controller
    }
}


// --- ADDED: API Interaction (Comparison) ---

async function getComparisonResponses() {
    if (!connectedAddress) { alert("Please connect your wallet first."); return; }
    if (!activeChatId) { alert("Please start or select a chat first for context."); return; }

    const userMessageContent = userInput.value.trim();
    if (!userMessageContent) return;

    const activeEndpoints = comparisonEndpoints.filter(ep => ep.active && ep.url && ep.model);
    if (activeEndpoints.length === 0) {
        alert("No active comparison endpoints configured or selected in Settings. Please configure at least one.");
        showSettingsModal();
        return;
    }
    if (activeEndpoints.length > MAX_COMPARISON_ENDPOINTS) {
        alert(`You have selected more than ${MAX_COMPARISON_ENDPOINTS} endpoints. Please de-select some in Settings.`);
        showSettingsModal();
        return;
    }

    // Cancel any previous comparison fetch
    if (comparisonAbortController) { comparisonAbortController.abort(); console.log("Previous comparison fetch aborted."); }
    comparisonAbortController = new AbortController();

    // 1. Add User Message to Chat Data & UI
    const userMessageId = `msg_${Date.now()}`;
    addMessageToData(activeChatId, 'user', userMessageContent, 'text', userMessageId);
    const { messageElement: userMsgEl, metaElement: userMetaEl } = createMessageElement('user', userMessageContent, 'text', userMessageId);
    if (userMsgEl) chatHistory.appendChild(userMsgEl);
    if (userMetaEl) chatHistory.appendChild(userMetaEl);
    scrollToBottom();
    userInput.value = ''; userInput.style.height = 'auto';

    // Disable inputs
    sendBtn.disabled = true; compareBtn.disabled = true; userInput.disabled = true;

    // 2. Create Comparison UI Container
    const comparisonContainerId = `comp_${Date.now()}`;
    const comparisonContainer = document.createElement('div');
    comparisonContainer.classList.add('comparison-container');
    comparisonContainer.dataset.comparisonId = comparisonContainerId;

    const comparisonTitle = document.createElement('h4');
    comparisonTitle.textContent = `Comparing ${activeEndpoints.length} Endpoint(s):`;
    comparisonContainer.appendChild(comparisonTitle);

    const resultsGrid = document.createElement('div');
    resultsGrid.classList.add('comparison-results-grid');
    // Set grid columns based on number of active endpoints
    resultsGrid.style.gridTemplateColumns = `repeat(${activeEndpoints.length}, 1fr)`;
    comparisonContainer.appendChild(resultsGrid);

    chatHistory.appendChild(comparisonContainer);
    scrollToBottom();

    // 3. Prepare Messages (similar to single chat, but without system prompt for comparison for simplicity)
    const currentChat = chats.find(chat => chat.id === activeChatId);
    let messagesToSend = currentChat ? currentChat.messages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && m.type !== 'error'))
        .map(m => ({ role: m.role, content: m.content }))
        : [];
    // Ensure user message is last (it should be, after adding it above)
    if (!messagesToSend.length || messagesToSend[messagesToSend.length - 1].content !== userMessageContent) {
        console.warn("Comparison messages potentially incorrect. Re-adding user message.");
        messagesToSend.push({ role: 'user', content: userMessageContent });
    }


    // 4. Fetch Responses Sequentially (to avoid DDOS)
    for (const endpoint of activeEndpoints) {
        if (comparisonAbortController.signal.aborted) {
             console.log("Comparison fetch aborted by user during loop.");
             break; // Exit loop if aborted
        }

        const column = document.createElement('div');
        column.classList.add('comparison-column');
        resultsGrid.appendChild(column);

        const header = document.createElement('div');
        header.classList.add('comparison-column-header');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('endpoint-name');
        nameSpan.textContent = endpoint.name || endpoint.url; // Display name or URL
        nameSpan.title = `${endpoint.model} @ ${endpoint.url}`;
        const timeSpan = document.createElement('span');
        timeSpan.classList.add('endpoint-time');
        timeSpan.textContent = '⏱️ --s';
        header.appendChild(nameSpan);
        header.appendChild(timeSpan);
        column.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('comparison-column-content');
        contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>'; // Initial typing indicator
        column.appendChild(contentDiv);
        scrollToBottom(); // Scroll as columns are added

        const startTime = Date.now();

        try {
            await fetchStreamedResponseForComparison(
                endpoint,
                messagesToSend,
                contentDiv, // Target element for content
                timeSpan,  // Target element for time update
                startTime,
                comparisonAbortController.signal // Pass the signal
            );
        } catch (error) {
             if (error.name === 'AbortError' || error.message === 'Fetch aborted') {
                console.log(`Fetch aborted for endpoint: ${endpoint.name}`);
                contentDiv.innerHTML = `<div class="error-message">⚠️ Aborted by user.</div>`;
                timeSpan.textContent = '⏱️ --s';
                // If global abort, break outer loop in the next iteration check
            } else {
                console.error(`Error fetching from ${endpoint.name}:`, error);
                contentDiv.innerHTML = `<div class="error-message">⚠️ Error: ${error.message}. Check console.</div>`;
                timeSpan.textContent = '⏱️ Error';
            }
        }
    } // End of loop through endpoints

    // 5. Re-enable inputs if not aborted globally
    if (!comparisonAbortController?.signal.aborted) {
        sendBtn.disabled = !connectedAddress;
        compareBtn.disabled = !connectedAddress;
        userInput.disabled = !connectedAddress;
        if (connectedAddress) userInput.focus();
        comparisonAbortController = null; // Clear controller after completion/error
    } else {
        // If aborted, buttons might already be re-enabled by setActiveChat or disconnectWallet
        console.log("Comparison process was aborted. Inputs might remain disabled if still on same chat.");
        // Optionally force re-enable if needed, based on wallet status
        // sendBtn.disabled = !connectedAddress;
        // compareBtn.disabled = !connectedAddress;
        // userInput.disabled = !connectedAddress;
        comparisonAbortController = null; // Clear controller
    }

    // Note: Comparison results are currently only displayed visually and not saved persistently in the chat history data structure.
}


// ADDED: Helper function for comparison streaming
async function fetchStreamedResponseForComparison(endpointConfig, messages, targetContentElement, targetTimeElement, startTime, signal) {
    let fullUrl = endpointConfig.url;
    if (fullUrl.endsWith('/')) fullUrl = fullUrl.slice(0, -1);
    if (!fullUrl.endsWith(CHAT_COMPLETIONS_PATH)) fullUrl += CHAT_COMPLETIONS_PATH;

    const payload = {
        model: endpointConfig.model,
        messages: messages,
        stream: true,
        // Use fixed/default parameters for comparison simplicity, or make configurable later
        temperature: 0.7,
        top_p: 1.0,
    };

    const headers = { 'Content-Type': 'application/json' };
    // Use endpoint-specific key if provided, otherwise fallback to global? (Current logic: only use endpoint key)
    if (endpointConfig.key) {
        headers['Authorization'] = `Bearer ${endpointConfig.key}`;
    } else if (settings.apiKey) {
        // Optional: Fallback to global key if endpoint key is missing
        // console.warn(`Using global API key for comparison endpoint ${endpointConfig.name} as it has no specific key.`);
        // headers['Authorization'] = `Bearer ${settings.apiKey}`;
        // OR stricter: require key per comparison endpoint
         console.warn(`No API key found for comparison endpoint ${endpointConfig.name}. Request might fail.`);
    }


    console.log(`Sending Comparison Payload to ${endpointConfig.name}:`, payload);
    targetContentElement.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>'; // Reset to typing

    const response = await fetch(fullUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: signal // Use the passed signal
    });

    if (!response.ok) {
        let errorBodyText = await response.text(); let errorJson = null;
        try { errorJson = JSON.parse(errorBodyText); } catch (e) {}
        console.error(`API Error from ${endpointConfig.name}:`, response.status, response.statusText, errorJson || errorBodyText);
        const errorMessage = errorJson?.error?.message || errorJson?.detail || errorBodyText || `Request failed with status ${response.status}`;
        throw new Error(`${response.status} - ${errorMessage}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let isFirstChunk = true;

    while (true) {
        if (signal.aborted) throw new Error('Fetch aborted'); // Check signal frequently

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataJson = line.substring(6).trim();
                if (dataJson === '[DONE]') break; // Exit inner loop
                try {
                    const chunk = JSON.parse(dataJson);
                    const deltaContent = chunk.choices?.[0]?.delta?.content;
                    if (deltaContent) {
                        fullContent += deltaContent;
                        // Update UI progressively - use applyMarkdown here too
                        targetContentElement.innerHTML = applyMarkdown(fullContent);
                        if (isFirstChunk) { isFirstChunk = false; } // Remove typing indicator implicitly
                        scrollToBottom(); // Ensure scroll follows content
                    }
                } catch (e) {
                    console.error(`Error parsing stream chunk from ${endpointConfig.name}:`, e, 'Data:', dataJson);
                }
            }
        }
         if (signal.aborted) throw new Error('Fetch aborted'); // Check after processing chunk
    }

    // Stream finished for this endpoint
    const endTime = Date.now();
    const responseTime = ((endTime - startTime) / 1000).toFixed(2);
    targetTimeElement.textContent = `⏱️ ${responseTime}s`;
    // Final render to ensure everything is correct
    targetContentElement.innerHTML = applyMarkdown(fullContent);
}


// --- Settings Modal Logic ---
function showSettingsModal() {
    const requiredInputs = [apiKeyInput, apiEndpointInput, modelNameInput, systemPromptInput, temperatureInput, topPInput, presencePenaltyInput, frequencyPenaltyInput];
    if (requiredInputs.some(el => !el)) { console.error("Settings input elements not found!"); alert("Error: Settings panel elements missing."); return; }
    // Populate primary settings
    apiKeyInput.value = settings.apiKey || '';
    apiEndpointInput.value = settings.apiBaseUrl || '';
    modelNameInput.value = settings.modelName || '';
    systemPromptInput.value = settings.systemPrompt || '';
    temperatureInput.value = settings.temperature.toFixed(1);
    topPInput.value = settings.top_p.toFixed(1);
    presencePenaltyInput.value = settings.presence_penalty.toFixed(1);
    frequencyPenaltyInput.value = settings.frequency_penalty.toFixed(1);

    // ADDED: Populate comparison endpoints
    renderComparisonEndpointsUI();

    settingsModal.classList.remove('hidden');
}
function hideSettingsModal() { settingsModal.classList.add('hidden'); }

// --- ADDED: Comparison Endpoint Settings UI Management ---

function renderComparisonEndpointsUI() {
    if (!comparisonEndpointList) return;
    comparisonEndpointList.innerHTML = ''; // Clear existing list

    if (comparisonEndpoints.length === 0) {
        comparisonEndpointList.innerHTML = '<p>No comparison endpoints added yet.</p>';
    } else {
        comparisonEndpoints.forEach((endpoint, index) => {
            const item = createComparisonEndpointElement(endpoint, index);
            comparisonEndpointList.appendChild(item);
        });
    }
    updateActiveCheckboxStates(); // Ensure max 3 rule is visually enforced
}

function createComparisonEndpointElement(endpoint, index) {
    const div = document.createElement('div');
    div.classList.add('comparison-endpoint-item');
    div.dataset.endpointId = endpoint.id; // Use persistent ID

    // Column 1: Checkbox
    const col1 = document.createElement('div');
    col1.classList.add('endpoint-item-col1');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('activate-endpoint-cb');
    checkbox.checked = endpoint.active;
    checkbox.title = 'Activate for comparison (max 3)';
    checkbox.addEventListener('change', handleActivateCheckboxChange);
    col1.appendChild(checkbox);

    // Column 2: Fields
    const col2 = document.createElement('div');
    col2.classList.add('endpoint-item-col2');
    const fieldsDiv = document.createElement('div');
    fieldsDiv.classList.add('endpoint-item-fields');

    fieldsDiv.innerHTML = `
        <div>
            <label>Name:</label>
            <input type="text" class="endpoint-name-input" value="${endpoint.name}" placeholder="My Llama Node">
        </div>
        <div>
            <label>URL:</label>
            <input type="url" class="endpoint-url-input" value="${endpoint.url}" placeholder="https://your-node.com/v1">
        </div>
        <div>
            <label>API Key (Optional):</label>
            <input type="password" class="endpoint-key-input" value="${endpoint.key}" placeholder="Optional Key">
        </div>
        <div>
            <label>Model:</label>
            <input type="text" class="endpoint-model-input" value="${endpoint.model}" placeholder="llama-3-70b-instruct">
        </div>
    `;
    col2.appendChild(fieldsDiv);

    // Column 3: Delete Button
    const col3 = document.createElement('div');
    col3.classList.add('endpoint-item-col3');
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('small-btn');
    deleteBtn.innerHTML = '🗑️ Delete';
    deleteBtn.title = 'Delete this endpoint';
    deleteBtn.addEventListener('click', () => removeComparisonEndpoint(endpoint.id));
    col3.appendChild(deleteBtn);

    div.appendChild(col1);
    div.appendChild(col2);
    div.appendChild(col3);

    return div;
}

function addComparisonEndpointUI() {
    const newEndpoint = {
        id: `comp_ep_${Date.now()}_${Math.random()}`, // Unique ID
        name: `Endpoint ${comparisonEndpoints.length + 1}`,
        url: '',
        key: '',
        model: '',
        active: false
    };
    comparisonEndpoints.push(newEndpoint);
    renderComparisonEndpointsUI(); // Re-render the list
}

function removeComparisonEndpoint(endpointId) {
    if (confirm('Are you sure you want to delete this comparison endpoint?')) {
        comparisonEndpoints = comparisonEndpoints.filter(ep => ep.id !== endpointId);
        renderComparisonEndpointsUI(); // Re-render the list
    }
}

function handleActivateCheckboxChange() {
    // Count currently checked boxes
    const checkboxes = comparisonEndpointList.querySelectorAll('.activate-endpoint-cb');
    let checkedCount = 0;
    checkboxes.forEach(cb => { if (cb.checked) checkedCount++; });

    if (checkedCount > MAX_COMPARISON_ENDPOINTS) {
        alert(`You can only select up to ${MAX_COMPARISON_ENDPOINTS} endpoints for comparison.`);
        this.checked = false; // Revert the change
    }
    updateActiveCheckboxStates(); // Update disabled state of others
}

function updateActiveCheckboxStates() {
    const checkboxes = comparisonEndpointList.querySelectorAll('.activate-endpoint-cb');
    let checkedCount = 0;
    checkboxes.forEach(cb => { if (cb.checked) checkedCount++; });

    checkboxes.forEach(cb => {
        if (!cb.checked && checkedCount >= MAX_COMPARISON_ENDPOINTS) {
            cb.disabled = true;
            cb.title = `Disable another endpoint to activate this one (max ${MAX_COMPARISON_ENDPOINTS})`;
        } else {
            cb.disabled = false;
            cb.title = 'Activate for comparison (max 3)';
        }
    });
}

function updateComparisonEndpointsFromUI() {
    const items = comparisonEndpointList.querySelectorAll('.comparison-endpoint-item');
    const updatedEndpoints = [];
    items.forEach(item => {
        const id = item.dataset.endpointId;
        const name = item.querySelector('.endpoint-name-input')?.value.trim() || 'Untitled Endpoint';
        const url = item.querySelector('.endpoint-url-input')?.value.trim() || '';
        const key = item.querySelector('.endpoint-key-input')?.value.trim() || ''; // Don't trim password unnecessarily, but okay here
        const model = item.querySelector('.endpoint-model-input')?.value.trim() || '';
        const active = item.querySelector('.activate-endpoint-cb')?.checked || false;
        updatedEndpoints.push({ id, name, url, key, model, active });
    });
    comparisonEndpoints = updatedEndpoints; // Update the main state array
}


// --- Auto-resize Textarea ---
userInput.addEventListener('input', () => { userInput.style.height = 'auto'; const maxHeight = 150; const scrollHeight = userInput.scrollHeight; userInput.style.height = Math.min(scrollHeight, maxHeight) + 'px'; });

// --- Event Listeners ---
newChatBtn.addEventListener('click', createNewChat);
sendBtn.addEventListener('click', getAIResponse);
compareBtn.addEventListener('click', getComparisonResponses); // ADDED
userInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); getAIResponse(); // Default action is 'Send'
    } // Consider adding Ctrl+Enter for Compare? Maybe too complex.
});
settingsBtn.addEventListener('click', showSettingsModal);
closeSettingsBtn.addEventListener('click', hideSettingsModal);
saveSettingsBtn.addEventListener('click', saveSettings);
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) hideSettingsModal(); });
connectWalletBtn.addEventListener('click', connectWallet);
disconnectWalletBtn.addEventListener('click', disconnectWallet);
connectedAddressSpan.addEventListener('click', copyAddress);
addComparisonEndpointBtn.addEventListener('click', addComparisonEndpointUI); // ADDED

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing chat...");
    loadSettings();
    updateWalletUI(false);
    showWelcomeScreen();
    userInput.disabled = true;
    userInput.placeholder = "Connect wallet to chat...";
    compareBtn.disabled = true;
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';

});