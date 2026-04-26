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
const API_BASE_URL = 'http://localhost:5002';

// WebSocket config
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
        return sessionStorage.getItem('litlink_token') || localStorage.getItem('litlink_token') || sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
    } catch (e) { return null; }
}

function getCurrentUserId() {
    if (currentUser && (currentUser._id || currentUser.id)) return (currentUser._id || currentUser.id).toString();
    try {
        return sessionStorage.getItem('litlink_userId') || localStorage.getItem('litlink_userId') || sessionStorage.getItem('userId') || localStorage.getItem('userId') || '';
    } catch (e) { return ''; }
}

function isRealUserId(id) {
    return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
}

// Helper: Parse time string to Date
function parseTimeToDate(timeStr) {
    if (!timeStr) return new Date(0);
    try {
        const today = new Date();
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':');
        let hour = parseInt(hours);
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        const date = new Date(today);
        date.setHours(hour, parseInt(minutes), 0, 0);
        return date;
    } catch (e) {
        return new Date(0);
    }
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
        
        const userStr = sessionStorage.getItem('litlink_user') || localStorage.getItem('litlink_user');
        if (userStr) {
            currentUser = JSON.parse(userStr);
            console.log('✅ User found:', currentUser.name);
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
        
        if (sidebarUserAvatar) { sidebarUserAvatar.src = getProfilePicture(currentUser, 60); }
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
    
    const wsUrl = 'http://localhost:5002';

    if (chatSocket && chatSocket.connected) {
        return;
    }
    
    try {
        if (typeof io !== 'undefined') {
            console.log('Initializing Socket.IO connection to:', wsUrl);
            
            chatSocket = io(wsUrl, {
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
                reconnectionDelay: 1000,
                timeout: 10000,
                withCredentials: true
            });
            
            chatSocket.on('connect', () => {
                console.log('✅ Chat Socket.IO connected');
                console.log('Socket ID:', chatSocket.id);
                chatSocket.emit('authenticate', token);
            });
            
            chatSocket.on('authenticated', (data) => {
                if (data.success) {
                    console.log('✅ Authenticated for chat');
                    console.log('User ID:', data.userId);
                    reconnectAttempts = 0;
                    showNotification('Connected to chat', 'success');
                    
                    if (matches.length > 0) {
                        requestChatOnlineStatus();
                    }
                } else {
                    console.error('Authentication failed:', data.error);
                    showNotification('Authentication failed: ' + data.error, 'error');
                }
            });
            
            chatSocket.on('chat:message', (data) => {
                console.log('📨 Received message:', data);
                handleChatSocketMessage({ type: 'chat:message', ...data });
            });
            
            chatSocket.on('chat:message:sent', (data) => {
                console.log('✅ Message sent:', data);
                handleChatSocketMessage({ type: 'chat:message:sent', ...data });
            });
            
            chatSocket.on('chat:typing', (data) => {
                handleChatSocketMessage({ type: 'chat:typing', ...data });
            });
            
            chatSocket.on('chat:history', (data) => {
                console.log('📜 Chat history received, messages:', data.messages?.length || 0);
                handleChatSocketMessage({ type: 'chat:history', ...data });
            });
            
            chatSocket.on('chat:online', (data) => {
                console.log('🟢 Online status update:', data);
                handleChatSocketMessage({ type: 'chat:online', ...data });
            });
            
            chatSocket.on('chat:message:unsent', (data) => {
                console.log('🗑️ Message unsent:', data);
                handleChatSocketMessage({ type: 'chat:message:unsent', ...data });
            });

            chatSocket.on('chat:message:deleted', (data) => {
                console.log('❌ Message deleted for me:', data);
                handleChatSocketMessage({ type: 'chat:message:deleted', ...data });
            });

            // ── Content filter events ──────────────────────────────────────
            chatSocket.on('message-blocked', (data) => {
                console.warn('🚫 Message blocked by filter:', data);
                // Roll back the optimistic pending message
                const currentMatch = matches.find(m => m.active);
                if (currentMatch && currentMatch.messages) {
                    currentMatch.messages = currentMatch.messages.filter(
                        m => !String(m.id).startsWith('pending-')
                    );
                    renderMessages(currentMatch.messages, currentMatch);
                }
                showContentWarningBanner(
                    data.warning || 'Message blocked: community guidelines violation.',
                    data.suspended ? 'suspended' : 'blocked'
                );
            });

            chatSocket.on('content-warning', (data) => {
                console.warn('⚠️ Content warning received:', data);
                showContentWarningBanner(data.message, 'warning');
            });

            chatSocket.on('connect_error', (error) => {
                console.error('Socket.IO connection error:', error);
                showNotification('Connection error: ' + error.message, 'error');
            });
            
            chatSocket.on('disconnect', (reason) => {
                console.warn('Chat disconnected:', reason);
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    showNotification(`Disconnected from chat. Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'warning');
                } else {
                    showNotification('Unable to connect to chat server', 'error');
                }
            });

            chatSocket.on('reconnect_attempt', (attempt) => {
                console.log('Chat reconnect attempt:', attempt);
            });

            chatSocket.on('reconnect', (attempt) => {
                console.log('Chat reconnected after attempts:', attempt);
                chatSocket.emit('authenticate', token);
            });
        } else {
            console.warn('Socket.IO client not loaded, using fallback');
            showNotification('Socket.IO not loaded. Chat features may be limited.', 'warning');
        }
    } catch (e) {
        console.error('Chat WebSocket init error:', e);
        showNotification('Failed to initialize chat', 'error');
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
                        
                        if (m.active && currentStatus) {
                            currentStatus.className = `status-indicator ${m.online ? 'online' : 'offline'}`;
                        }
                    }
                });
                renderMatches();
            }
            break;
            
        case 'chat:message:unsent':
            onMessageUnsent(data);
            break;
            
        case 'chat:message:deleted':
            onMessageDeleted(data);
            break;
            
        case 'error':
            showNotification(data.message || 'Chat error', 'error');
            break;
            
        default:
            console.log('Unknown message type:', data.type);
            break;
    }
}

function onMessageUnsent(data) {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    
    refreshCurrentConversation();
    showNotification('A message was unsent', 'info');
}

function onMessageDeleted(data) {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    
    refreshCurrentConversation();
    showNotification('Message deleted', 'info');
}

function onIncomingChatMessage(data) {
    const senderId = data.senderId || (data.message && data.message.sender);
    const currentMatch = matches.find(function (m) { return m.active; });
    
    if (!currentMatch || (currentMatch._id !== senderId && currentMatch.id !== senderId)) {
        const match = matches.find(m => m._id === senderId || m.id === senderId);
        if (match) {
            match.unreadCount = (match.unreadCount || 0) + 1;
            renderMatches();
            showNotification(`New message from ${match.name}`, 'info');
        }
        return;
    }
    
    refreshCurrentConversation();
}

function onChatMessageSent(data) {
    if (data.conversationId) {
        currentConversationId = data.conversationId;
    }
    // Message was sent but content was censored — show warning to sender
    if (data.warningIssued && data.warningMessage) {
        showContentWarningBanner(data.warningMessage, 'warning');
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
            showEmptyConversation(currentMatch);
        }
        return;
    }
    
    const list = data.messages || [];
    const currentUserId = getCurrentUserId();
    
    if (list.length === 0) {
        showEmptyConversation(currentMatch);
        return;
    }
    
    // Filter out messages that are unsent or deleted for current user
    const visibleMessages = list.filter(function (m) {
        if (m.unsent) return false;
        if (m.deletedFor && m.deletedFor.some(function(id) { return id.toString() === currentUserId; })) return false;
        return true;
    });
    
    currentMatch.messages = visibleMessages.map(function (m) {
        const isSent = (m.sender && m.sender.toString()) === currentUserId;
        const createdAt = m.createdAt ? new Date(m.createdAt) : new Date();
        
        const message = {
            id: m._id,
            _id: m._id,
            type: isSent ? 'sent' : 'received',
            time: createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            createdAt: createdAt,
            sender: m.sender
        };
        
        if (m.attachment && m.attachment.data) {
            message.attachment = m.attachment;
        } else if (m.content) {
            message.text = m.content;
        }
        
        return message;
    });
    
    // Update preview
    if (currentMatch.messages.length > 0) {
        const lastMsg = currentMatch.messages[currentMatch.messages.length - 1];
        currentMatch.preview = lastMsg.text ? 
            (lastMsg.text.length > 30 ? lastMsg.text.substring(0, 27) + '...' : lastMsg.text) : 
            (lastMsg.attachment ? '📎 Attachment' : 'No messages yet');
    } else {
        currentMatch.preview = 'No messages yet';
    }
    
    renderMatches();
    renderMessages(currentMatch.messages, currentMatch);
}

function showEmptyConversation(match) {
    if (!messagesContainer) return;
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
    if (!chatSocket || !chatSocket.connected) {
        console.log('Chat: Not connected, using fallback');
        return false;
    }
    
    try {
        chatSocket.emit('chat:message', {
            recipientId: recipientId,
            content: content,
            conversationId: currentConversationId || undefined,
            attachment: attachment
        });
        return true;
    } catch (e) {
        console.error('sendChatWebSocket error:', e);
        return false;
    }
}

function requestChatHistory(otherUserId) {
    if (!chatSocket || !chatSocket.connected) return;
    
    try {
        chatSocket.emit('chat:history', {
            otherUserId: otherUserId,
            limit: 50
        });
    } catch (e) {
        console.error('requestChatHistory error:', e);
    }
}

function sendChatTyping(recipientId, isTyping) {
    if (!chatSocket || !chatSocket.connected) return;
    
    try {
        chatSocket.emit('chat:typing', {
            recipientId: recipientId,
            isTyping: !!isTyping
        });
    } catch (e) {}
}

function requestChatOnlineStatus() {
    if (!chatSocket || !chatSocket.connected || !matches.length) return;
    
    try {
        chatSocket.emit('chat:online', {
            userIds: matches.map(function (m) { return m._id || m.id; })
        });
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
        
        const res = await fetch(`${API_BASE_URL}/api/chat/matches`, {
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (res.status === 401) { showNotification('Session expired — please login again.', 'error'); hideMessageLoading(); return; }
        if (!res.ok) throw new Error('Server error ' + res.status);
        const data = await res.json();
        if (data.success && Array.isArray(data.matches)) {
            matches = data.matches
                .filter(m => m._id && !m.isSystem && m.name !== 'System Admin' && m.name !== 'Admin' && m.role !== 'admin')
                .map(m => ({ ...m, id: m._id, active: false, messages: m.messages || [], unreadCount: m.unreadCount || 0, online: m.online || false }));
            document.getElementById('statMatches').textContent = matches.length;
            document.getElementById('statOnline').textContent  = matches.filter(m => m.online).length;
            document.getElementById('statMessages').textContent = matches.reduce((t, m) => t + (m.messages ? m.messages.length : 0), 0);
            renderMatches();
            requestChatOnlineStatus();
        } else {
            renderMatches();
        }
        hideMessageLoading();
    } catch (e) {
        console.error('Chat API matches failed:', e);
        showNotification('Could not connect to server — is it running?', 'error');
        hideMessageLoading();
        if (matchesList) matchesList.innerHTML = '<div class="no-matches"><i class="fas fa-exclamation-triangle"></i><p>Failed to load</p><small>' + e.message + '</small><button onclick="LitlinkChat.refreshMatches()" class="explore-btn" style="margin-top:10px">Retry</button></div>';
    }
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
                ${match.unreadCount > 0 ? `<span class="notification-badge">${match.unreadCount}</span>` : ''}
            </div>
            <div class="match-info">
                <h3 class="match-name">${escapeHtml(match.name)}</h3>
                <p class="match-genre">${escapeHtml(match.genre || 'Reader')}</p>
                <p class="match-explanation" style="color: #C9A27B; font-size: 0.75rem; font-style: italic; margin: 2px 0;">✨ ${escapeHtml(match.explanation || 'You have similar reading interests.')}</p>
                <p class="match-preview">${escapeHtml(match.preview || 'No messages yet')}</p>
            </div>
            <div class="compatibility-badge">${match.compatibility || 75}%</div>
        </div>
    `).join('');

    document.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', async () => {
            const matchId = item.dataset.id;
            await switchMatch(matchId);
            
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }
        });
    });
}

function getProfilePicture(user, size) {
    const sz = size || 48;
    const pic = user.profilePicture;
    if (pic && pic !== 'null' && pic !== 'undefined' && /^(https?:\/\/|\/)/.test(pic)) return pic;
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name || 'User') + '&background=E0B973&color=3B1D14&size=' + sz;
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
        
        currentAvatar.src = getProfilePicture(currentMatch);
        currentAvatar.alt = currentMatch.name;
        currentUserName.textContent = currentMatch.name;
        currentUserGenre.textContent = currentMatch.genre || 'Reader';
        
        if (currentStatus) {
            currentStatus.className = `status-indicator ${currentMatch.online ? 'online' : 'offline'}`;
        }
        
        currentMatch.unreadCount = 0;
        
        renderMatches();
        
        welcomeState.style.display = 'none';
        messagesContainer.style.display = 'flex';
        messageInputWrapper.style.display = 'flex';
        
        if (chatSocket && chatSocket.connected && isRealUserId(currentMatch._id || currentMatch.id)) {
            showMessageLoading('Loading conversation...');
            requestChatHistory(currentMatch._id || currentMatch.id);
        } else {
            await loadMessages(currentMatch);
        }
        
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
        
        const token = getAuthToken();
        const currentUserId = getCurrentUserId();
        
        if (token && currentMatch._id) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/chat/messages/${currentMatch._id}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        currentConversationId = data.conversationId;
                        
                        // Filter out unsent and deleted messages
                        const visibleMessages = data.messages.filter(m => {
                            if (m.unsent) return false;
                            if (m.deletedFor && m.deletedFor.some(id => id.toString() === currentUserId)) return false;
                            return true;
                        });
                        
                        currentMatch.messages = visibleMessages.map(m => ({
                            id: m._id,
                            _id: m._id,
                            type: m.sender === currentUserId ? 'sent' : 'received',
                            text: m.content || '',
                            attachment: m.attachment,
                            time: m.time || (m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''),
                            createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                            sender: m.sender
                        }));
                        
                        // Update preview
                        if (currentMatch.messages.length > 0) {
                            const lastMsg = currentMatch.messages[currentMatch.messages.length - 1];
                            currentMatch.preview = lastMsg.text ? 
                                (lastMsg.text.length > 30 ? lastMsg.text.substring(0, 27) + '...' : lastMsg.text) : 
                                (lastMsg.attachment ? '📎 Attachment' : 'No messages yet');
                        } else {
                            currentMatch.preview = 'No messages yet';
                        }
                        
                        if (currentMatch.messages.length > 0) {
                            renderMessages(currentMatch.messages, currentMatch);
                        } else {
                            showEmptyConversation(currentMatch);
                        }
                        hideMessageLoading();
                        return;
                    }
                }
            } catch (e) {
                console.warn('Could not fetch messages from API:', e);
            }
        }
        
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

async function refreshCurrentConversation() {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    
    console.log('🔄 Refreshing conversation...');
    
    const token = getAuthToken();
    const currentUserId = getCurrentUserId();
    
    if (token && currentMatch._id) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/chat/messages/${currentMatch._id}`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    currentConversationId = data.conversationId;
                    
                    const visibleMessages = data.messages.filter(m => {
                        if (m.unsent) return false;
                        if (m.deletedFor && m.deletedFor.some(id => id.toString() === currentUserId)) return false;
                        return true;
                    });
                    
                    currentMatch.messages = visibleMessages.map(m => ({
                        id: m._id,
                        _id: m._id,
                        type: m.sender === currentUserId ? 'sent' : 'received',
                        text: m.content || '',
                        attachment: m.attachment,
                        time: m.time || (m.createdAt ? new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''),
                        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                        sender: m.sender
                    }));
                    
                    if (currentMatch.messages.length > 0) {
                        const lastMsg = currentMatch.messages[currentMatch.messages.length - 1];
                        currentMatch.preview = lastMsg.text ? 
                            (lastMsg.text.length > 30 ? lastMsg.text.substring(0, 27) + '...' : lastMsg.text) : 
                            (lastMsg.attachment ? '📎 Attachment' : 'No messages yet');
                    } else {
                        currentMatch.preview = 'No messages yet';
                    }
                    
                    if (currentMatch.messages.length > 0) {
                        renderMessages(currentMatch.messages, currentMatch);
                    } else {
                        showEmptyConversation(currentMatch);
                    }
                    
                    renderMatches();
                }
            }
        } catch (e) {
            console.warn('Could not refresh messages:', e);
        }
    }
}

// ===== UPDATED renderMessages function - messages at bottom, only own actions =====
function renderMessages(messages, currentMatch) {
    if (!messagesContainer || !currentMatch) return;
    
    if (!messages || messages.length === 0) {
        showEmptyConversation(currentMatch);
        return;
    }
    
    const currentUserId = getCurrentUserId();
    
    // Sort messages by createdAt (oldest first for proper order)
    const sortedMessages = [...messages].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt) : (a.time ? parseTimeToDate(a.time) : new Date(0));
        const timeB = b.createdAt ? new Date(b.createdAt) : (b.time ? parseTimeToDate(b.time) : new Date(0));
        return timeA - timeB;
    });
    
    const messagesHtml = sortedMessages.map(msg => {
        const msgId = String(msg.id || msg._id || '');
        const isSent = msg.type === 'sent';
        
        // Check if this message belongs to current user
        const isOwnMessage = isSent || (msg.sender && msg.sender.toString() === currentUserId);
        
        // Only show action buttons for user's OWN messages that are real (not pending)
        let actionsHtml = '';
        if (isOwnMessage && msgId && !msgId.startsWith('pending-') && !msgId.startsWith('att-')) {
            actionsHtml = `
                <div class="msg-actions">
                    <button class="msg-action-btn msg-unsend" data-id="${msgId}" title="Unsend for everyone">
                        <i class="fas fa-undo-alt"></i> Unsend
                    </button>
                    <button class="msg-action-btn msg-delete" data-id="${msgId}" title="Delete for me">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
        }
        
        if (msg.attachment && msg.attachment.data) {
            return renderAttachmentMessage(msg, currentMatch, actionsHtml, msgId, isSent);
        }
        
        const avatarHtml = (!isSent) ? `
            <div class="avatar-wrapper">
                <img src="${getProfilePicture(currentMatch, 32)}" alt="${currentMatch.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
            </div>
        ` : '';
        
        return `
            <div class="message ${msg.type}" data-msg-id="${msgId}">
                ${avatarHtml}
                <div class="message-content">
                    ${actionsHtml}
                    <div class="message-bubble">${escapeHtml(msg.text || '')}</div>
                    <div class="message-time">${msg.time || ''}</div>
                </div>
            </div>
        `;
    }).join('');
    
    messagesContainer.innerHTML = messagesHtml;
    
    // Scroll to bottom after rendering
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
    
    // Wire up action buttons
    messagesContainer.querySelectorAll('.msg-unsend').forEach(btn =>
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            unsendMessage(btn.dataset.id);
        })
    );
    messagesContainer.querySelectorAll('.msg-delete').forEach(btn =>
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteForMe(btn.dataset.id);
        })
    );
    
    hideMessageLoading();
}

function renderAttachmentMessage(msg, currentMatch, actionsHtml, msgId, isSent) {
    const att = msg.attachment || {};
    const caption = escapeHtml(msg.text || att.caption || '');
    const isImage = att.category === 'image' || att.type === 'image' || (att.mimeType && att.mimeType.startsWith('image/'));
    
    // Build data URL for display
    let imgSrc = '';
    if (att.data) {
        imgSrc = `data:${att.mimeType || 'image/jpeg'};base64,${att.data}`;
    } else if (att.url) {
        imgSrc = att.url.startsWith('http') ? att.url : API_BASE_URL + att.url;
    }
    
    const avatarHtml = (!isSent) ? `
        <div class="avatar-wrapper">
            <img src="${getProfilePicture(currentMatch, 32)}" alt="${currentMatch.name}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentMatch.name)}&background=E0B973&color=3B1D14&size=32'">
        </div>
    ` : '';
    
    if (isImage && imgSrc) {
        return `
            <div class="message ${msg.type}" data-msg-id="${msgId}">
                ${avatarHtml}
                <div class="message-content">
                    ${actionsHtml}
                    <div class="message-bubble attachment">
                        <img src="${imgSrc}" alt="Shared image" class="attachment-image" onclick="window.open('${imgSrc}','_blank')" onerror="this.parentElement.innerHTML='<span style=\"color:#d4b5a0;font-size:.85rem\">Image unavailable</span>'">
                        ${caption ? `<p class="attachment-caption">${caption}</p>` : ''}
                    </div>
                    <div class="message-time">${msg.time || ''}</div>
                </div>
            </div>
        `;
    }
    
    // File attachment
    const filename = att.filename || 'File';
    const filesize = att.size || 0;
    const downloadUrl = att.data ? `data:${att.mimeType || 'application/octet-stream'};base64,${att.data}` : (att.url || '#');
    
    return `
        <div class="message ${msg.type}" data-msg-id="${msgId}">
            ${avatarHtml}
            <div class="message-content">
                ${actionsHtml}
                <div class="message-bubble attachment">
                    <div class="file-attachment" onclick="LitlinkChat.downloadAttachment('${downloadUrl}', '${escapeHtml(filename)}', '${att.mimeType || ''}')">
                        <i class="fas ${getFileIcon(filename)}"></i>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(filename)}</div>
                            <div class="file-size">${formatFileSize(filesize)}</div>
                        </div>
                        <i class="fas fa-download download-icon"></i>
                    </div>
                    ${caption ? `<p class="attachment-caption">${caption}</p>` : ''}
                </div>
                <div class="message-time">${msg.time || ''}</div>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        webp: 'fa-file-image',
        mp3: 'fa-file-audio',
        mp4: 'fa-file-video',
        zip: 'fa-file-archive',
        rar: 'fa-file-archive'
    };
    return icons[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
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
        
        if (!text) {
            return;
        }
        
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        const recipientId = currentMatch._id || currentMatch.id;
        const useWebSocket = chatSocket && chatSocket.connected && isRealUserId(recipientId);
        
        if (useWebSocket && text) {
            if (sendChatWebSocket(recipientId, text)) {
                if (!currentMatch.messages) currentMatch.messages = [];
                
                currentMatch.messages.push({
                    id: 'pending-' + Date.now(),
                    type: 'sent',
                    text: text,
                    time: time,
                    createdAt: now
                });
                
                messageInput.value = '';
                currentMatch.preview = text.length > 30 ? text.substring(0, 27) + '...' : text;
                
                renderMatches();
                renderMessages(currentMatch.messages, currentMatch);
                
                const totalMessages = matches.reduce((total, match) => total + (match.messages ? match.messages.length : 0), 0);
                document.getElementById('statMessages').textContent = totalMessages;
            }
        } else if (text) {
            const newMessage = { 
                id: Date.now(), 
                type: 'sent', 
                text: text, 
                time: time,
                createdAt: now
            };
            
            if (!currentMatch.messages) currentMatch.messages = [];
            currentMatch.messages.push(newMessage);
            
            messageInput.value = '';
            currentMatch.preview = text.length > 30 ? text.substring(0, 27) + '...' : text;
            
            renderMatches();
            renderMessages(currentMatch.messages, currentMatch);
            
            const totalMessages = matches.reduce((total, match) => total + (match.messages?.length || 0), 0);
            document.getElementById('statMessages').textContent = totalMessages;
            
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
    if (chatSocket && chatSocket.connected) return;
    
    showTypingIndicator(currentMatch);
    
    setTimeout(() => {
        removeTypingIndicator();
        
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
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        const responseMessage = {
            id: Date.now() + 1,
            type: 'received',
            text: randomResponse,
            time: time,
            createdAt: now
        };
        
        currentMatch.messages.push(responseMessage);
        currentMatch.preview = randomResponse.length > 30 ? randomResponse.substring(0, 27) + '...' : randomResponse;
        
        renderMatches();
        renderMessages(currentMatch.messages, currentMatch);
        
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
    if (emojiPicker) {
        emojiPicker.remove();
        emojiPicker = null;
        return;
    }
    
    emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-picker';
    
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
    
    const rect = emojiBtn.getBoundingClientRect();
    emojiPicker.style.position = 'absolute';
    emojiPicker.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
    emojiPicker.style.left = rect.left + 'px';
    
    document.body.appendChild(emojiPicker);
    
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
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    messageInput.focus();
    
    if (emojiPicker) {
        emojiPicker.remove();
        emojiPicker = null;
    }
}

// ===== FILE ATTACHMENTS =====
const ALLOWED_ATTACH_TYPES = {
    'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
    'application/pdf': 'document',
    'application/msword': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'text/plain': 'document'
};
const MAX_ATTACH_BYTES = 6 * 1024 * 1024;

function setupFileInput() {
    if (!attachBtn) return;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,.doc,.docx,.txt';
    fileInput.multiple = false;
    document.body.appendChild(fileInput);
    attachBtn.addEventListener('click', () => {
        if (!matches.find(m => m.active)) { showNotification('Select a conversation first', 'warning'); return; }
        fileInput.value = '';
        fileInput.click();
    });
    fileInput.addEventListener('change', handleFileSelect);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const category = ALLOWED_ATTACH_TYPES[file.type];
    if (!category) { showNotification('Only JPEG/PNG/GIF/WebP, PDF, Word, or TXT allowed.', 'error'); fileInput.value = ''; return; }
    if (file.size > MAX_ATTACH_BYTES) { showNotification('File too large — max 6 MB.', 'error'); fileInput.value = ''; return; }
    showAttachPreview(file, category);
}

function showAttachPreview(file, category) {
    closeAttachPreview();
    const overlay = document.createElement('div');
    overlay.id = 'attachPreviewOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#2c1810;border-radius:16px;padding:24px;max-width:440px;width:100%;border:1px solid rgba(245,230,211,0.15);display:flex;flex-direction:column;gap:16px;';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const closeX = document.createElement('button');
    closeX.innerHTML = '&times;'; closeX.style.cssText = 'background:none;border:none;color:#d4b5a0;font-size:26px;cursor:pointer;line-height:1;padding:0;'; closeX.onclick = closeAttachPreview;
    hdr.innerHTML = '<span style="font-weight:600;color:#f5e6d3;font-size:1rem;">Send attachment</span>'; hdr.appendChild(closeX);
    const preview = document.createElement('div');
    preview.style.cssText = 'background:#1a0f0a;border-radius:10px;padding:16px;display:flex;align-items:center;gap:14px;min-height:80px;';
    let captionInput = null;
    if (category === 'image') {
        const img = document.createElement('img');
        img.style.cssText = 'max-width:100%;max-height:260px;border-radius:8px;display:block;margin:0 auto;object-fit:contain;'; img.alt = file.name;
        const reader = new FileReader(); reader.onload = ev => { img.src = ev.target.result; }; reader.readAsDataURL(file);
        preview.style.justifyContent = 'center'; preview.appendChild(img);
        captionInput = document.createElement('input'); captionInput.type = 'text'; captionInput.placeholder = 'Add a caption… (optional)'; captionInput.maxLength = 200;
        captionInput.style.cssText = 'width:100%;padding:10px 14px;border-radius:8px;background:#1a0f0a;border:1px solid #5c3a28;color:#f5e6d3;font-family:inherit;font-size:.9rem;outline:none;';
        captionInput.addEventListener('focus', () => captionInput.style.borderColor = '#e0b973');
        captionInput.addEventListener('blur',  () => captionInput.style.borderColor = '#5c3a28');
    } else {
        preview.innerHTML = '<div style="width:48px;height:48px;background:#3d2617;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas ' + getFileIcon(file.name) + '" style="font-size:22px;color:#e0b973;"></i></div><div style="overflow:hidden;"><div style="color:#f5e6d3;font-size:.9rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(file.name) + '</div><div style="color:#d4b5a0;font-size:.8rem;margin-top:4px;">' + formatFileSize(file.size) + '</div></div>';
    }
    const hint = document.createElement('div'); hint.style.cssText = 'color:#d4b5a0;font-size:.75rem;text-align:center;';
    hint.textContent = category === 'image' ? 'Images: JPEG · PNG · GIF · WebP — max 6 MB' : 'Docs: PDF · DOC · DOCX · TXT — max 6 MB';
    const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:10px;';
    const cancelBtn2 = document.createElement('button'); cancelBtn2.textContent = 'Cancel'; cancelBtn2.style.cssText = 'flex:1;padding:11px;border-radius:8px;border:1px solid #5c3a28;background:transparent;color:#f5e6d3;cursor:pointer;font-size:.9rem;font-weight:500;'; cancelBtn2.onclick = closeAttachPreview;
    const sendBtn2   = document.createElement('button'); sendBtn2.innerHTML = '<i class="fas fa-paper-plane"></i> Send'; sendBtn2.style.cssText = 'flex:1;padding:11px;border-radius:8px;border:none;background:#e0b973;color:#2c1810;cursor:pointer;font-size:.9rem;font-weight:600;';
    sendBtn2.onclick = () => sendAttachment(file, category, captionInput ? captionInput.value.trim() : '');
    btnRow.appendChild(cancelBtn2); btnRow.appendChild(sendBtn2);
    box.appendChild(hdr); box.appendChild(preview); if (captionInput) box.appendChild(captionInput); box.appendChild(hint); box.appendChild(btnRow);
    overlay.appendChild(box); document.body.appendChild(overlay);
    overlay.addEventListener('click', ev => { if (ev.target === overlay) closeAttachPreview(); });
    overlay._esc = ev => { if (ev.key === 'Escape') closeAttachPreview(); }; document.addEventListener('keydown', overlay._esc);
}

function closeAttachPreview() {
    const overlay = document.getElementById('attachPreviewOverlay');
    if (overlay) { if (overlay._esc) document.removeEventListener('keydown', overlay._esc); overlay.remove(); }
    if (fileInput) fileInput.value = '';
}

async function sendAttachment(file, category, caption) {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    closeAttachPreview();
    const sendBtnEl = document.getElementById('sendBtn');
    if (sendBtnEl) { sendBtnEl.disabled = true; sendBtnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = ev => resolve(ev.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const token = getAuthToken();
        const res   = await fetch(API_BASE_URL + '/api/chat/messages/attachment', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: currentMatch._id || currentMatch.id, data: base64, mimeType: file.type, filename: file.name, size: file.size, category, caption })
        });
        const result = await res.json();
        if (result.suspended) {
            showContentWarningBanner(result.message, 'suspended');
            throw new Error('suspended');
        }
        if (!res.ok || !result.success) {
            if (result.warningIssued) showContentWarningBanner(result.message, 'warning');
            throw new Error(result.message || 'Send failed');
        }
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        if (!currentMatch.messages) currentMatch.messages = [];
        currentMatch.messages.push({ 
            id: result.message._id || ('att-' + Date.now()), 
            _id: result.message._id,
            type: 'sent', 
            attachment: { data: base64, mimeType: file.type, filename: file.name, size: file.size, category }, 
            text: caption || '', 
            time,
            createdAt: now
        });
        currentMatch.preview = category === 'image' ? '📷 Sent a photo' : '📎 Sent a file';
        renderMatches();
        renderMessages(currentMatch.messages, currentMatch);
        document.getElementById('statMessages').textContent = matches.reduce((t, m) => t + (m.messages ? m.messages.length : 0), 0);
        showNotification(category === 'image' ? 'Photo sent!' : 'File sent!', 'success');
        if (result.warningIssued && result.warningMessage) {
            showContentWarningBanner(result.warningMessage, 'warning');
        }
    } catch (err) {
        console.error('Attachment error:', err);
        showNotification('Failed to send: ' + err.message, 'error');
    } finally {
        if (sendBtnEl) { sendBtnEl.disabled = false; sendBtnEl.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
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
    if (!messagesContainer) return;
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
// ── Content warning banner ─────────────────────────────────────────────────
(function() {
    const s = document.createElement('style');
    s.textContent = `
        @keyframes cwSlideDown { from { transform: translateX(-50%) translateY(-20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @keyframes cwFadeOut   { to   { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
    `;
    document.head.appendChild(s);
})();

function showContentWarningBanner(message, type) {
    type = type || 'warning';
    document.querySelectorAll('.content-warning-banner').forEach(function(b) { b.remove(); });

    var palette = {
        warning:  { bg: '#5c3200', border: '#E0B973', icon: '⚠️' },
        blocked:  { bg: '#5c0a0a', border: '#e06060', icon: '🚫' },
        suspended:{ bg: '#2d1a5c', border: '#a06de0', icon: '⛔' }
    };
    var p = palette[type] || palette.warning;

    var banner = document.createElement('div');
    banner.className = 'content-warning-banner';
    banner.style.cssText = [
        'position:fixed', 'top:70px', 'left:50%', 'transform:translateX(-50%)',
        'background:' + p.bg, 'border:1px solid ' + p.border, 'border-radius:12px',
        'padding:14px 20px', 'z-index:9999', 'max-width:500px', 'width:90%',
        'box-shadow:0 8px 32px rgba(0,0,0,.55)', 'display:flex', 'align-items:flex-start',
        'gap:12px', 'animation:cwSlideDown .25s ease'
    ].join(';');

    banner.innerHTML =
        '<span style="font-size:1.4rem;flex-shrink:0;line-height:1">' + p.icon + '</span>' +
        '<div style="flex:1;color:#f0dcc8;font-size:.9rem;line-height:1.55">' + message + '</div>' +
        '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#a89070;' +
        'cursor:pointer;font-size:1.1rem;padding:0 0 0 8px;flex-shrink:0;line-height:1">✕</button>';

    document.body.appendChild(banner);

    var dur = type === 'suspended' ? 9000 : 5500;
    setTimeout(function() {
        banner.style.animation = 'cwFadeOut .3s ease forwards';
        setTimeout(function() { banner.remove(); }, 300);
    }, dur);
}

function showNotification(message, type = 'info') {
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
        <span class="notification-icon">${icons[type] || 'ℹ️'}</span>
        <span class="notification-message">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
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
    
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            e.target !== sidebarToggle &&
            e.target !== menuToggle) {
            sidebar.classList.remove('open');
        }
    });
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('open');
        }
    });
}

// ===== MESSAGE ACTIONS =====
async function unsendMessage(messageId) {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    
    if (!confirm('Unsend this message for everyone? This cannot be undone.')) return;
    
    // Optimistic UI: remove immediately from local state
    if (currentMatch.messages) {
        currentMatch.messages = currentMatch.messages.filter(m => String(m.id || m._id) !== String(messageId));
        renderMessages(currentMatch.messages, currentMatch);
    }
    
    try {
        const token = getAuthToken();
        const res = await fetch(API_BASE_URL + '/api/chat/messages/' + messageId + '/unsend', { 
            method: 'DELETE', 
            headers: { 'Authorization': 'Bearer ' + token } 
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
        
        showNotification('Message unsent for everyone', 'success');
        // Refresh from server to confirm final state
        await refreshCurrentConversation();
    } catch (err) { 
        console.error('Unsend error:', err);
        showNotification('Could not unsend: ' + err.message, 'error');
        // Revert optimistic update on failure
        await refreshCurrentConversation();
    }
}

async function deleteForMe(messageId) {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) return;
    
    if (!confirm('Delete this message only for yourself? The other person will still see it.')) return;
    
    // Optimistic UI: remove immediately from local state
    if (currentMatch.messages) {
        currentMatch.messages = currentMatch.messages.filter(m => String(m.id || m._id) !== String(messageId));
        renderMessages(currentMatch.messages, currentMatch);
    }
    
    try {
        const token = getAuthToken();
        const res = await fetch(API_BASE_URL + '/api/chat/messages/' + messageId + '/delete-for-me', { 
            method: 'DELETE', 
            headers: { 'Authorization': 'Bearer ' + token } 
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
        
        showNotification('Message deleted for you', 'info');
        // Refresh from server to confirm final state
        await refreshCurrentConversation();
    } catch (err) { 
        console.error('Delete error:', err);
        showNotification('Could not delete: ' + err.message, 'error');
        // Revert optimistic update on failure
        await refreshCurrentConversation();
    }
}

// ===== BLOCK & REPORT =====

/** Show the block/report modal for the currently active match */
function showBlockReportModal() {
    const currentMatch = matches.find(m => m.active);
    if (!currentMatch) {
        showNotification('Select a conversation first', 'warning');
        return;
    }

    // Remove any existing modal
    const old = document.getElementById('blockReportModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'blockReportModal';
    modal.className = 'br-modal-overlay';
    modal.innerHTML = `
        <div class="br-modal">
            <div class="br-modal-header">
                <h3><i class="fas fa-shield-alt"></i> Block or Report</h3>
                <button class="br-close-btn" id="brCloseBtn"><i class="fas fa-times"></i></button>
            </div>
            <div class="br-modal-body">
                <div class="br-user-info">
                    <img src="${getProfilePicture(currentMatch, 48)}" alt="${escapeHtml(currentMatch.name)}" class="br-avatar">
                    <span class="br-username">${escapeHtml(currentMatch.name)}</span>
                </div>

                <!-- TABS -->
                <div class="br-tabs">
                    <button class="br-tab active" data-tab="report">📋 Report</button>
                    <button class="br-tab" data-tab="block">🚫 Block</button>
                </div>

                <!-- REPORT PANEL -->
                <div class="br-panel" id="brReportPanel">
                    <p class="br-panel-desc">Reports are reviewed by our moderation team and kept confidential.</p>
                    <label class="br-label">Category</label>
                    <select class="br-select" id="brCategory">
                        <option value="harassment">Harassment</option>
                        <option value="inappropriate_content">Inappropriate Content</option>
                        <option value="hate_speech">Hate Speech</option>
                        <option value="spam">Spam</option>
                        <option value="fake_account">Fake Account</option>
                        <option value="impersonation">Impersonation</option>
                        <option value="privacy_violation">Privacy Violation</option>
                        <option value="other">Other</option>
                    </select>
                    <label class="br-label">Reason <span class="br-required">*</span></label>
                    <input type="text" class="br-input" id="brReason" placeholder="Briefly describe the issue..." maxlength="200">
                    <label class="br-label">Additional details (optional)</label>
                    <textarea class="br-textarea" id="brDescription" placeholder="Include any extra context that may help our team..." maxlength="1000" rows="3"></textarea>
                    <button class="br-submit-btn br-report-btn" id="brSubmitReport">
                        <i class="fas fa-flag"></i> Submit Report
                    </button>
                </div>

                <!-- BLOCK PANEL -->
                <div class="br-panel" id="brBlockPanel" style="display:none;">
                    <div class="br-block-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Blocking <strong>${escapeHtml(currentMatch.name)}</strong> will:</p>
                        <ul>
                            <li>Hide their messages from your chat</li>
                            <li>Notify our moderation team</li>
                        </ul>
                        <p class="br-note">You can unblock users from your profile settings.</p>
                    </div>
                    <button class="br-submit-btn br-block-btn" id="brSubmitBlock">
                        <i class="fas fa-ban"></i> Block ${escapeHtml(currentMatch.name)}
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Tab switching
    modal.querySelectorAll('.br-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            modal.querySelectorAll('.br-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('brReportPanel').style.display = tab.dataset.tab === 'report' ? '' : 'none';
            document.getElementById('brBlockPanel').style.display  = tab.dataset.tab === 'block'  ? '' : 'none';
        });
    });

    // Close
    document.getElementById('brCloseBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Submit report
    document.getElementById('brSubmitReport').addEventListener('click', () => {
        const reason   = document.getElementById('brReason').value.trim();
        const category = document.getElementById('brCategory').value;
        const desc     = document.getElementById('brDescription').value.trim();
        if (!reason) { showNotification('Please enter a reason', 'warning'); return; }
        reportUser(currentMatch._id || currentMatch.id, reason, category, desc, modal);
    });

    // Submit block
    document.getElementById('brSubmitBlock').addEventListener('click', () => {
        blockUser(currentMatch._id || currentMatch.id, currentMatch.name, modal);
    });
}

async function reportUser(userId, reason, category, description, modal) {
    const btn = document.getElementById('brSubmitReport');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/chat/report/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason, category, description })
        });
        const data = await res.json();

        if (data.success) {
            if (modal) modal.remove();
            showNotification('Report submitted. Thank you for keeping Litlink safe! 🛡️', 'success');
        } else {
            throw new Error(data.message || 'Failed to submit report');
        }
    } catch (err) {
        console.error('Report error:', err);
        showNotification(err.message || 'Could not submit report', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report'; }
    }
}

async function blockUser(userId, userName, modal) {
    const btn = document.getElementById('brSubmitBlock');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Blocking...'; }

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/chat/block/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (data.success) {
            if (modal) modal.remove();
            showNotification(`${userName} has been blocked.`, 'success');

            // Remove the blocked user from matches list
            matches = matches.filter(m => (m._id || m.id) !== userId);
            renderMatches();

            // Reset chat area to welcome state
            if (welcomeState) welcomeState.style.display = '';
            if (messagesContainer) messagesContainer.style.display = 'none';
            if (messageInputWrapper) messageInputWrapper.style.display = 'none';
            if (currentUserName) currentUserName.textContent = 'Select a match to chat';
            if (currentUserGenre) currentUserGenre.textContent = 'Click on a match from the sidebar';
        } else {
            throw new Error(data.message || 'Failed to block user');
        }
    } catch (err) {
        console.error('Block error:', err);
        showNotification(err.message || 'Could not block user', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-ban"></i> Block ' + escapeHtml(userName); }
    }
}

// ===== STARTUP =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 Litlink Chat loading...');
    try {
        await initializeChat();
        const targetUserId = new URLSearchParams(window.location.search).get('userId');
        if (targetUserId) {
            const trySwitch = async (n) => {
                const m = matches.find(x => (x._id || x.id) === targetUserId);
                if (m) await switchMatch(targetUserId);
                else if (n > 0) setTimeout(() => trySwitch(n - 1), 400);
            };
            await trySwitch(12);
        }
    } catch (err) {
        console.error('Failed to initialize chat:', err);
        showNotification('Failed to load chat interface', 'error');
    }
    setTimeout(() => { if (messageInput) messageInput.focus(); }, 500);
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
    showBlockReportModal,
    blockUser,
    reportUser,
    unsendMessage,
    deleteForMe,
    useSuggestedMessage: (message) => {
        if (messageInput) {
            messageInput.value = message;
            messageInput.focus();
            sendMessage();
        }
    },
    downloadAttachment: (url, filename, mimeType) => {
        try {
            if (url.startsWith('data:')) {
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else if (url.startsWith('http')) {
                window.open(url, '_blank');
            } else {
                console.warn('Invalid download URL');
                showNotification('Could not download file', 'warning');
            }
        } catch (err) {
            console.error('Download error:', err);
            showNotification('Failed to download file', 'error');
        }
    }
};

console.log('✅ Chat.js loaded successfully');