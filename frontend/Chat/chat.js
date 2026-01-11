// ===== STATE MANAGEMENT =====
let currentUser = null;
let currentMatchId = null;
let matches = [];

// ===== DOM ELEMENTS =====
const matchesList = document.getElementById('matchesList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const currentAvatar = document.getElementById('currentAvatar');
const currentUserName = document.getElementById('currentUserName');
const currentUserGenre = document.getElementById('currentUserGenre');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const menuToggle = document.getElementById('menuToggle');
const messageInputWrapper = document.getElementById('messageInputWrapper');
const welcomeState = document.getElementById('welcomeState');

// ===== INITIALIZATION =====
async function initializeChat() {
    try {
        console.log('🚀 Initializing chat...');
        
        // Get user from localStorage
        const userStr = localStorage.getItem('litlink_user');
        if (userStr) {
            currentUser = JSON.parse(userStr);
            console.log('✅ User found:', currentUser.name);
        } else {
            console.log('⚠️ No user data found');
            showNotification('Please login to chat', 'info');
            return;
        }
        
        // Load demo matches
        loadDemoMatches();
        
        // Initialize event listeners
        initializeEventListeners();
        
        console.log('✅ Chat initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing chat:', error);
        showNotification('Failed to load chat', 'error');
        loadDemoData();
    }
}

// ===== LOAD DEMO MATCHES =====
function loadDemoMatches() {
    matches = [
        {
            id: 'match_1',
            name: 'Eleanor Vance',
            avatar: 'https://i.pravatar.cc/150?img=45',
            genre: 'Horror • Gothic',
            preview: 'Have you read The Haunting of Hill House?',
            online: true,
            notifications: 2,
            active: false,
            messages: []
        },
        {
            id: 'match_2',
            name: 'Julian Blackthorn',
            avatar: 'https://i.pravatar.cc/150?img=12',
            genre: 'Literary Fiction • Mystery',
            preview: 'Just finished The Secret History!',
            online: true,
            notifications: 0,
            active: false,
            messages: []
        },
        {
            id: 'match_3',
            name: 'Jo March',
            avatar: 'https://i.pravatar.cc/150?img=32',
            genre: 'Classics • Coming of Age',
            preview: 'Little Women is my comfort read 📚',
            online: true,
            notifications: 1,
            active: false,
            messages: []
        },
        {
            id: 'match_4',
            name: 'Dorian Gray',
            avatar: 'https://i.pravatar.cc/150?img=33',
            genre: 'Philosophy • Gothic',
            preview: 'The Picture of Dorian Gray discussion?',
            online: false,
            notifications: 0,
            active: false,
            messages: []
        }
    ];
    
    // Update stats
    document.getElementById('statMatches').textContent = matches.length;
    document.getElementById('statOnline').textContent = matches.filter(m => m.online).length;
    
    // Render matches
    renderMatches();
}

// ===== RENDER FUNCTIONS =====
function renderMatches() {
    if (!matchesList) return;
    
    matchesList.innerHTML = matches.map(match => `
        <div class="match-item ${match.active ? 'active' : ''}" data-id="${match.id}">
            <div class="avatar-wrapper">
                <img src="${match.avatar}" alt="${match.name}" class="avatar">
                <span class="status-indicator ${match.online ? 'online' : ''}"></span>
                ${match.notifications > 0 ? `<span class="notification-badge">${match.notifications}</span>` : ''}
            </div>
            <div class="match-info">
                <h3 class="match-name">${match.name}</h3>
                <p class="match-genre">${match.genre}</p>
                <p class="match-preview">${match.preview}</p>
            </div>
            <div class="compatibility-badge">${Math.floor(Math.random() * 30) + 70}%</div>
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

async function switchMatch(matchId) {
    try {
        console.log(`🔄 Switching to match: ${matchId}`);
        
        // Update active states
        matches.forEach(match => {
            match.active = match.id === matchId;
        });
        
        // Find the match
        const currentMatch = matches.find(m => m.id === matchId);
        if (!currentMatch) {
            console.error('Match not found:', matchId);
            return;
        }
        
        // Update chat header
        currentAvatar.src = currentMatch.avatar;
        currentAvatar.alt = currentMatch.name;
        currentUserName.textContent = currentMatch.name;
        currentUserGenre.textContent = currentMatch.genre;
        
        // Clear notifications for this match
        currentMatch.notifications = 0;
        
        // Re-render matches list
        renderMatches();
        
        // Hide welcome state, show chat
        welcomeState.style.display = 'none';
        messagesContainer.style.display = 'flex';
        messageInputWrapper.style.display = 'flex';
        
        // Load messages
        await loadMessages(currentMatch);
        
        // Update message count
        const totalMessages = matches.reduce((total, match) => total + (match.messages?.length || 0), 0);
        document.getElementById('statMessages').textContent = totalMessages;
        
    } catch (error) {
        console.error('❌ Error switching match:', error);
        showNotification('Failed to load conversation', 'error');
    }
}

async function loadMessages(currentMatch) {
    try {
        // Show loading
        showMessageLoading();
        
        // Generate demo messages if none exist
        if (!currentMatch.messages || currentMatch.messages.length === 0) {
            currentMatch.messages = [
                {
                    id: 1,
                    type: 'received',
                    text: `Hi ${currentUser?.name?.split(' ')[0] || 'there'}! I noticed we both enjoy ${currentMatch.genre.split('•')[0].trim()} books. What are you reading right now?`,
                    time: '10:30 AM'
                },
                {
                    id: 2,
                    type: 'sent',
                    text: `Hi ${currentMatch.name.split(' ')[0]}! I'm currently reading "The Silent Patient". Have you read it?`,
                    time: '10:32 AM'
                },
                {
                    id: 3,
                    type: 'received',
                    text: 'Yes, I loved it! The twist was incredible. Do you enjoy psychological thrillers?',
                    time: '10:35 AM'
                }
            ];
        }
        
        // Render messages
        renderMessages(currentMatch.messages, currentMatch);
        
    } catch (error) {
        console.error('Error loading messages:', error);
        currentMatch.messages = [
            {
                id: 1,
                type: 'received',
                text: 'Hello! Nice to meet you. What brings you to Litlink?',
                time: 'Just now'
            }
        ];
        renderMessages(currentMatch.messages, currentMatch);
    }
}

function renderMessages(messages, currentMatch) {
    if (!messagesContainer || !currentMatch) return;
    
    messagesContainer.innerHTML = messages.map(msg => {
        return `
            <div class="message ${msg.type} message-loading">
                ${msg.type === 'received' ? `
                    <div class="avatar-wrapper">
                        <img src="${currentMatch.avatar}" alt="${currentMatch.name}" class="avatar">
                    </div>
                ` : ''}
                <div class="message-content">
                    <div class="message-bubble">${msg.text}</div>
                    <div class="message-time">${msg.time}</div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    setTimeout(() => {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
    
    // Hide loading
    hideMessageLoading();
}

// ===== MESSAGE SENDING =====
async function sendMessage() {
    try {
        const text = messageInput.value.trim();
        if (!text) return;

        const currentMatch = matches.find(m => m.active);
        if (!currentMatch) {
            showNotification('No active conversation', 'warning');
            return;
        }

        // Get current time
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        // Create message object
        const newMessage = {
            id: Date.now(),
            type: 'sent',
            text: text,
            time: time
        };

        // Add to messages
        if (!currentMatch.messages) currentMatch.messages = [];
        currentMatch.messages.push(newMessage);

        // Clear input
        messageInput.value = '';

        // Update match preview
        currentMatch.preview = text.length > 30 ? text.substring(0, 27) + '...' : text;
        
        // Re-render
        renderMatches();
        renderMessages(currentMatch.messages, currentMatch);
        
        // Update message count
        const totalMessages = matches.reduce((total, match) => total + (match.messages?.length || 0), 0);
        document.getElementById('statMessages').textContent = totalMessages;

        // Simulate response after 1-2 seconds
        if (currentMatch.online) {
            simulateResponse(currentMatch);
        }

    } catch (error) {
        console.error('❌ Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
}

function simulateResponse(currentMatch) {
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

function showTypingIndicator(currentMatch) {
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message received message-loading';
    typingIndicator.innerHTML = `
        <div class="avatar-wrapper">
            <img src="${currentMatch.avatar}" alt="Typing" class="avatar">
        </div>
        <div class="message-content">
            <div class="message-bubble typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return typingIndicator;
}

// ===== LOADING STATES =====
function showMessageLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message-loading-state';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <span>Loading messages...</span>
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
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    const icons = {
        success: '✓',
        info: 'ℹ️',
        warning: '⚠️',
        error: '✕'
    };
    
    const colors = {
        success: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        error: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease-out;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
    `;
    
    notification.innerHTML = `
        <span style="font-size: 20px;">${icons[type]}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
    
    // Add animation styles if not already added
    if (!document.getElementById('notification-animations')) {
        const style = document.createElement('style');
        style.id = 'notification-animations';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Send message button
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter key in message input
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
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
            e.target !== sidebarToggle) {
            sidebar.classList.remove('open');
        }
    });
}

// ===== DEMO DATA FALLBACK =====
function loadDemoData() {
    console.log('📦 Loading demo data as fallback...');
    
    // Demo matches
    matches = [
        {
            id: 'demo_1',
            name: 'Demo User',
            avatar: 'https://i.pravatar.cc/150?img=45',
            genre: 'Fiction • Fantasy',
            preview: 'Welcome to Litlink Chat!',
            online: true,
            notifications: 0,
            active: false,
            messages: []
        }
    ];
    
    // Render matches
    renderMatches();
}

// ===== STARTUP =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📚 Litlink Chat loading...');
    
    try {
        await initializeChat();
    } catch (error) {
        console.error('❌ Failed to initialize chat:', error);
        showNotification('Failed to load chat interface', 'error');
        
        // Try to load demo data as last resort
        setTimeout(() => {
            loadDemoData();
        }, 1000);
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

// ===== EXPORT FOR TESTING =====
window.LitlinkChat = {
    initializeChat,
    sendMessage,
    switchMatch,
    showNotification
};

console.log('✅ Chat.js loaded successfully');
