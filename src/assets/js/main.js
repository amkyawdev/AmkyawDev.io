document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const elements = {
        chatBody: document.getElementById('chatBody'),
        userInput: document.getElementById('userInput'),
        sendButton: document.getElementById('sendButton'),
        sidebar: document.getElementById('sidebar'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        newChatBtn: document.getElementById('newChatBtn'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),
        historyList: document.getElementById('historyList'),
        themeToggle: document.getElementById('themeToggle'),
        voiceToggle: document.getElementById('voiceToggle'),
        suggestions: document.getElementById('suggestions'),
        progressBar: document.querySelector('.progress-bar')
    };

    // Cloudflare Worker API Configuration
    const API_CONFIG = {
        endpoint: 'https://morning-cell-1282.mysvm.workers.dev/api/chat',
        retries: 3,
        timeout: 10000,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    // Application State
    const state = {
        currentChatId: generateChatId(),
        isSidebarOpen: window.innerWidth > 768,
        isWaitingForResponse: false,
        speechSynthesis: window.speechSynthesis || null,
        voices: []
    };

    // Initialize the application
    init();

    function init() {
        setupEventListeners();
        checkSettings();
        loadChatHistory();
        updateSidebarState();
        sendInitialGreeting();
        loadVoices();
    }

    // Utility Functions
    function generateChatId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function getMyanmarTime(date = new Date()) {
        const options = { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true,
            day: 'numeric',
            month: 'short'
        };
        return date.toLocaleDateString('my-MM', options) + ' ' + 
               date.toLocaleTimeString('my-MM', {hour: '2-digit', minute: '2-digit', hour12: true});
    }

    // Sidebar Functions
    function updateSidebarState() {
        if (window.innerWidth <= 768) {
            elements.sidebar.classList.toggle('active', state.isSidebarOpen);
        } else {
            elements.sidebar.classList.add('active');
            state.isSidebarOpen = true;
        }
    }

    function toggleSidebar() {
        state.isSidebarOpen = !state.isSidebarOpen;
        updateSidebarState();
    }

    // Message Handling
    async function sendMessage() {
        if (state.isWaitingForResponse) return;
        
        const message = elements.userInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        elements.userInput.value = '';
        
        state.isWaitingForResponse = true;
        showLoadingState();
        showTypingIndicator();
        
        try {
            const response = await getAIResponse(message);
            addMessage('ai', response);
            
            if (shouldUseTTS()) {
                speakResponse(response);
            }
        } catch (error) {
            handleError(error);
        } finally {
            hideTypingIndicator();
            hideLoadingState();
            state.isWaitingForResponse = false;
            updateChatHistory();
        }
    }

    function addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        messageDiv.innerHTML = `
            <div class="message-content">${parseSimpleMarkdown(text)}</div>
            <span class="message-time">${getMyanmarTime()}</span>
        `;
        
        elements.chatBody.appendChild(messageDiv);
        saveMessageToHistory(sender, text);
        scrollToBottom();
    }

    // API Communication
    async function getAIResponse(prompt) {
        let lastError;
        
        for (let i = 0; i < API_CONFIG.retries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
                
                const response = await fetch(API_CONFIG.endpoint, {
                    method: 'POST',
                    headers: API_CONFIG.headers,
                    body: JSON.stringify({ 
                        prompt,
                        language: localStorage.getItem('language') || 'my',
                        chatId: state.currentChatId
                    }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (!data?.response) {
                    throw new Error('Invalid response format from API');
                }
                
                return data.response;
            } catch (error) {
                lastError = error;
                if (i < API_CONFIG.retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }
        
        throw lastError;
    }

    // History Management
    function loadChatHistory() {
        const history = JSON.parse(localStorage.getItem('wayneAI_chatHistory')) || {};
        
        elements.historyList.innerHTML = '';
        
        Object.keys(history)
            .sort((a, b) => history[b].lastUpdated - history[a].lastUpdated)
            .forEach(chatId => {
                const chat = history[chatId];
                const historyItem = document.createElement('li');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `
                    <i class="fas fa-comment"></i>
                    <span>${chat.preview || 'New Chat'}</span>
                `;
                historyItem.addEventListener('click', () => loadChat(chatId));
                elements.historyList.appendChild(historyItem);
            });
    }

    function saveMessageToHistory(sender, text) {
        const history = JSON.parse(localStorage.getItem('wayneAI_chatHistory')) || {};
        const timestamp = new Date();
        
        if (!history[state.currentChatId]) {
            history[state.currentChatId] = {
                messages: [],
                preview: text.length > 30 ? text.substring(0, 30) + '...' : text,
                lastUpdated: timestamp.getTime()
            };
        }
        
        history[state.currentChatId].messages.push({ 
            sender, 
            text, 
            timestamp: timestamp.getTime() 
        });
        history[state.currentChatId].lastUpdated = timestamp.getTime();
        
        localStorage.setItem('wayneAI_chatHistory', JSON.stringify(history));
    }

    function loadChat(chatId) {
        state.currentChatId = chatId;
        const history = JSON.parse(localStorage.getItem('wayneAI_chatHistory')) || {};
        const chat = history[chatId];
        
        elements.chatBody.innerHTML = '';
        
        if (chat?.messages) {
            chat.messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${msg.sender}-message`;
                messageDiv.innerHTML = `
                    <div class="message-content">${parseSimpleMarkdown(msg.text)}</div>
                    <span class="message-time">${getMyanmarTime(new Date(msg.timestamp))}</span>
                `;
                elements.chatBody.appendChild(messageDiv);
            });
        }
        
        scrollToBottom();
        if (window.innerWidth <= 768) toggleSidebar();
    }

    function clearHistory() {
        if (confirm(getLocalizedMessage('clearHistoryConfirm'))) {
            localStorage.removeItem('wayneAI_chatHistory');
            state.currentChatId = generateChatId();
            elements.chatBody.innerHTML = '';
            loadChatHistory();
            sendInitialGreeting();
        }
    }

    function startNewChat() {
        state.currentChatId = generateChatId();
        elements.chatBody.innerHTML = '';
        sendInitialGreeting();
        if (window.innerWidth <= 768) toggleSidebar();
    }

    // Text-to-Speech Functions
    function loadVoices() {
        if (!state.speechSynthesis) return;
        
        state.speechSynthesis.onvoiceschanged = () => {
            state.voices = state.speechSynthesis.getVoices();
        };
        
        // Some browsers load voices asynchronously
        const checkVoices = setInterval(() => {
            const voices = state.speechSynthesis.getVoices();
            if (voices.length > 0) {
                state.voices = voices;
                clearInterval(checkVoices);
            }
        }, 100);
    }

    function speakResponse(text) {
        if (!state.speechSynthesis) return;
        
        state.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = getVoiceLanguage();
        utterance.rate = 0.9;
        
        const preferredVoice = state.voices.find(voice => 
            voice.lang === utterance.lang && voice.name.includes('Female'));
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        state.speechSynthesis.speak(utterance);
    }

    function getVoiceLanguage() {
        const lang = localStorage.getItem('language') || 'my';
        return lang === 'en' ? 'en-US' : 'my-MM';
    }

    // UI Helpers
    function showLoadingState() {
        elements.progressBar.style.width = '30%';
    }

    function hideLoadingState() {
        elements.progressBar.style.width = '100%';
        setTimeout(() => elements.progressBar.style.width = '0%', 500);
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <span>${getLocalizedMessage('typingIndicator')}</span>
        `;
        elements.chatBody.appendChild(typingDiv);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) typingIndicator.remove();
    }

    function scrollToBottom() {
        elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
    }

    function parseSimpleMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/\n/g, '<br>');
    }

    // Settings Management
    function checkSettings() {
        const defaults = {
            language: 'my',
            voiceResponse: 'false',
            theme: 'light',
            saveHistory: 'true'
        };
        
        Object.entries(defaults).forEach(([key, value]) => {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, value);
            }
        });
        
        applyTheme();
        updateVoiceToggle();
    }

    function applyTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === 'dark');
        elements.themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    function toggleTheme() {
        const newTheme = localStorage.getItem('theme') === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme();
    }

    function toggleVoice() {
        const newVoiceState = localStorage.getItem('voiceResponse') === 'true' ? 'false' : 'true';
        localStorage.setItem('voiceResponse', newVoiceState);
        updateVoiceToggle();
    }

    function updateVoiceToggle() {
        const isVoiceOn = localStorage.getItem('voiceResponse') === 'true';
        elements.voiceToggle.innerHTML = isVoiceOn ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
        elements.voiceToggle.title = isVoiceOn ? 
            getLocalizedMessage('turnOffVoice') : 
            getLocalizedMessage('turnOnVoice');
    }

    function shouldUseTTS() {
        return localStorage.getItem('voiceResponse') === 'true' && state.speechSynthesis;
    }

    // Localization
    function getLocalizedMessage(key) {
        const messages = {
            typingIndicator: {
                my: 'WAYNE AI စာရိုက်နေသည်...',
                en: 'WAYNE AI is typing...'
            },
            turnOnVoice: {
                my: 'အသံဖွင့်ရန်',
                en: 'Turn on voice'
            },
            turnOffVoice: {
                my: 'အသံပိတ်ရန်',
                en: 'Turn off voice'
            },
            clearHistoryConfirm: {
                my: 'စာရင်းအားလုံးကို ဖျက်မှာသေချာပါသလား?',
                en: 'Are you sure you want to clear all history?'
            },
            initialGreeting: {
                my: 'မင်္ဂလာပါ! WAYNE AI မှ ကြိုဆိုပါတယ်။ ကျွန်ုပ်ကို ဘာတွေ မေးမြန်းချင်ပါသလဲ?',
                en: 'Hello! Welcome to WAYNE AI. How can I assist you today?'
            },
            apiError: {
                my: 'တောင်းပန်ပါသည်။ အမှားတစ်ခုဖြစ်ပေါ်နေပါသည်။ နောက်မှပြန်ကြိုးစားပါ။',
                en: 'Sorry, an error occurred. Please try again later.'
            }
        };
        
        const lang = localStorage.getItem('language') || 'my';
        return messages[key]?.[lang] || messages[key]?.en || key;
    }

    function sendInitialGreeting() {
        setTimeout(() => {
            addMessage('ai', getLocalizedMessage('initialGreeting'));
        }, 500);
    }

    function handleError(error) {
        console.error('Error:', error);
        addMessage('ai', getLocalizedMessage('apiError'));
    }

    // Event Listeners
    function setupEventListeners() {
        // Message sending
        elements.sendButton.addEventListener('click', sendMessage);
        elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Sidebar controls
        elements.sidebarToggle.addEventListener('click', toggleSidebar);
        elements.newChatBtn.addEventListener('click', startNewChat);
        elements.clearHistoryBtn.addEventListener('click', clearHistory);
        
        // Settings toggles
        elements.themeToggle.addEventListener('click', toggleTheme);
        elements.voiceToggle.addEventListener('click', toggleVoice);
        
        // Suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                elements.userInput.value = chip.textContent;
                elements.userInput.focus();
            });
        });
        
        // Window resize handler
        window.addEventListener('resize', () => {
            state.isSidebarOpen = window.innerWidth > 768;
            updateSidebarState();
        });
        
        // Focus input on load
        elements.userInput.focus();
    }
});
