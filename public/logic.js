// logic.js - Core application logic for Varmudio

// --- STATE ---
let conversations = [];
let currentConversationId = null;
let currentAttachment = null;
let currentModel = 'auto';
let mediaRecorder = null;
let isRecording = false;
let isGenerating = false;
let abortController = null;
let tools = {
    webSearch: false,
    thinking: false,
    imageGen: false
};
let systemPrompt = "You are Varmudio, a helpful AI assistant.";
let temperature = 0.7;
let maxTokens = 4096;

const GREETINGS_LIST = [
    { hello: "Hello there", main: "What can I help you with today?" },
    { hello: "Hi Parithosh", main: "Where should we start?" },
    { hello: "Welcome back", main: "What's on your mind?" },
    { hello: "Good to see you", main: "Ready to explore some ideas?" },
    { hello: "Greetings", main: "How can I assist you right now?" },
    { hello: "Hey", main: "What are we building today?" }
];

// --- DOM ELEMENTS ---
const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatContainer = document.getElementById('chat-container');
const messagesWrapper = document.getElementById('messages-wrapper');
const chatMessagesDiv = document.getElementById('chat-messages');
const emptyState = document.getElementById('empty-state');
const conversationList = document.getElementById('conversation-list');
const modelDropdown = document.getElementById('model-dropdown');
const currentModelName = document.getElementById('current-model-name');
const attachmentPreview = document.getElementById('attachment-preview');
const previewImg = document.getElementById('preview-img');

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize marked options
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // Load Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    loadState();
    loadModels();
    fetchChats();

    // Auto-resize input
    inputField.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        updateSendButton();
    });

    setRandomGreeting();

    // Init mobile sidebar state
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
    }
});

function updateSendButton() {
    sendBtn.disabled = inputField.value.trim() === '' && !currentAttachment;
}

function setRandomGreeting() {
    const greeting = GREETINGS_LIST[Math.floor(Math.random() * GREETINGS_LIST.length)];
    const helloEl = document.getElementById('greeting-hello');
    const mainEl = document.getElementById('greeting-main');
    if (helloEl) helloEl.textContent = greeting.hello;
    if (mainEl) mainEl.textContent = greeting.main;
}

// --- API & DATA ---

async function fetchChats() {
    try {
        const res = await fetch('/api/chats');
        if (res.ok) {
            conversations = await res.json();
            renderConversations();

            // Reload last active chat or new chat
            const lastActiveId = localStorage.getItem('lastActiveChatId');
            if (lastActiveId && conversations.find(c => c.id === lastActiveId)) {
                loadChat(lastActiveId);
            } else if (conversations.length > 0) {
                // Optionally load first chat, or stay on empty state
                // loadChat(conversations[0].id);
            }
        }
    } catch (e) {
        console.error("Failed to fetch chats", e);
    }
}

async function loadChat(chatId) {
    currentConversationId = chatId;
    localStorage.setItem('lastActiveChatId', chatId);

    try {
        const res = await fetch(`/api/chats/${chatId}/messages`);
        if (res.ok) {
            const messages = await res.json();
            const chat = conversations.find(c => c.id === chatId);
            if (chat) {
                currentModel = chat.model || 'auto';
                updateModelDisplay();
            }

            // Render Messages
            emptyState.classList.add('hidden');
            messagesWrapper.classList.remove('hidden');
            chatMessagesDiv.innerHTML = '';

            messages.forEach(msg => {
                appendMessageToDOM(msg.role, msg.content, msg.image_url);
            });

            scrollToBottom();
            renderConversations(); // Update active state in sidebar
        }
    } catch (e) {
        console.error("Failed to load chat", e);
    }
}

async function createNewChat() {
    if (currentConversationId && chatMessagesDiv.children.length === 0) return; // Already in empty chat

    currentConversationId = null;
    chatMessagesDiv.innerHTML = '';
    emptyState.classList.remove('hidden');
    messagesWrapper.classList.add('hidden');
    inputField.value = '';
    inputField.style.height = 'auto';
    clearAttachment();
    renderConversations();
    setRandomGreeting();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('visible');
    }
}

function loadChatWrapper(chatId) {
    loadChat(chatId);
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('visible');
    }
}

async function sendMessage() {
    const text = inputField.value.trim();
    if (!text && !currentAttachment) return;
    if (isGenerating) return;

    // Check for commands
    if (text.startsWith('/image')) {
        handleImageCommand(text);
        inputField.value = '';
        updateSendButton();
        return;
    }

    inputField.value = '';
    inputField.style.height = 'auto';
    updateSendButton();

    // UI State
    emptyState.classList.add('hidden');
    messagesWrapper.classList.remove('hidden');

    // Ensure Chat ID exists
    if (!currentConversationId) {
        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'New Chat', // Will be auto-titled later
                    model: currentModel
                })
            });
            const newChat = await res.json();
            conversations.unshift(newChat);
            currentConversationId = newChat.id;
            localStorage.setItem('lastActiveChatId', currentConversationId);
            renderConversations();
        } catch (e) {
            console.error("Failed to create chat", e);
            showToast("Error starting chat");
            return;
        }
    }

    // Optimistic Render User Message
    const userImage = currentAttachment;
    clearAttachment();
    appendMessageToDOM('user', text, userImage);
    scrollToBottom();

    // Save User Message
    await saveMessage('user', text, userImage, currentConversationId);

    // Stream Response
    await streamResponse(text, userImage, currentConversationId);
}

async function saveMessage(role, content, image_url, chatId) {
    try {
        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, role, content, image_url })
        });
    } catch (e) { console.error("Failed to save message", e); }
}

async function streamResponse(userText, userImage, chatId) {
    isGenerating = true;
    sendBtn.disabled = true;

    // Create Assistant Message Placeholder
    const msgId = 'msg-' + Date.now();
    const contentDiv = appendMessageToDOM('assistant', '', null, msgId);

    // Setup Context
    const history = []; // Fetch from DOM or memory if needed context window logic
    // For now simple prompt + user msg

    // Determine Model
    let effectiveModel = currentModel;
    if (currentModel === 'auto') {
        // Simple client-side heuristic or rely on server 'auto' logic
        effectiveModel = 'auto';
    }

    const apiMessages = [
        { role: "system", content: systemPrompt },
        // Ideally load context here from `conversations`. For now we send just the new message for stateless demo or simple context
        // Real implementation should pass full history.
        { role: "user", content: userText } // simplified
    ];

    // If image exists
    if (userImage) {
        apiMessages[apiMessages.length - 1] = {
            role: "user",
            content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: userImage } }
            ]
        };
        effectiveModel = 'llama-3.2-11b-vision-preview'; // Force vision model
    }

    abortController = new AbortController();
    let assistantText = "";

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: apiMessages,
                model: effectiveModel,
                temperature: parseFloat(temperature),
                max_tokens: parseInt(maxTokens),
                stream: true // Try streaming first
            }),
            signal: abortController.signal
        });

        // Check if response is JSON (Netlify might have returned the full body at once)
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            assistantText = data.content || "";
            contentDiv.innerHTML = marked.parse(assistantText);
            contentDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
            scrollToBottom();
        } else {
            // Handle Stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '');
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.content) {
                                assistantText += data.content;
                                contentDiv.innerHTML = marked.parse(assistantText);
                                contentDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                                scrollToBottom();
                            }
                        } catch (e) { }
                    }
                }
            }
        }

        await saveMessage('assistant', assistantText, null, chatId);

        // Generate Title if new chat
        const chat = conversations.find(c => c.id === chatId);
        if (chat && chat.title === 'New Chat') {
            generateTitle(userText, chatId);
        }

    } catch (err) {
        console.error("Stream error", err);
        alert("Server Error: " + err.message);
        contentDiv.innerHTML += `<br>[Error: ${err.message}]`;
    } finally {
        isGenerating = false;
        abortController = null;
        updateSendButton();
    }
}

async function generateTitle(text, chatId) {
    try {
        const res = await fetch('/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, chat_id: chatId })
        });
        const data = await res.json();
        if (data.title) {
            const chat = conversations.find(c => c.id === chatId);
            if (chat) chat.title = data.title;
            renderConversations();
        }
    } catch (e) { }
}

// --- UI RENDERING ---

function appendMessageToDOM(role, text, image, id = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    if (id) msgDiv.id = id;

    const icon = role === 'user' ? 'U' : 'AI'; // Or use lucide icons
    const bgColor = role === 'user' ? 'var(--bg-user-msg)' : 'transparent';

    let contentHtml = `<div class="prose">${marked ? marked.parse(text || '') : text}</div>`;
    if (image) {
        contentHtml = `<img src="${image}" style="max-width:100%; border-radius:8px; margin-bottom:8px;">` + contentHtml;
    }

    msgDiv.innerHTML = `
        <div class="message-header">
            <div class="message-avatar">${role === 'user' ? '<i data-lucide="user" style="width:16px;"></i>' : '<img src="/updated.png" style="width:100%;height:100%;border-radius:50%;">'}</div>
            <span class="message-role">${role === 'user' ? 'You' : 'varmudio'}</span>
        </div>
        <div class="message-content">
            ${contentHtml}
        </div>
    `;

    chatMessagesDiv.appendChild(msgDiv);

    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (typeof hljs !== 'undefined') {
        msgDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    }

    return msgDiv.querySelector('.prose'); // Return content container for streaming updates
}

function renderConversations() {
    conversationList.innerHTML = '';

    // Sort by updated_at desc
    const sortedChats = [...conversations].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

    sortedChats.forEach(chat => {
        const div = document.createElement('div');
        div.className = `conversation-item ${chat.id === currentConversationId ? 'active' : ''}`;
        div.textContent = chat.title || 'New Chat';
        div.onclick = () => loadChatWrapper(chat.id);

        // Delete button
        const del = document.createElement('button');
        del.innerHTML = '&times;';
        del.style.marginLeft = 'auto';
        del.style.background = 'transparent';
        del.style.border = 'none';
        del.style.cursor = 'pointer';
        del.onclick = (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        }
        div.appendChild(del);

        conversationList.appendChild(div);
    });
}

function renderModelsDropdown() {
    // Uses MODEL_CATEGORIES from models-config.js if available
    if (typeof MODEL_CATEGORIES === 'undefined') return;

    const dropdown = document.getElementById('model-dropdown');
    dropdown.innerHTML = '';

    MODEL_CATEGORIES.forEach(cat => {
        const header = document.createElement('div');
        header.style.padding = '4px 12px';
        header.style.fontSize = '10px';
        header.style.fontWeight = 'bold';
        header.style.color = 'var(--text-muted)';
        header.style.textTransform = 'uppercase';
        header.textContent = cat.name;
        dropdown.appendChild(header);

        cat.models.forEach(mid => {
            const mConfig = MODEL_CONFIG[mid];
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            if (currentModel === mid) item.style.backgroundColor = 'var(--bg-hover)';
            item.innerHTML = `<span>${mConfig.name}</span>`;
            item.onclick = () => {
                selectModel(mid);
            };
            dropdown.appendChild(item);
        });
    });
}

async function handleImageCommand(text) {
    const prompt = text.replace('/image', '').trim();
    if (!prompt) {
        showToast('Please provide an image description');
        return;
    }

    // Ensure chat exists
    if (!currentConversationId) {
        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Image Generation', model: currentModel })
            });
            const newChat = await res.json();
            conversations.unshift(newChat);
            currentConversationId = newChat.id;
            localStorage.setItem('lastActiveChatId', currentConversationId);
            renderConversations();
        } catch (e) {
            console.error("Failed to create chat", e);
            showToast("Error starting chat");
            return;
        }
    }

    // UI State
    emptyState.classList.add('hidden');
    messagesWrapper.classList.remove('hidden');

    // UI Feedback
    appendMessageToDOM('user', `/image ${prompt}`);
    const msgId = 'msg-' + Date.now();
    const contentDiv = appendMessageToDOM('assistant', '', null, msgId);

    // Add animated loading indicator
    contentDiv.innerHTML = `
        <div class="image-loading">
            <div class="image-loading-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" opacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                </svg>
            </div>
            <div class="image-loading-text">
                <span class="image-loading-title">🎨 Generating with Gemini</span>
                <span class="image-loading-subtitle">"${prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt}"</span>
            </div>
            <div class="image-loading-progress">
                <div class="image-loading-bar"></div>
            </div>
        </div>
    `;
    scrollToBottom();

    try {
        // Use Puter.ai with Gemini 2.5 Flash Image Preview
        if (typeof puter !== 'undefined' && puter.ai && puter.ai.txt2img) {
            const img = await puter.ai.txt2img(prompt, { model: 'gemini-2.5-flash-image-preview' });

            // Clear loading message and append image
            contentDiv.innerHTML = '';
            contentDiv.appendChild(img);
            img.style.maxWidth = '100%';
            img.style.borderRadius = '12px';
            img.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';

            showToast('✨ Image generated successfully!');

            // Save to chat history (the image is a blob URL, we'll save a placeholder)
            await saveMessage('user', `/image ${prompt}`, null, currentConversationId);
            await saveMessage('assistant', `🎨 Generated image for: "${prompt}"`, null, currentConversationId);
        } else {
            throw new Error('Puter.ai not available');
        }
    } catch (e) {
        console.error('Image generation error:', e);
        contentDiv.innerHTML = '❌ Failed to generate image. Please try again.';
        showToast('Image generation failed');
    }
}

function toggleTool(toolName) {
    if (toolName === 'imageGen') {
        inputField.value = '/image ';
        inputField.focus();
    }
    // Close dropdown regardless
    const dropdown = document.getElementById('tools-dropdown');
    if (dropdown) dropdown.classList.remove('show');

    // Simple alert or status for now
    if (toolName !== 'imageGen') {
        showToast(`Tool ${toolName} selected`);
    }
}

function toggleToolsDropdown() {
    const dropdown = document.getElementById('tools-dropdown');
    dropdown.classList.toggle('show');
}

// --- UTILS ---

function loadModels() {
    // Assuming models-config.js defines MODEL_CATEGORIES global
    renderModelsDropdown();
    updateModelDisplay();
}

function selectModel(modelId) {
    currentModel = modelId;
    updateModelDisplay();
    // Close dropdown
    document.getElementById('model-dropdown').classList.remove('show');
}

function toggleModelDropdown() {
    document.getElementById('model-dropdown').classList.toggle('show');
}

function updateModelDisplay() {
    if (typeof MODEL_CONFIG !== 'undefined' && MODEL_CONFIG[currentModel]) {
        currentModelName.textContent = MODEL_CONFIG[currentModel].name;
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentAttachment = e.target.result;
            previewImg.src = currentAttachment;
            attachmentPreview.classList.add('visible');
            updateSendButton();
        };
        reader.readAsDataURL(file);
    }
}

function removeAttachment() {
    currentAttachment = null;
    attachmentPreview.classList.remove('visible');
    document.getElementById('image-upload').value = '';
    updateSendButton();
}

function clearAttachment() {
    removeAttachment();
}

function toggleVoice() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream);
        let chunks = [];

        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'recording.webm');

            showToast('Transcribing...');
            try {
                const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.text) {
                    inputField.value += (inputField.value ? ' ' : '') + data.text;
                    updateSendButton();
                }
            } catch (e) { console.error(e); }
        };

        mediaRecorder.start();
        isRecording = true;
        document.getElementById('voice-btn').style.color = 'red';
        showToast('Listening...');
    }).catch(e => showToast('Mic access denied'));
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('voice-btn').style.color = '';
    }
}

// Custom Confirmation Dialog
let pendingConfirmAction = null;

function showConfirm(title, message, actionText, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const actionBtn = document.getElementById('confirm-action-btn');

    titleEl.textContent = title;
    messageEl.textContent = message;
    actionBtn.textContent = actionText;
    pendingConfirmAction = onConfirm;

    // Set action button click handler
    actionBtn.onclick = () => {
        closeConfirm();
        if (pendingConfirmAction) pendingConfirmAction();
    };

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeConfirm() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.add('hidden');
    pendingConfirmAction = null;
}

function deleteChat(id) {
    const chat = conversations.find(c => c.id === id);
    const chatTitle = chat ? chat.title : 'this chat';

    showConfirm(
        'Delete Conversation',
        `Are you sure you want to delete "${chatTitle}"? This action cannot be undone.`,
        'Delete',
        async () => {
            try {
                await fetch(`/api/chats/${id}`, { method: 'DELETE' });
                conversations = conversations.filter(c => c.id !== id);
                showToast('🗑️ Conversation deleted');
                if (currentConversationId === id) {
                    createNewChat();
                } else {
                    renderConversations();
                }
            } catch (e) {
                showToast('Failed to delete conversation');
            }
        }
    );
}

function confirmClearAllChats() {
    if (conversations.length === 0) {
        showToast('No conversations to clear');
        return;
    }

    showConfirm(
        'Clear All Conversations',
        `Are you sure you want to delete all ${conversations.length} conversation(s)? This action cannot be undone.`,
        'Clear All',
        async () => {
            try {
                // Delete all chats
                for (const chat of conversations) {
                    await fetch(`/api/chats/${chat.id}`, { method: 'DELETE' });
                }
                conversations = [];
                createNewChat();
                showToast('🗑️ All conversations cleared');
                toggleSettings(); // Close settings modal
            } catch (e) {
                showToast('Failed to clear conversations');
            }
        }
    );
}

async function exportData() {
    try {
        const exportData = {
            exportedAt: new Date().toISOString(),
            conversations: []
        };

        for (const chat of conversations) {
            const res = await fetch(`/api/chats/${chat.id}/messages`);
            const messages = await res.json();
            exportData.conversations.push({
                id: chat.id,
                title: chat.title,
                model: chat.model,
                createdAt: chat.created_at,
                messages: messages
            });
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `varmudio-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('📥 Data exported successfully!');
    } catch (e) {
        console.error('Export error:', e);
        showToast('Failed to export data');
    }
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        sidebar.classList.toggle('hidden');
        // Manage backdrop visibility
        if (backdrop) {
            if (sidebar.classList.contains('hidden')) {
                backdrop.classList.remove('visible');
            } else {
                backdrop.classList.add('visible');
            }
        }
    } else {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
        updateSidebarIcon(isCollapsed);
    }
}

function updateSidebarIcon(isCollapsed) {
    // Icon rotation removed since the panel-left toggle button was removed
    // This function is kept for localStorage state management compatibility
}

// Handle resize
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isMobile = window.innerWidth <= 768;

    // If moving to mobile, ensure we don't have 'collapsed' class, use 'hidden'
    if (isMobile) {
        sidebar.classList.remove('collapsed');
        if (!sidebar.classList.contains('hidden')) sidebar.classList.add('hidden');
        // Hide backdrop when resizing
        if (backdrop) backdrop.classList.remove('visible');
    } else {
        sidebar.classList.remove('hidden');
        // Hide backdrop on desktop
        if (backdrop) backdrop.classList.remove('visible');
        // Restore desktop state
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) sidebar.classList.add('collapsed');
        else sidebar.classList.remove('collapsed');

        updateSidebarIcon(isCollapsed);
    }
});

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    // toggle icon logic here if needed
}

function loadState() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Initial Sidebar State
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
    } else {
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) {
            document.getElementById('sidebar').classList.add('collapsed');
        }
        updateSidebarIcon(isCollapsed);
    }

    // Load local storage settings if exist
    const savedSysPrompt = localStorage.getItem('systemPrompt');
    if (savedSysPrompt) systemPrompt = savedSysPrompt;

    const savedTemp = localStorage.getItem('temperature');
    if (savedTemp) temperature = savedTemp;
}

// Settings
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('hidden');

    if (!modal.classList.contains('hidden')) {
        document.getElementById('system-prompt').value = systemPrompt;
        document.getElementById('temp-slider').value = temperature;
        document.getElementById('temp-val').textContent = temperature;
        document.getElementById('max-tokens').value = maxTokens;
    }
}

function saveSettings() {
    systemPrompt = document.getElementById('system-prompt').value;
    temperature = document.getElementById('temp-slider').value;
    maxTokens = document.getElementById('max-tokens').value;

    localStorage.setItem('systemPrompt', systemPrompt);
    localStorage.setItem('temperature', temperature);

    toggleSettings();
    showToast('Settings saved');
}

// Window click to close dropdowns
window.onclick = function (event) {
    if (!event.target.closest('.model-selector')) {
        document.getElementById('model-dropdown').classList.remove('show');
    }
    if (!event.target.closest('.input-btn')) { // Tools dropdown
        const tools = document.getElementById('tools-dropdown');
        if (tools && tools.classList.contains('show')) tools.classList.remove('show');
    }
}
