// ===== STATE MANAGEMENT =====
let currentUser = null;
let currentMatchId = null;
let matches = [];
let chatSocket = null;
let currentConversationId = null;
let chatTypingTimeout = null;
let emojiPicker = null;
let fileInput = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// WebSocket config (same server as API)
const CHAT_WS_HOST = (function () {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            return window.location.hostname + (window.location.port ? ':' + window.location.port : '');
        }
    } catch (e) {}
    return 'localhost:5002';
})();

function getAuthToken() {
    try {
        return localStorage.getItem('litlink_token') || localStorage.getItem('authToken') || localStorage.getItem('token');
    } catch (e) { return null; }
}

function getCurrentUserId() {
    if (currentUser && (currentUser._id || currentUser.id)) return (currentUser._id || currentUser.id).toString();
    try {
        return localStorage.getItem('litlink_userId') || localStorage.getItem('userId') || '';
    } catch (e) { return ''; }
}

function isRealUserId(id) {
    return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

// ===== DOM ELEMENTS =====
const matchesList = document.getElementById('matchesList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const currentAvatar = document.getElementById('currentAvatar');
const currentUserName = document.getElementById('currentUserName');
const currentUserGenre = document.getElementById('currentUserGenre');
const currentStatus = document.getElementById('currentStatus');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const menuToggle = document.getElementById('menuToggle');
const messageInputWrapper = document.getElementById('messageInputWrapper');
const welcomeState = document.getElementById('welcomeState');
const emojiBtn = document.getElementById('emojiBtn');
const attachBtn = document.getElementById('attachBtn');

// ===== INITIALIZATION =====
async function initializeChat() {
    try {
        console.log('🚀 Initializing chat...');
        
        const userStr = localStorage.getItem('litlink_user');
        if (userStr) {
            currentUser = JSON.parse(userStr);
            console.log('✅ User found:', currentUser.name);
            
            // Update sidebar user info
            updateSidebarUserInfo();
        } else {
            console.log('⚠️ No user data found');
            showNotification('Please login to chat', 'info');
            return;
        }
        
        initializeEventListeners();
        initChatWebSocket();
        await loadMatches();
        setupEmojiPicker();
        setupFileInput();
        
        console.log('✅ Chat initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing chat:', error);
        showNotification('Failed to load chat', 'error');
    }
}

function updateSidebarUserInfo() {
    try {
        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserGenre = document.getElementById('sidebarUserGenre');
        const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
        
        if (sidebarUserName) {
            sidebarUserName.textContent = currentUser.name || 'User';
        }
        
        if (sidebarUserGenre) {
            sidebarUserGenre.textContent = 
                currentUser.favoriteGenres && currentUser.favoriteGenres.length > 0 
                ? currentUser.favoriteGenres[0] 
                : 'Reader';
        }
        
        if (sidebarUserAvatar) {
            if (currentUser.profilePicture && currentUser.profilePicture !== 'null' && currentUser.profilePicture !== 'undefined') {
                sidebarUserAvatar.src = currentUser.profilePicture;
            } else {
                // Fallback to avatar with initials
                const name = currentUser.name || 'User';
                sidebarUserAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E0B973&color=3B1D14&size=60`;
            }
        }
    } catch (e) {
        console.error('Error updating sidebar user info:', e);
    }
}

// ===== WEBSOCKET CHAT =====
function initChatWebSocket() {
    const token = getAuthToken();
    if (!token) {
        console.log('Chat: No auth token, WebSocket disabled');
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + CHAT_WS_HOST + '/ws/chat?token=' + encodeURIComponent(token);
    
    try {
        chatSocket = new WebSocket(wsUrl);
        
        chatSocket.onopen = function () {
            console.log('✅ Chat WebSocket connected');
            reconnectAttempts = 0;
            showNotification('Connected to chat', 'success');
            
            // Request online status for matches
            if (matches.length > 0) {
                requestChatOnlineStatus();
            }
        };
        
        chatSocket.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                handleChatSocketMessage(data);
            } catch (e) {
                console.error('Chat WS parse error:', e);
            }
        };
        
        chatSocket.onclose = function () {
            console.warn('Chat WebSocket closed');
            
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                showNotification(`Disconnected from chat. Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'warning');
                
                // Attempt to reconnect after 5 seconds
                setTimeout(() => {
                    if (!chatSocket || chatSocket.readyState === WebSocket.CLOSED) {
                        initChatWebSocket();
                    }
                }, 5000);
            } else {
                showNotification('Unable to connect to chat server', 'error');
            }
        };
        
        chatSocket.onerror = function (err) {
            console.error('Chat WebSocket error:', err);
        };
    } catch (e) {
        console.error('Chat WebSocket init error:', e);
    }
}

function handleChatSocketMessage(data) {
    if (!data || !data.type) return;
    
    switch (data.type) {
        case 'user-authenticated':
            console.log('Chat: authenticated as user');
            break;
            
        case 'chat:message':
            onIncomingChatMessage(data);
            break;
            
        case 'chat:message:sent':
            onChatMessageSent(data);
            break;
            
        case 'chat:typing':
            onChatTyping(data);
            break;
            
        case 'chat:history':
            onChatHistory(data);
            break;
            
        case 'chat:online':
            if (data.online && matches.length) {
                Object.keys(data.online).forEach(function (userId) {
                    const m = matches.find(function (x) { return x._id === userId || x.id === userId; });
                    if (m) {
                        m.online = !!data.online[userId];
                        
                        // Update current match status if active
                        if (m.active && currentStatus) {
                            currentStatus.className = `status-indicator ${m.online ? 'online' : 'offline'}`;
                        }
                    }
                });
                renderMatches();
            }
            break;
            
        case 'error':
            showNotification(data.message || 'Chat error', 'error');
            break;
            
        default:
            console.log('Unknown message type:', data.type);
            break;
    }
}

function onIncomingChatMessage(data) {
    const senderId = data.senderId || (data.message && data.message.sender);
    const currentMatch = matches.find(function (m) { return m.active; });
    
    if (!currentMatch || (currentMatch._id !== senderId && currentMatch.id !== senderId)) {
        // Find the match and increment notification
        const match = matches.find(m => m._id === senderId || m.id === senderId);
        if (match) {
            match.notifications = (match.notifications || 0) + 1;
            renderMatches();
        }
        return;
    }
    
    const msg = data.message || {};
    const text = msg.content || '';
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Just now';
    
    if (!currentMatch.messages) currentMatch.messages = [];
    
    // Check for file attachment
    if (msg.attachment) {
        currentMatch.messages.push({
            id: msg._id || Date.now(),
            type: 'received',
            attachment: msg.attachment,
            time: time
        });
    } else {
        currentMatch.messages.push({
            id: msg._id || Date.now(),
            type: 'received',
            text: text,
            time: time
        });
    }
    
    currentMatch.preview = text ? (text.length > 30 ? text.substring(0, 27) + '...' : text) : '📎 Sent an attachment';
    
    renderMatches();
    renderMessages(currentMatch.messages, currentMatch);
    
    // Update message count
    const totalMessages = matches.reduce((total, match) => total + (match.messages ? match.messages.length : 0), 0);
    document.getElementById('statMessages').textContent = totalMessages;
}

function onChatMessageSent(data) {
    if (data.conversationId) {
        currentConversationId = data.conversationId;
    }
}

function onChatTyping(data) {
    const currentMatch = matches.find(function (m) { return m.active; });
    if (!currentMatch || (currentMatch._id !== data.senderId && currentMatch.id !== data.senderId)) return;
    
    if (data.isTyping) {
        showTypingIndicator(currentMatch);
    } else {
        removeTypingIndicator();
    }
}

function onChatHistory(data) {
    const currentMatch = matches.find(function (m) { return m.active; });
    
    if (data.conversationId) {
        currentConversationId = data.conversationId;
    }
    
    hideMessageLoading();
    
    if (data.error || !currentMatch) {
        if (currentMatch) {
            // Show empty state for new conversation
            showEmptyConversation(currentMatch);
        }
        return;
    }
    
    const list = data.messages || [];
    
    if (list.length === 0) {
        // New conversation - show empty state
        showEmptyConversation(currentMatch);
        return;
    }
    
    currentMatch.messages = list.map(function (m) {
        const isSent = (m.sender && m.sender.toString()) === getCurrentUserId();
        
        const message = {
            id: m._id,
            type: isSent ? 'sent' : 'received',
            time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
        };
        
        if (m.attachment) {
            message.attachment = m.attachment;
        } else {
            message.text = m.content || '';
        }
        
        return message;
    });
    
    renderMessages(currentMatch.messages, currentMatch);
}

function showEmptyConversation(match) {
    messagesContainer.innerHTML = `
        <div class="empty-conversation">
            <div class="empty-conversation-icon">
                <i class="fas fa-comments"></i>
            </div>
            <h3>Start a conversation with ${match.name}</h3>
            <p>Send a message to begin chatting about books, recommendations, and more!</p>
            <div class="suggested-messages">
                <button class="suggested-message" onclick="LitlinkChat.useSuggestedMessage('Hi ${match.name.split(' ')[0]}! I noticed we both enjoy reading. What books have you been reading lately?')">
                    📚 Ask about recent reads
                </button>
                <button class="suggested-message" onclick="LitlinkChat.useSuggestedMessage('Hey! What\'s your favorite book right now?')">
                    ⭐ Ask for recommendations
                </button>
                <button class="suggested-message" onclick="LitlinkChat.useSuggestedMessage('Hi there! I\'m looking for book suggestions in ${match.genre || 'our shared genres'}. Any favorites?')">
                    🔍 Discuss favorite genres
                </button>
            </div>
        </div>
    `;
}

function sendChatWebSocket(recipientId, content, attachment = null) {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        showNotification('Not connected to chat server', 'warning');
        return false;
    }
    
    try {
        const payload = {
            type: 'chat:message',
            recipientId: recipientId,
            content: content,
            conversationId: currentConversationId || undefined
        };
        
        if (attachment) {
            payload.attachment = attachment;
        }
        
        chatSocket.send(JSON.stringify(payload));
        return true;
    } catch (e) {
        console.error('sendChatWebSocket error:', e);
        return false;
    }
}

function requestChatHistory(otherUserId) {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
    
    try {
        chatSocket.send(JSON.stringify({
            type: 'chat:history',
            otherUserId: otherUserId,
            limit: 50
        }));
    } catch (e) {
        console.error('requestChatHistory error:', e);
    }
}

function sendChatTyping(recipientId, isTyping) {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
    
    try {
        chatSocket.send(JSON.stringify({
            type: 'chat:typing',
            recipientId: recipientId,
            isTyping: !!isTyping
        }));
    } catch (e) {}
}

// ===== LOAD MATCHES (API) =====
async function loadMatches() {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please login to view matches', 'warning');
        return;
    }
    
    try {
        showMessageLoading('Loading matches...');
        
        const base = window.location.port === '5500' || window.location.port === '3000' ? 'http://localhost:5002' : '';
        const res = await fetch((base || '') + '/api/chat/matches', {
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            
            if (data.success && Array.isArray(data.matches)) {
                // Filter out system admin and any non-real users
                matches = data.matches
                    .filter(m => m._id && !m.isSystem && m.name !== 'System Admin' && m.name !== 'Admin' && m.role !== 'admin')
                    .map(function (m) {
                        return {
                            ...m,
                            id: m._id,
                            active: false,
                            messages: m.messages || [],
                            notifications: m.unreadCount || 0,
                            online: m.online || false
                        };
                    });
                
                document.getElementById('statMatches').textContent = matches.length;
                document.getElementById('statOnline').textContent = matches.filter(function (m) { return m.online; }).length;
                document.getElementById('statMessages').textContent = matches.reduce((total, m) => total + (m.messages ? m.messages.length : 0), 0);
                
                renderMatches();
                requestChatOnlineStatus();
                
                hideMessageLoading();
            } else {
                showNotification('No matches found', 'info');
                hideMessageLoading();
            }
        } else {
            console.error('Failed to load matches:', res.status);
            showNotification('Failed to load matches', 'error');
            hideMessageLoading();
        }
    } catch (e) {
        console.warn('Chat API matches failed:', e);
        showNotification('Could not connect to server', 'error');
        hideMessageLoading();
    }
}

function requestChatOnlineStatus() {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN || !matches.length) return;
    
    try {
        chatSocket.send(JSON.stringify({
            type: 'chat:online',
            userIds: matches.map(function (m) { return m._id || m.id; })
        }));
    } catch (e) {}
}

// ===== RENDER FUNCTIONS =====
function renderMatches() {
    if (!matchesList) return;
    
    if (matches.length === 0) {
        matchesList.innerHTML = `
            <div class="no-matches">
                <i class="fas fa-heart-broken"></i>
                <p>No matches yet</p>
                <small>Explore readers to find your book soulmate!</small>
                <button onclick="window.location.href='../Dashboard/dashexplore.html'" class="explore-btn">
                    Explore Readers
                </button>
            </div>
        `;
        return;
    }
    
    matchesList.innerHTML = matches.map(match => `
        <div class="match-item ${match.active ? 'active' : ''}" data-id="${match._id || match.id}">
            <div class="avatar-wrapper">
                <img src="${getProfilePicture(match)}" alt="${match.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(match.name)}&background=E0B973&color=3B1D14&size=48'">
                <span class="status-indicator ${match.online ? 'online' : 'offline'}"></span>
                ${match.notifications > 0 ? `<span class="notification-badge">${match.notifications}</span>` : ''}
            </div>
            <div class="match-info">
                <h3 class="match-name">${match.name}</h3>
                <p class="match-genre">${match.genre || 'Reader'}</p>
                <p class="match-preview">${match.preview || 'No messages yet'}</p>
            </div>
            <div class="compatibility-badge">${match.compatibility || Math.floor(Math.random() * 30) + 70}%</div>
        </div>
    `).join('');

    // Add click event listeners
    document.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', async () => {
            const matchId = item.dataset.id;
            await switchMatch(matchId);
            
            // Close sidebar on mobile after selection
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }
        });
    });
}

function getProfilePicture(user) {
    if (user.profilePicture && user.profilePicture !== 'null' && user.profilePicture !== 'undefined') {
        return user.profilePicture;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=E0B973&color=3B1D14&size=48`;
}

async function switchMatch(matchId) {
    try {
        console.log('Switching to match: ' + matchId);
        
        matches.forEach(function (match) {
            match.active = (match._id === matchId || match.id === matchId);
        });
        
        const currentMatch = matches.find(function (m) { return m._id === matchId || m.id === matchId; });
        
        if (!currentMatch) {
            console.error('Match not found:', matchId);
            return;
        }
        
        currentConversationId = null;
        
        // Set current user info in header
        currentAvatar.src = getProfilePicture(currentMatch);
        currentAvatar.alt = currentMatch.name;
        currentUserName.textContent = currentMatch.name;
        currentUserGenre.textContent = currentMatch.genre || 'Reader';
        
        // Update status indicator
        if (currentStatus) {
            currentStatus.className = `status-indicator ${currentMatch.online ? 'online' : 'offline'}`;
        }
        
        // Clear notifications
        currentMatch.notifications = 0;
        
        renderMatches();
        
        // Show appropriate UI
        welcomeState.style.display = 'none';
        messagesContainer.style.display = 'flex';
        messageInputWrapper.style.display = 'flex';
        
        // Load conversation
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN && isRealUserId(currentMatch._id || currentMatch.id)) {
            showMessageLoading('Loading conversation...');
            requestChatHistory(currentMatch._id || currentMatch.id);
        } else {
            await loadMessages(currentMatch);
        }
        
        // Update message count
        const totalMessages = matches.reduce((total, match) => total + (match.messages ? match.messages.length : 0), 0);
        document.getElementById('statMessages').textContent = totalMessages;
        
    } catch (error) {
        console.error('Error switching match:', error);
        showNotification('Failed to load conversation', 'error');
    }
}

async function loadMessages(currentMatch) {
    try {
        showMessageLoading('Loading conversation...');
        
        // Try to fetch messages from API
        const token = getAuthToken();
        if (token && currentMatch._id) {
            try {
                const base = window.location.port === '5500' || window.location.port === '3000' ? 'http://localhost:5002' : '';
                const res = await fetch((base || '') + `/api/chat/messages/${currentMatch._id}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.messages) {
                        currentMatch.messages = data.messages.map(m => ({
                            id: m._id,
                            type: m.sender === getCurrentUserId() ? 'sent' : 'received',
                            text: m.content || '',
                            attachment: m.attachment,
                            time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
                        }));
                        
                        renderMessages(currentMatch.messages, currentMatch);
                        hideMessageLoading();
                        return;
                    }
                }
            } catch (e) {
                console.warn('Could not fetch messages from API:', e);
            }
        }
        
        // If no messages, show empty state
        if (!currentMatch.messages || currentMatch.messages.length === 0) {
            showEmptyConversation(currentMatch);
        } else {
            renderMessages(currentMatch.messages, currentMatch);
        }
        
        hideMessageLoading();
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showEmptyConversation(currentMatch);
        hideMessageLoading();
    }
}

function renderMessages(messages, currentMatch) {
    if (!messagesContainer || !currentMatch) return;
    
    if (!messages || messages.length === 0) {
        showEmptyConversation(currentMatch);
        return;
    }
    
    messagesContainer.innerHTML = messages.map(msg => {
        if (msg.attachment) {
            // Render attachment message
            return renderAttachmentMessage(msg, currentMatch);
        } else {
            // Render text message
            return `
                <div class="message ${msg.type}">
                    ${msg.type === 'received' ? `
                        <div class="avatar-wrapper">
                            <img src="${getProfilePicture(currentMatch)}" alt="${currentMatch.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
                        </div>
                    ` : ''}
                    <div class="message-content">
                        <div class="message-bubble">${escapeHtml(msg.text)}</div>
                        <div class="message-time">${msg.time}</div>
                    </div>
                </div>
            `;
        }
    }).join('');

    // Scroll to bottom
    setTimeout(() => {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
    
    hideMessageLoading();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderAttachmentMessage(msg, currentMatch) {
    const attachment = msg.attachment;
    
    if (attachment.type === 'image') {
        return `
            <div class="message ${msg.type}">
                ${msg.type === 'received' ? `
                    <div class="avatar-wrapper">
                        <img src="${getProfilePicture(currentMatch)}" alt="${currentMatch.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
                    </div>
                ` : ''}
                <div class="message-content">
                    <div class="message-bubble attachment">
                        <img src="${attachment.url}" alt="Shared image" class="attachment-image" onclick="window.open('${attachment.url}', '_blank')">
                        ${attachment.caption ? `<p class="attachment-caption">${escapeHtml(attachment.caption)}</p>` : ''}
                    </div>
                    <div class="message-time">${msg.time}</div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="message ${msg.type}">
                ${msg.type === 'received' ? `
                    <div class="avatar-wrapper">
                        <img src="${getProfilePicture(currentMatch)}" alt="${currentMatch.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
                    </div>
                ` : ''}
                <div class="message-content">
                    <div class="message-bubble attachment">
                        <div class="file-attachment" onclick="LitlinkChat.downloadAttachment('${attachment.url}', '${attachment.filename}')">
                            <i class="fas ${getFileIcon(attachment.filename)}"></i>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(attachment.filename)}</div>
                                <div class="file-size">${formatFileSize(attachment.size)}</div>
                            </div>
                            <i class="fas fa-download download-icon"></i>
                        </div>
                        ${attachment.caption ? `<p class="attachment-caption">${escapeHtml(attachment.caption)}</p>` : ''}
                    </div>
                    <div class="message-time">${msg.time}</div>
                </div>
            </div>
        `;
    }
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: 'fa-file-pdf',
        doc: 'fa-file-word',
        docx: 'fa-file-word',
        xls: 'fa-file-excel',
        xlsx: 'fa-file-excel',
        txt: 'fa-file-alt',
        jpg: 'fa-file-image',
        jpeg: 'fa-file-image',
        png: 'fa-file-image',
        gif: 'fa-file-image',
        mp3: 'fa-file-audio',
        mp4: 'fa-file-video',
        zip: 'fa-file-archive',
        rar: 'fa-file-archive'
    };
    return icons[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== MESSAGE SENDING =====
async function sendMessage() {
    try {
        const text = messageInput && messageInput.value ? messageInput.value.trim() : '';
        const currentMatch = matches.find(function (m) { return m.active; });
        
        if (!currentMatch) {
            showNotification('No active conversation', 'warning');
            return;
        }
        
        if (!text && !fileInput?.files?.length) {
            return;
        }
        
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        const recipientId = currentMatch._id || currentMatch.id;
        const useWebSocket = chatSocket && chatSocket.readyState === WebSocket.OPEN && isRealUserId(recipientId);
        
        if (useWebSocket && text) {
            // Send text message via WebSocket
            if (sendChatWebSocket(recipientId, text)) {
                if (!currentMatch.messages) currentMatch.messages = [];
                
                currentMatch.messages.push({
                    id: 'pending-' + Date.now(),
                    type: 'sent',
                    text: text,
                    time: time
                });
                
                messageInput.value = '';
                currentMatch.preview = text.length > 30 ? text.substring(0, 27) + '...' : text;
                
                renderMatches();
                renderMessages(currentMatch.messages, currentMatch);
                
                // Update message count
                const totalMessages = matches.reduce((total, match) => total + (match.messages ? match.messages.length : 0), 0);
                document.getElementById('statMessages').textContent = totalMessages;
            }
        } else if (text) {
            // Fallback for demo/offline mode
            const newMessage = { id: Date.now(), type: 'sent', text: text, time: time };
            
            if (!currentMatch.messages) currentMatch.messages = [];
            currentMatch.messages.push(newMessage);
            
            messageInput.value = '';
            currentMatch.preview = text.length > 30 ? text.substring(0, 27) + '...' : text;
            
            renderMatches();
            renderMessages(currentMatch.messages, currentMatch);
            
            const totalMessages = matches.reduce((total, match) => total + (match.messages?.length || 0), 0);
            document.getElementById('statMessages').textContent = totalMessages;
            
            // Simulate response if online (fallback only)
            if (currentMatch.online && !useWebSocket) {
                simulateResponse(currentMatch);
            }
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
}

function simulateResponse(currentMatch) {
    // Only used as fallback when WebSocket is not available
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) return;
    
    // Show typing indicator
    const typingIndicator = showTypingIndicator(currentMatch);
    
    // Simulate delay
    setTimeout(() => {
        // Remove typing indicator
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        // Generate response
        const responses = [
            "That's interesting! I should check that book out.",
            "I completely agree! The author's style is so unique.",
            "Have you read any of their other works?",
            "I need to add that to my reading list!",
            "The character development in that book is incredible.",
            "What did you think of the ending?",
            "I loved how the author built the atmosphere."
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        
        const responseMessage = {
            id: Date.now() + 1,
            type: 'received',
            text: randomResponse,
            time: time
        };
        
        // Add to messages
        currentMatch.messages.push(responseMessage);
        
        // Update preview
        currentMatch.preview = randomResponse.length > 30 ? 
            randomResponse.substring(0, 27) + '...' : 
            randomResponse;
        
        // Re-render
        renderMatches();
        renderMessages(currentMatch.messages, currentMatch);
        
        // Update message count
        const totalMessages = matches.reduce((total, match) => total + (match.messages?.length || 0), 0);
        document.getElementById('statMessages').textContent = totalMessages;
        
    }, 1500 + Math.random() * 1000);
}

// ===== EMOJI PICKER =====
function setupEmojiPicker() {
    if (!emojiBtn) return;
    
    emojiBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleEmojiPicker();
    });
}

function toggleEmojiPicker() {
    // Remove existing picker if open
    if (emojiPicker) {
        emojiPicker.remove();
        emojiPicker = null;
        return;
    }
    
    // Create emoji picker container
    emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-picker';
    
    // Common emojis for book chat
    const emojis = [
        '😊', '😂', '🥰', '😍', '🤔', '😢', '😭', '😤', '😎', '🤓',
        '📚', '📖', '📕', '📗', '📘', '📙', '📔', '📒', '📃', '📜',
        '✍️', '🖋️', '📝', '📌', '📍', '❤️', '🧡', '💛', '💚', '💙',
        '💜', '🖤', '🤍', '💔', '🔥', '⭐', '🌟', '✨', '💫', '⚡',
        '👍', '👎', '👏', '🙌', '👐', '🤝', '✌️', '🤞', '👀', '🗣️',
        '📱', '💻', '⌨️', '🖥️', '📷', '🎥', '🎧', '🎵', '🎶', '🎤'
    ];
    
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.className = 'emoji-item';
        span.onclick = function() {
            insertEmoji(emoji);
        };
        emojiPicker.appendChild(span);
    });
    
    // Position near the emoji button
    const rect = emojiBtn.getBoundingClientRect();
    emojiPicker.style.position = 'absolute';
    emojiPicker.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
    emojiPicker.style.left = rect.left + 'px';
    
    document.body.appendChild(emojiPicker);
    
    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeEmojiPickerOnClickOutside);
    }, 100);
}

function closeEmojiPickerOnClickOutside(e) {
    if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.remove();
        emojiPicker = null;
        document.removeEventListener('click', closeEmojiPickerOnClickOutside);
    }
}

function insertEmoji(emoji) {
    if (!messageInput) return;
    
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    
    messageInput.value = text.substring(0, start) + emoji + text.substring(end);
    
    // Move cursor after inserted emoji
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    messageInput.focus();
    
    // Close picker
    if (emojiPicker) {
        emojiPicker.remove();
        emojiPicker = null;
    }
}

// ===== FILE ATTACHMENTS =====
function setupFileInput() {
    if (!attachBtn) return;
    
    // Create hidden file input
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.accept = 'image/*,.pdf,.doc,.docx,.txt';
    fileInput.multiple = false;
    
    document.body.appendChild(fileInput);
    
    attachBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', handleFileSelect);
}

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) {
        showNotification('No active conversation', 'warning');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('File size must be less than 10MB', 'error');
        return;
    }
    
    showMessageLoading('Uploading file...');
    
    try {
        // Upload file to server
        const formData = new FormData();
        formData.append('file', file);
        formData.append('recipientId', currentMatch._id || currentMatch.id);
        
        const token = getAuthToken();
        const base = window.location.port === '5500' || window.location.port === '3000' ? 'http://localhost:5002' : '';
        
        const res = await fetch((base || '') + '/api/chat/upload', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            },
            body: formData
        });
        
        if (res.ok) {
            const data = await res.json();
            
            if (data.success && data.attachment) {
                // Send attachment via WebSocket
                if (sendChatWebSocket(currentMatch._id || currentMatch.id, '', data.attachment)) {
                    const now = new Date();
                    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    
                    if (!currentMatch.messages) currentMatch.messages = [];
                    
                    currentMatch.messages.push({
                        id: 'attachment-' + Date.now(),
                        type: 'sent',
                        attachment: data.attachment,
                        time: time
                    });
                    
                    currentMatch.preview = '📎 Sent a file';
                    
                    renderMatches();
                    renderMessages(currentMatch.messages, currentMatch);
                    
                    const totalMessages = matches.reduce((total, match) => total + (match.messages ? match.messages.length : 0), 0);
                    document.getElementById('statMessages').textContent = totalMessages;
                    
                    showNotification('File sent successfully', 'success');
                }
            }
        } else {
            showNotification('Failed to upload file', 'error');
        }
    } catch (error) {
        console.error('File upload error:', error);
        showNotification('Error uploading file', 'error');
    } finally {
        hideMessageLoading();
        fileInput.value = ''; // Reset file input
    }
}

function showTypingIndicator(currentMatch) {
    removeTypingIndicator();
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message received';
    typingIndicator.setAttribute('data-chat-typing', '1');
    typingIndicator.innerHTML = `
        <div class="avatar-wrapper">
            <img src="${getProfilePicture(currentMatch)}" alt="Typing" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
        </div>
        <div class="message-content">
            <div class="message-bubble typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    
    if (messagesContainer) {
        messagesContainer.appendChild(typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    return typingIndicator;
}

function removeTypingIndicator() {
    if (!messagesContainer) return;
    const el = messagesContainer.querySelector('[data-chat-typing="1"]');
    if (el) el.remove();
}

// ===== LOADING STATES =====
function showMessageLoading(message = 'Loading...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message-loading-state';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <span>${message}</span>
    `;
    
    messagesContainer.innerHTML = '';
    messagesContainer.appendChild(loadingDiv);
}

function hideMessageLoading() {
    const loadingDiv = document.querySelector('.message-loading-state');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icons = {
        success: '✓',
        info: 'ℹ️',
        warning: '⚠️',
        error: '✕'
    };
    
    notification.innerHTML = `
        <span class="notification-icon">${icons[type]}</span>
        <span class="notification-message">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Send message button
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        messageInput.addEventListener('input', function () {
            const currentMatch = matches.find(function (m) { return m.active; });
            if (!currentMatch || !isRealUserId(currentMatch._id || currentMatch.id)) return;
            
            if (chatTypingTimeout) clearTimeout(chatTypingTimeout);
            
            sendChatTyping(currentMatch._id || currentMatch.id, true);
            
            chatTypingTimeout = setTimeout(function () {
                sendChatTyping(currentMatch._id || currentMatch.id, false);
                chatTypingTimeout = null;
            }, 2000);
        });
    }
    
    // Sidebar toggle for mobile
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            e.target !== sidebarToggle &&
            e.target !== menuToggle) {
            sidebar.classList.remove('open');
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('open');
        }
    });
}

// ===== STARTUP =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 Litlink Chat loading...');
    
    try {
        await initializeChat();
    } catch (error) {
        console.error('❌ Failed to initialize chat:', error);
        showNotification('Failed to load chat interface', 'error');
    }
    
    // Focus input after load
    setTimeout(() => {
        if (messageInput) {
            messageInput.focus();
        }
    }, 500);
});

// ===== UTILITY FUNCTIONS =====
function toggleSidebar() {
    sidebar.classList.toggle('open');
}

// ===== EXPORT FOR GLOBAL ACCESS =====
window.LitlinkChat = {
    initializeChat,
    sendMessage,
    switchMatch,
    showNotification,
    toggleSidebar,
    refreshMatches: loadMatches,
    showSettings: () => showNotification('Settings coming soon!', 'info'),
    useSuggestedMessage: (message) => {
        if (messageInput) {
            messageInput.value = message;
            messageInput.focus();
            sendMessage();
        }
    },
    downloadAttachment: (url, filename) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

console.log('✅ Chat.js loaded successfully');