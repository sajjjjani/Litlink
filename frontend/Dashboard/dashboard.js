// Litlink - Book Community Dashboard - Interactive Features with Backend

// ===== AUTHENTICATION & SESSION FUNCTIONS =====

// Check if user is logged in - FIXED VERSION
function checkAuth() {
    const token = localStorage.getItem('litlink_token');
    const user = JSON.parse(localStorage.getItem('litlink_user') || 'null');
    
    // FIXED: Only redirect if NOT authenticated
    if (!token || !user) {
        console.log('❌ No authentication found, redirecting to login...');
        window.location.href = '../Homepage/index.html';
        return null;
    }
    
    console.log('✅ User authenticated:', user.name || user.email);
    return { token, user };
}

// Settings functions
function toggleSettings() {
    const menu = document.getElementById('settingsMenu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

function toggleDarkMode() {
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
        localStorage.setItem('darkMode', toggle.checked);
        console.log('Dark mode:', toggle.checked ? 'enabled' : 'disabled');
    }
}

function toggleNotifications() {
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) {
        localStorage.setItem('notificationsEnabled', toggle.checked);
        console.log('Notifications:', toggle.checked ? 'enabled' : 'disabled');
    }
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.classList.toggle('active');
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear all stored data
        localStorage.removeItem('litlink_token');
        localStorage.removeItem('litlink_user');
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '../Homepage/index.html';
    }
}

function showComingSoon(feature) {
    alert(`${feature} feature is coming soon! Stay tuned for updates.`);
}

// Close settings menu when clicking outside
document.addEventListener('click', function(event) {
    const settingsDropdown = document.querySelector('.settings-dropdown');
    const settingsMenu = document.getElementById('settingsMenu');
    
    if (settingsDropdown && !settingsDropdown.contains(event.target)) {
        if (settingsMenu) {
            settingsMenu.classList.remove('active');
        }
    }
});

// ===== MAIN DASHBOARD LOADING =====

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📚 Dashboard loading...');
    
    // Check authentication - STOPS HERE if not authenticated
    const auth = checkAuth();
    if (!auth) {
        console.log('⛔ Not authenticated, checkAuth() will redirect');
        return; // Will redirect automatically in checkAuth()
    }
    
    const { token, user } = auth;
    
    console.log('✅ Authenticated user:', user.name || user.email);
    console.log('🔑 Token exists:', !!token);
    
    try {
        // Show loading state
        showLoadingState();
        
        // Fetch dashboard data from backend
        console.log('📡 Fetching dashboard data for user:', user.id);
        const dashboardData = await fetchDashboardData(user.id, token);
        
        if (dashboardData.success) {
            console.log('✅ Dashboard data loaded successfully');
            // Populate dashboard with real user data
            populateDashboard(dashboardData.dashboard);
            
            // Initialize all interactive features
            initConnectButtons(token);
            initJoinBoardButtons(token);
            initChatItems();
            initActionCards();
            initVoiceRooms(token);
            initSuggestedReaders(token);
            initViewAllButtons();
            initNotifications();
            
            hideLoadingState();
            
        } else {
            console.warn('⚠️ Failed to load dashboard data:', dashboardData.message);
            showNotification('Using demo data', 'info');
            loadMockData(user);
            hideLoadingState();
        }
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
        showNotification('Connection error. Using demo data.', 'warning');
        loadMockData(user);
        hideLoadingState();
    }
    
    // Explore Community Button
    const exploreBtn = document.querySelector('.explore-btn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', function() {
            showNotification('Exploring community features...', 'info');
        });
    }
    
    // More Button (three dots)
    const moreBtn = document.querySelector('.more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function() {
            showNotification('Opening chat options...', 'info');
        });
    }
    
    // Add hover effects for profile images
    const profileImages = document.querySelectorAll('.match-avatar, .chat-avatar, .profile-img');
    profileImages.forEach(img => {
        img.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) rotate(5deg)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        img.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    });
    
    console.log('📚 Litlink Book Community Dashboard loaded successfully!');
});

// ===== LOADING STATE FUNCTIONS =====

function showLoadingState() {
    console.log('⏳ Loading dashboard...');
}

function hideLoadingState() {
    console.log('✅ Dashboard loaded');
}

// ===== BACKEND INTEGRATION FUNCTIONS =====

async function fetchDashboardData(userId, token) {
    try {
        console.log('📡 Fetching dashboard data for user:', userId);
        
        const response = await fetch(`http://localhost:5002/api/dashboard/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Dashboard response:', data);
        
        return data;
    } catch (error) {
        console.error('❌ Error fetching dashboard:', error);
        return { success: false, message: error.message };
    }
}

function populateDashboard(data) {
    if (!data) {
        console.log('⚠️ No dashboard data to populate');
        return;
    }
    
    const { user, stats, topMatches, trendingBoards, activeChats, voiceRooms, recentActivity, suggestedUsers } = data;
    
    console.log('🎨 Populating dashboard with data...');
    
    // 1. Populate Welcome Card
    if (user) populateWelcomeCard(user, stats);
    
    // 2. Populate Top Matches
    if (topMatches) populateTopMatches(topMatches);
    
    // 3. Populate Trending Boards
    if (trendingBoards) populateTrendingBoards(trendingBoards);
    
    // 4. Populate Active Chats
    if (activeChats) populateActiveChats(activeChats);
    
    // 5. Populate Recent Activity
    if (recentActivity) populateRecentActivity(recentActivity);
    
    // 6. Populate Voice Rooms
    if (voiceRooms) populateVoiceRooms(voiceRooms);
    
    // 7. Populate Suggested Readers
    if (suggestedUsers) populateSuggestedReaders(suggestedUsers);
    
    // 8. Update profile image in navbar
    const profileImg = document.querySelector('.profile-img');
    if (profileImg && user && user.profilePicture) {
        profileImg.src = user.profilePicture;
    }
    
    console.log('✅ Dashboard populated successfully');
}

function populateWelcomeCard(user, stats) {
    // Update welcome message
    const welcomeH1 = document.querySelector('.welcome-header h1');
    if (welcomeH1) {
        welcomeH1.textContent = `Welcome back, ${user.name} 👋`;
    }
    
    // Update welcome text with user's favorite genre
    const welcomeText = document.querySelector('.welcome-text');
    if (welcomeText && user.favoriteGenres && user.favoriteGenres.length > 0) {
        const favoriteGenre = user.favoriteGenres[0];
        welcomeText.innerHTML = `Explore discussions, find new matches, and connect with readers who share your love for <strong>${favoriteGenre}</strong>`;
    }
    
    // Update notification badge
    const badge = document.querySelector('.badge');
    if (badge && stats) {
        const matchCount = stats.totalMatches || 4;
        badge.textContent = `${matchCount} new matches available`;
    }
    
    // Update profile image
    const profileImg = document.querySelector('.profile-img');
    if (profileImg && user.profilePicture) {
        profileImg.src = user.profilePicture;
    } else if (profileImg && !user.profilePicture) {
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=E0B973&color=3B1D14&size=80`;
    }
}

function populateTopMatches(matches) {
    const matchesGrid = document.querySelector('.matches-grid');
    if (!matchesGrid || !matches) return;
    
    matchesGrid.innerHTML = '';
    
    matches.forEach(match => {
        const matchCard = document.createElement('div');
        matchCard.className = 'match-card';
        matchCard.dataset.userId = match.id;
        
        const isConnected = match.isConnected || false;
        
        matchCard.innerHTML = `
            <img src="${match.profileImage}" alt="${match.name}" class="match-avatar">
            <h3>${match.name}</h3>
            <div class="tags">
                ${match.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            <p class="match-stat">📚 ${match.sharedBooks || 0} shared books</p>
            <button class="connect-btn ${isConnected ? 'connected' : ''}">
                ${isConnected ? '✓ Connected' : '🔗 Connect'}
            </button>
        `;
        
        matchesGrid.appendChild(matchCard);
    });
}

function populateTrendingBoards(boards) {
    const boardsGrid = document.querySelector('.boards-grid');
    if (!boardsGrid || !boards) return;
    
    boardsGrid.innerHTML = '';
    
    boards.forEach(board => {
        const boardCard = document.createElement('div');
        boardCard.className = 'board-card';
        boardCard.dataset.boardId = board.id;
        
        const isJoined = board.isJoined || false;
        
        boardCard.innerHTML = `
            <div class="board-icon ${board.color || 'purple'}">${board.icon || '✨'}</div>
            <h3>${board.name}</h3>
            <p class="board-active">🟢 ${formatNumber(board.activeUsers)} active</p>
            <button class="join-btn ${isJoined ? 'joined' : ''}">
                ${isJoined ? '✓ Joined →' : 'Join Board →'}
            </button>
        `;
        
        boardsGrid.appendChild(boardCard);
    });
}

function populateActiveChats(chats) {
    const chatList = document.querySelector('.chat-list');
    if (!chatList || !chats) return;
    
    chatList.innerHTML = '';
    
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        
        chatItem.innerHTML = `
            <img src="${chat.avatar}" alt="${chat.name}" class="chat-avatar">
            <div class="chat-content">
                <h4>${chat.name}</h4>
                <p>${chat.lastMessage}</p>
            </div>
            <span class="chat-time">${chat.timestamp}</span>
            <span class="chat-icon">💬</span>
            ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
        `;
        
        chatList.appendChild(chatItem);
    });
}

function populateRecentActivity(activities) {
    const activityList = document.querySelector('.activity-list');
    if (!activityList || !activities) return;
    
    activityList.innerHTML = '';
    
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        activityItem.innerHTML = `
            <span>${activity.icon}</span>
            <div>
                <p>${activity.description}</p>
                <span class="time">${activity.timestamp}</span>
            </div>
        `;
        
        activityList.appendChild(activityItem);
    });
}

function populateVoiceRooms(rooms) {
    const voiceRoomsContainer = document.querySelector('.voice-rooms');
    if (!voiceRoomsContainer || !rooms) return;
    
    voiceRoomsContainer.innerHTML = '';
    
    rooms.forEach(room => {
        const voiceRoom = document.createElement('div');
        voiceRoom.className = 'voice-room';
        voiceRoom.dataset.roomId = room.id;
        
        voiceRoom.innerHTML = `
            <div class="room-header">
                <h3>${room.name}</h3>
                <span class="participant-count">👥 ${room.participants}</span>
            </div>
            <div class="room-host">
                <img src="${room.host.image}" alt="${room.host.name}">
                <span>Hosted by ${room.host.name}</span>
            </div>
            <div class="room-tags">
                ${room.tags.map(tag => `<span class="room-tag">${tag}</span>`).join('')}
            </div>
            <button class="join-room-btn">Join</button>
        `;
        
        voiceRoomsContainer.appendChild(voiceRoom);
    });
}

function populateSuggestedReaders(users) {
    const suggestedList = document.querySelector('.suggested-list');
    if (!suggestedList || !users) return;
    
    suggestedList.innerHTML = '';
    
    users.forEach(reader => {
        const suggestedItem = document.createElement('div');
        suggestedItem.className = 'suggested-item';
        suggestedItem.dataset.userId = reader.id;
        
        suggestedItem.innerHTML = `
            <img src="${reader.profilePicture}" alt="${reader.name}">
            <div>
                <h4>${reader.name}</h4>
                <p>Likes: ${reader.tags?.join(', ') || 'Reading'}</p>
            </div>
            <button class="star-btn">${reader.isFavorited ? '✓' : '⭐'}</button>
        `;
        
        suggestedList.appendChild(suggestedItem);
    });
}

// Helper function to format numbers
function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

// ===== INTERACTIVE FEATURES WITH BACKEND CALLS =====

async function initConnectButtons(token) {
    const connectButtons = document.querySelectorAll('.connect-btn');
    
    connectButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            const matchCard = this.closest('.match-card');
            const userId = matchCard.dataset.userId;
            const readerName = matchCard.querySelector('h3').textContent;
            
            try {
                // Call backend API
                const response = await fetch(`http://localhost:5002/api/connections/connect/${userId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Toggle button state
                    if (this.textContent.includes('Connect')) {
                        this.textContent = '✓ Connected';
                        this.classList.add('connected');
                        this.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                        showNotification(`Connected with ${readerName}!`, 'success');
                    } else {
                        this.textContent = '🔗 Connect';
                        this.classList.remove('connected');
                        this.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
                        showNotification(`Disconnected from ${readerName}`, 'info');
                    }
                    
                    // Add animation
                    matchCard.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        matchCard.style.transform = 'scale(1)';
                    }, 150);
                } else {
                    showNotification('Connection failed. Please try again.', 'error');
                }
                
            } catch (error) {
                console.error('Connection error:', error);
                showNotification('Network error. Please try again.', 'error');
            }
        });
    });
}

async function initJoinBoardButtons(token) {
    const joinButtons = document.querySelectorAll('.join-btn');
    
    joinButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            const boardCard = this.closest('.board-card');
            const boardId = boardCard.dataset.boardId;
            const boardName = boardCard.querySelector('h3').textContent;
            
            try {
                // Call backend API
                const response = await fetch(`http://localhost:5002/api/boards/join/${boardId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Toggle button state
                    if (this.textContent.includes('Join')) {
                        this.textContent = '✓ Joined →';
                        this.classList.add('joined');
                        this.style.background = '#5c3a28';
                        this.style.color = '#f5f0e8';
                        this.style.borderColor = '#5c3a28';
                        showNotification(`Joined ${boardName}!`, 'success');
                    } else {
                        this.textContent = 'Join Board →';
                        this.classList.remove('joined');
                        this.style.background = 'transparent';
                        this.style.color = '#5c3a28';
                        this.style.borderColor = '#8b6f47';
                        showNotification(`Left ${boardName}`, 'info');
                    }
                    
                    // Animation
                    boardCard.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        boardCard.style.transform = 'scale(1)';
                    }, 100);
                } else {
                    showNotification('Action failed. Please try again.', 'error');
                }
                
            } catch (error) {
                console.error('Join board error:', error);
                showNotification('Network error. Please try again.', 'error');
            }
        });
    });
}

// Chat Item Click Functionality
function initChatItems() {
    const chatItems = document.querySelectorAll('.chat-item');
    
    chatItems.forEach(item => {
        item.addEventListener('click', function() {
            const chatName = this.querySelector('h4').textContent;
            showNotification(`Opening chat with ${chatName}...`, 'info');
            
            // Add active state
            chatItems.forEach(chat => chat.style.background = '');
            this.style.background = 'rgba(245, 230, 211, 0.1)';
            
            // Simulate opening chat
            setTimeout(() => {
                this.style.background = '';
            }, 2000);
        });
    });
}

// Action Cards Functionality
function initActionCards() {
    const actionCards = document.querySelectorAll('.action-card');
    
    const actions = {
        'Start Discussion': () => {
            showNotification('Opening discussion composer...', 'info');
        },
        'Browse Books': () => {
            showNotification('Loading book library...', 'info');
        },
        'Join Room': () => {
            showNotification('Finding available rooms...', 'info');
        },
        'Edit Profile': () => {
            window.location.href = '../Profile/profile.html';
        }
    };
    
    actionCards.forEach(card => {
        card.addEventListener('click', function() {
            const actionText = this.querySelector('span:last-child').textContent;
            if (actions[actionText]) {
                actions[actionText]();
            }
            
            // Click animation
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
        });
    });
}

// Voice Room Join Functionality
async function initVoiceRooms(token) {
    const joinRoomButtons = document.querySelectorAll('.join-room-btn');
    
    joinRoomButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            const room = this.closest('.voice-room');
            const roomId = room.dataset.roomId;
            const roomName = room.querySelector('h3').textContent;
            
            try {
                // Call backend API
                const response = await fetch(`http://localhost:5002/api/voice-rooms/join/${roomId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Toggle button state
                    if (this.textContent === 'Join') {
                        this.textContent = '🎙️ Joined';
                        this.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                        showNotification(`Joined voice room: ${roomName}`, 'success');
                        
                        // Update participant count
                        const countElement = room.querySelector('.participant-count');
                        const currentCount = parseInt(countElement.textContent.match(/\d+/)[0]);
                        countElement.textContent = `👥 ${currentCount + 1}`;
                    } else {
                        this.textContent = 'Join';
                        this.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
                        showNotification(`Left voice room: ${roomName}`, 'info');
                        
                        // Update participant count
                        const countElement = room.querySelector('.participant-count');
                        const currentCount = parseInt(countElement.textContent.match(/\d+/)[0]);
                        countElement.textContent = `👥 ${currentCount - 1}`;
                    }
                } else {
                    showNotification('Action failed. Please try again.', 'error');
                }
                
            } catch (error) {
                console.error('Voice room error:', error);
                showNotification('Network error. Please try again.', 'error');
            }
        });
    });
}

// Suggested Readers Star Functionality
async function initSuggestedReaders(token) {
    const starButtons = document.querySelectorAll('.star-btn');
    
    starButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const readerName = this.closest('.suggested-item').querySelector('h4').textContent;
            
            if (this.textContent === '⭐') {
                this.textContent = '✓';
                this.style.color = '#059669';
                showNotification(`Added ${readerName} to favorites!`, 'success');
            } else {
                this.textContent = '⭐';
                this.style.color = 'inherit';
                showNotification(`Removed ${readerName} from favorites`, 'info');
            }
        });
    });
}

// View All Buttons
function initViewAllButtons() {
    const viewAllLinks = document.querySelectorAll('.view-all');
    viewAllLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            showNotification('Loading more content...', 'info');
        });
    });
    
    const viewMessagesBtn = document.querySelector('.view-messages-btn');
    if (viewMessagesBtn) {
        viewMessagesBtn.addEventListener('click', function() {
            showNotification('Opening all messages...', 'info');
        });
    }
    
    const viewMoreBtn = document.querySelector('.view-more');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', function() {
            showNotification('Loading all voice rooms...', 'info');
        });
    }
}

// ===== NOTIFICATION SYSTEM =====

function initNotifications() {
    // Create notification container if it doesn't exist
    if (!document.getElementById('notification-container')) {
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
        `;
        document.body.appendChild(notificationContainer);
    }
}

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
    `;
    
    notification.innerHTML = `
        <span style="font-size: 20px;">${icons[type]}</span>
        <span>${message}</span>
    `;
    
    const container = document.getElementById('notification-container');
    container.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
    
    // Add animation styles if not already added
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
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
            
            .notification:hover {
                transform: scale(1.02);
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }
}

// ===== MOCK DATA FALLBACK =====

function loadMockData(user) {
    console.log('📦 Loading mock data as fallback for user:', user.name);
    
    // Use the existing static HTML content as fallback
    // Update welcome card with user's name
    const welcomeH1 = document.querySelector('.welcome-header h1');
    if (welcomeH1) {
        welcomeH1.textContent = `Welcome back, ${user.name || 'Reader'} 👋`;
    }
    
    // Update profile image
    const profileImg = document.querySelector('.profile-img');
    if (profileImg) {
        if (user.profilePicture) {
            profileImg.src = user.profilePicture;
        } else {
            profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=E0B973&color=3B1D14&size=80`;
        }
    }
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});