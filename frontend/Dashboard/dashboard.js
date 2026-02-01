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

// Toggle notifications on/off
function toggleNotifications() {
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) {
        const isEnabled = toggle.checked;
        localStorage.setItem('notificationsEnabled', isEnabled);
        applyNotificationSetting(isEnabled);
        showNotification(`Notifications ${isEnabled ? 'enabled' : 'disabled'}`, isEnabled ? 'success' : 'info');
    }
}

// Apply notification setting
function applyNotificationSetting(isEnabled) {
    console.log('🔔 Notifications:', isEnabled ? 'Enabled' : 'Disabled');
    
    const notificationBtn = document.querySelector('.notifications-btn');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (!isEnabled) {
        // Disable notifications
        if (notificationBtn) {
            notificationBtn.style.opacity = '0.5';
            notificationBtn.style.cursor = 'not-allowed';
            notificationBtn.onclick = function() {
                showNotification('Notifications are disabled', 'warning');
                return false;
            };
        }
        
        // Hide badge
        if (notificationBadge) {
            notificationBadge.style.display = 'none';
        }
        
        // Stop polling
        stopNotificationPolling();
    } else {
        // Enable notifications
        if (notificationBtn) {
            notificationBtn.style.opacity = '1';
            notificationBtn.style.cursor = 'pointer';
            notificationBtn.onclick = toggleNotificationsDropdown;
        }
        
        // Start polling
        startNotificationPolling();
        
        // Load notifications if they exist
        loadNotifications();
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

// Action button functions
function startDiscussion() {
    showNotification('Opening discussion composer...', 'info');
}

function browseBooks() {
    showNotification('Loading book library...', 'info');
}

function joinVoiceRoom() {
    showNotification('Finding available rooms...', 'info');
}

function editProfile() {
    window.location.href = '../Profile/profile.html';
}

// Close settings menu when clicking outside
document.addEventListener('click', function(event) {
    const settingsDropdown = document.querySelector('.settings-dropdown');
    const settingsMenu = document.getElementById('settingsMenu');
    const notificationsDropdown = document.querySelector('.notifications-dropdown');
    const notificationsMenu = document.getElementById('notificationsMenu');
    
    if (settingsDropdown && !settingsDropdown.contains(event.target)) {
        if (settingsMenu) {
            settingsMenu.classList.remove('active');
        }
    }
    
    if (notificationsDropdown && !notificationsDropdown.contains(event.target)) {
        if (notificationsMenu) {
            notificationsMenu.classList.remove('active');
        }
    }
});

// ===== NOTIFICATION FUNCTIONS =====

// Initialize notifications
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
    
    // Load saved notification settings
    loadNotificationSettings();
}

// Load notification settings from localStorage
function loadNotificationSettings() {
    const notificationsEnabled = localStorage.getItem('notificationsEnabled');
    const notificationsToggle = document.getElementById('notificationsToggle');
    
    if (notificationsToggle) {
        // Default to true if not set
        const isEnabled = notificationsEnabled === null ? true : notificationsEnabled === 'true';
        notificationsToggle.checked = isEnabled;
        
        // Apply setting immediately
        applyNotificationSetting(isEnabled);
    }
}

// Toggle notifications dropdown
function toggleNotificationsDropdown() {
    const menu = document.getElementById('notificationsMenu');
    if (menu) {
        menu.classList.toggle('active');
        // Close other dropdowns
        const settingsMenu = document.getElementById('settingsMenu');
        if (settingsMenu) settingsMenu.classList.remove('active');
        
        // Load notifications if dropdown is opened
        if (menu.classList.contains('active')) {
            loadNotifications();
        }
    }
}

// Load notifications from backend
async function loadNotifications() {
    try {
        // Check if notifications are enabled
        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled === 'false') {
            populateNotifications([], 0);
            return;
        }
        
        const token = localStorage.getItem('litlink_token');
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/notifications', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            populateNotifications(data.notifications, data.unreadCount);
        } else {
            console.error('Failed to load notifications:', data.message);
            // Fallback to mock data
            populateNotifications(getMockNotifications(), 2);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        // Fallback to mock data
        populateNotifications(getMockNotifications(), 2);
    }
}

// Populate notifications UI
function populateNotifications(notifications, unreadCount) {
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (!notificationsList) return;
    
    // Update badge if notifications are enabled
    const notificationsEnabled = localStorage.getItem('notificationsEnabled');
    const isEnabled = notificationsEnabled === null ? true : notificationsEnabled === 'true';
    
    if (notificationBadge) {
        if (isEnabled && unreadCount > 0) {
            notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            notificationBadge.style.display = 'flex';
        } else {
            notificationBadge.style.display = 'none';
        }
    }
    
    // Clear and populate list
    notificationsList.innerHTML = '';
    
    if (notifications && notifications.length > 0) {
        notifications.forEach(notif => {
            const notificationItem = document.createElement('div');
            notificationItem.className = `notification-item ${notif.read ? '' : 'unread'}`;
            notificationItem.dataset.notificationId = notif.id;
            notificationItem.dataset.type = notif.type;
            
            // Set icon color based on type (matching theme)
            const iconColors = {
                'match': 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)',
                'message': 'linear-gradient(135deg, #3d2617 0%, #2c1810 100%)',
                'board': 'linear-gradient(135deg, #92400e 0%, #78350f 100%)',
                'voice': 'linear-gradient(135deg, #a16207 0%, #854d0e 100%)',
                'achievement': 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
                'warning': 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                'info': 'linear-gradient(135deg, #4b5563 0%, #374151 100%)',
                'success': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                'error': 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                'system': 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
            };
            
            const iconColor = iconColors[notif.type] || iconColors.info;
            
            notificationItem.innerHTML = `
                <div class="notification-icon" style="background: ${iconColor}">
                    ${notif.icon || '🔔'}
                </div>
                <div class="notification-content">
                    <div class="notification-title">
                        <span>${notif.title}</span>
                        <span class="notification-time">${notif.timestamp}</span>
                    </div>
                    <div class="notification-message">${notif.message}</div>
                </div>
                ${!notif.read ? '<div class="notification-dot"></div>' : ''}
            `;
            
            // Add click handler
            notificationItem.addEventListener('click', function() {
                handleNotificationClick(notif.id, notif.actionUrl, notif.type);
            });
            
            notificationsList.appendChild(notificationItem);
        });
    } else {
        // If no notifications
        notificationsList.innerHTML = `
            <div class="notification-item empty">
                <div style="color: #d4b5a0; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="font-size: 2rem; opacity: 0.5;">🔔</div>
                    <div>No notifications yet</div>
                    <div style="font-size: 0.8rem; color: #8b6f47;">Stay active to receive notifications</div>
                </div>
            </div>
        `;
    }
}

// Handle notification click
async function handleNotificationClick(notificationId, actionUrl, type) {
    try {
        // Mark as read if notifications are enabled
        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled !== 'false') {
            const token = localStorage.getItem('litlink_token');
            const response = await fetch(`http://localhost:5002/api/notifications/read/${notificationId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // Update UI
            const notificationItem = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.classList.remove('unread');
                const dot = notificationItem.querySelector('.notification-dot');
                if (dot) dot.remove();
                
                // Update badge count
                updateNotificationBadge(-1);
            }
        }
        
        // Navigate based on notification type
        if (actionUrl && actionUrl.startsWith('/')) {
            // Convert to relative path
            const path = actionUrl.substring(1);
            window.location.href = `../${path}`;
        } else if (actionUrl) {
            window.location.href = actionUrl;
        } else {
            switch(type) {
                case 'match':
                    showNotification('Opening matches...', 'info');
                    // You could scroll to matches section
                    document.querySelector('.matches-grid')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case 'message':
                    window.location.href = '../Chat/chat.html';
                    break;
                case 'board':
                    showNotification('Opening board...', 'info');
                    break;
                default:
                    // Do nothing
            }
        }
        
        // Close dropdown
        const menu = document.getElementById('notificationsMenu');
        if (menu) menu.classList.remove('active');
        
    } catch (error) {
        console.error('Error handling notification:', error);
        showNotification('Error opening notification', 'error');
    }
}

// Mark all as read
async function markAllAsRead() {
    try {
        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled === 'false') {
            showNotification('Notifications are disabled', 'warning');
            return;
        }
        
        const token = localStorage.getItem('litlink_token');
        const response = await fetch('http://localhost:5002/api/notifications/read-all', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update all UI notifications
            document.querySelectorAll('.notification-item').forEach(item => {
                item.classList.remove('unread');
                const dot = item.querySelector('.notification-dot');
                if (dot) dot.remove();
            });
            
            // Hide badge
            updateNotificationBadge(0, true);
            
            showNotification('All notifications marked as read', 'success');
        }
    } catch (error) {
        console.error('Error marking all as read:', error);
        showNotification('Error marking notifications as read', 'error');
    }
}

// Update notification badge
function updateNotificationBadge(change, setToZero = false) {
    const notificationsEnabled = localStorage.getItem('notificationsEnabled');
    if (notificationsEnabled === 'false') return;
    
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (setToZero) {
            badge.style.display = 'none';
            badge.textContent = '0';
        } else if (badge.style.display === 'none') {
            badge.style.display = 'flex';
            badge.textContent = '1';
        } else {
            const currentCount = parseInt(badge.textContent) || 0;
            const newCount = Math.max(0, currentCount + change);
            if (newCount > 0) {
                badge.textContent = newCount > 9 ? '9+' : newCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }
}

// View all notifications
function viewAllNotifications() {
    showNotification('Opening notifications page...', 'info');
    // Could create a dedicated notifications page
    const notificationsMenu = document.getElementById('notificationsMenu');
    if (notificationsMenu) notificationsMenu.classList.remove('active');
}

// Poll for new notifications
let pollingInterval = null;

function startNotificationPolling() {
    // Clear any existing interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Check for new notifications every 30 seconds
    pollingInterval = setInterval(async () => {
        try {
            const notificationsEnabled = localStorage.getItem('notificationsEnabled');
            if (notificationsEnabled === 'false') {
                clearInterval(pollingInterval);
                return;
            }
            
            const token = localStorage.getItem('litlink_token');
            if (!token) return;
            
            const response = await fetch('http://localhost:5002/api/notifications/unread-count', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                const badge = document.getElementById('notificationBadge');
                const currentCount = badge ? parseInt(badge.textContent) || 0 : 0;
                
                if (data.unreadCount > currentCount) {
                    // New notifications!
                    updateNotificationBadge(data.unreadCount - currentCount);
                    
                    // Show subtle notification if user is not in notifications dropdown
                    const notificationsMenu = document.getElementById('notificationsMenu');
                    if (!notificationsMenu || !notificationsMenu.classList.contains('active')) {
                        showNotification('New notification received', 'info');
                    }
                }
            }
        } catch (error) {
            console.error('Error polling notifications:', error);
        }
    }, 30000); // 30 seconds
}

function stopNotificationPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Get mock notifications for fallback
function getMockNotifications() {
    return [
        { 
            id: 'notif1',
            type: 'match',
            title: 'New Reader Match',
            message: 'Alex M. shares your interest in Fantasy novels',
            timestamp: '5m ago',
            read: false,
            icon: '🔗',
            actionUrl: '/chat/chat1'
        },
        { 
            id: 'notif2',
            type: 'message',
            title: 'New Message',
            message: 'Sarah replied to your book suggestion',
            timestamp: '1h ago',
            read: false,
            icon: '💬',
            actionUrl: '/chat/chat2'
        },
        { 
            id: 'notif3',
            type: 'board',
            title: 'Board Update',
            message: 'New discussion started in Fantasy Worlds',
            timestamp: '3h ago',
            read: true,
            icon: '📌',
            actionUrl: '/board/board1'
        }
    ];
}

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
    
    // Initialize notification system
    initNotifications();
    // Connect WebSocket for real-time notifications (no refresh)
    initUserWebSocket(token);
    
    // Update welcome card immediately with user data
    updateWelcomeCard(user);
    
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
            initVoiceRooms(token);
            initSuggestedReaders(token);
            initViewAllButtons();
            
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
    
    // Explore Community Button - NOW POINTS TO dashexplore.html
    const exploreBtn = document.querySelector('.explore-btn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🌍 Navigating to Explore Community...');
            window.location.href = 'dashexplore.html';
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

// ===== USER WEBSOCKET (REAL-TIME NOTIFICATIONS) =====
let userSocket = null;
let userSocketReconnectTimer = null;

function initUserWebSocket(token) {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = 'localhost:5002'; // Backend default
    const wsUrl = `${protocol}://${host}?token=${encodeURIComponent(token)}`;

    try {
        console.log('🔌 Connecting to user WebSocket:', wsUrl);
        userSocket = new WebSocket(wsUrl);

        userSocket.onopen = () => {
            console.log('✅ User WebSocket connected');
            try {
                userSocket.send(JSON.stringify({ type: 'get-unread-count' }));
            } catch (e) {
                console.error('Error requesting unread count:', e);
            }
        };

        userSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleUserSocketMessage(data);
            } catch (e) {
                console.error('Error parsing user WebSocket message:', e, event.data);
            }
        };

        userSocket.onclose = (event) => {
            console.warn('User WebSocket closed:', event.code, event.reason);
            scheduleUserSocketReconnect(token);
        };

        userSocket.onerror = (error) => {
            console.error('User WebSocket error:', error);
        };
    } catch (error) {
        console.error('Failed to open user WebSocket:', error);
        scheduleUserSocketReconnect(token);
    }
}

function scheduleUserSocketReconnect(token) {
    if (userSocketReconnectTimer) return;
    userSocketReconnectTimer = setTimeout(() => {
        userSocketReconnectTimer = null;
        initUserWebSocket(token);
    }, 5000);
}

function handleUserSocketMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'user-authenticated':
            console.log('User WebSocket authenticated as:', data.userName);
            break;

        case 'notification-count': {
            // Keep it simple: refresh notifications so badge + list stay consistent
            loadNotifications();
            break;
        }

        case 'notification':
            // Show toast + refresh list/badge
            showNotification(data.title || 'New notification', 'info');
            loadNotifications();
            break;

        case 'pong':
            break;

        default:
            // Ignore unknown messages
            break;
    }
}

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

function updateWelcomeCard(user) {
    // Update user name
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user.name) {
        userNameElement.textContent = user.name;
    }
    
    // Update user genre
    const userGenreElement = document.getElementById('userGenre');
    if (userGenreElement && user.favoriteGenres && user.favoriteGenres.length > 0) {
        userGenreElement.textContent = user.favoriteGenres[0];
    }
    
    // Update user avatar
    const userAvatarElement = document.getElementById('userAvatar');
    if (userAvatarElement) {
        if (user.profilePicture) {
            userAvatarElement.src = user.profilePicture;
        } else {
            // Generate avatar based on user initials
            const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
            userAvatarElement.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=E0B973&color=3B1D14&size=80`;
        }
        userAvatarElement.alt = user.name || 'User';
    }
}

function populateDashboard(data) {
    if (!data) {
        console.log('⚠️ No dashboard data to populate');
        return;
    }
    
    const { user, stats, notifications, topMatches, trendingBoards, activeChats, voiceRooms, recentActivity, suggestedUsers } = data;
    
    console.log('🎨 Populating dashboard with data...');
    
    // 1. Update Welcome Card
    if (user) {
        updateWelcomeCard(user);
        
        // Update match count
        const matchCountElement = document.getElementById('matchCount');
        if (matchCountElement && stats) {
            const matchCount = stats.totalMatches || stats.activeMatches || 4;
            matchCountElement.textContent = `${matchCount} new matches available`;
        }
    }
    
    // 2. Populate Notifications
    if (notifications) {
        const unreadCount = stats?.unreadNotifications || notifications.filter(n => !n.read).length;
        populateNotifications(notifications, unreadCount);
    }
    
    // 3. Populate Top Matches
    if (topMatches) populateTopMatches(topMatches);
    
    // 4. Populate Trending Boards
    if (trendingBoards) populateTrendingBoards(trendingBoards);
    
    // 5. Populate Active Chats
    if (activeChats) populateActiveChats(activeChats);
    
    // 6. Populate Recent Activity
    if (recentActivity) populateRecentActivity(recentActivity);
    
    // 7. Populate Voice Rooms
    if (voiceRooms) populateVoiceRooms(voiceRooms);
    
    // 8. Populate Suggested Readers
    if (suggestedUsers) populateSuggestedReaders(suggestedUsers);
    
    console.log('✅ Dashboard populated successfully');
}

function populateTopMatches(matches) {
    const matchesGrid = document.getElementById('matchesGrid');
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
    const boardsGrid = document.getElementById('boardsGrid');
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
    const chatList = document.getElementById('chatList');
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
    const activityList = document.getElementById('activityList');
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
    const voiceRoomsContainer = document.getElementById('voiceRooms');
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
    const suggestedList = document.getElementById('suggestedList');
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
    
    // Update welcome card with user's name
    updateWelcomeCard(user);
    
    // Use demo data
    const demoMatches = [
        { id: '1', name: 'Elena R.', profileImage: 'https://i.pravatar.cc/150?img=5', tags: ['Fantasy', 'Sci-Fi'], sharedBooks: 32, isConnected: false },
        { id: '2', name: 'Marcus Chen', profileImage: 'https://i.pravatar.cc/150?img=12', tags: ['Mystery', 'Thriller'], sharedBooks: 28, isConnected: false },
        { id: '3', name: 'Sarah J.', profileImage: 'https://i.pravatar.cc/150?img=9', tags: ['Romance', 'YA'], sharedBooks: 25, isConnected: false },
        { id: '4', name: 'David K.', profileImage: 'https://i.pravatar.cc/150?img=14', tags: ['History', 'Biographies'], sharedBooks: 21, isConnected: false }
    ];
    
    const demoBoards = [
        { id: '1', name: 'Fantasy Worlds', icon: '✨', color: 'purple', activeUsers: 15000, isJoined: false },
        { id: '2', name: 'Modern Romance', icon: '💕', color: 'pink', activeUsers: 9000, isJoined: false },
        { id: '3', name: 'Mystery & Thriller', icon: '👑', color: 'blue', activeUsers: 21000, isJoined: false },
        { id: '4', name: 'Literary Fiction', icon: '✒️', color: 'brown', activeUsers: 6000, isJoined: false },
        { id: '5', name: 'Young Adult', icon: '🌹', color: 'teal', activeUsers: 12000, isJoined: false },
        { id: '6', name: 'Sci-Fi Classics', icon: '🚀', color: 'indigo', activeUsers: 8000, isJoined: false }
    ];
    
    const demoChats = [
        { id: '1', name: 'The Midnight Library Club', avatar: 'https://i.pravatar.cc/60?img=20', lastMessage: 'Has anyone finished chapter 5 yet? That twist!', timestamp: '2m ago', unreadCount: 3 },
        { id: '2', name: 'James Wilson', avatar: 'https://i.pravatar.cc/60?img=33', lastMessage: "I think you'd love 'Project Hail Mary'!", timestamp: '1h ago', unreadCount: 0 },
        { id: '3', name: 'Sci-Fi Enthusiasts', avatar: 'https://i.pravatar.cc/60?img=47', lastMessage: 'Meeting is scheduled for Friday at 8pm 📚', timestamp: 'yesterday', unreadCount: 0 }
    ];
    
    const demoActivity = [
        { icon: '📚', description: 'Sarah posted in Fantasy Board', timestamp: '3h ago' },
        { icon: '📖', description: 'New Voice Room "Sci-Fi Talk"', timestamp: '5h ago' },
        { icon: '🔗', description: '3 readers matched with you', timestamp: '8h ago' }
    ];
    
    const demoVoiceRooms = [
        { id: '1', name: 'Romance Readers Hangout', participants: 12, host: { name: 'Bella S.', image: 'https://i.pravatar.cc/40?img=25' }, tags: ['💕 Hot', 'Discussion'] },
        { id: '2', name: 'Mystery Ch. 4 Deep Dive', participants: 8, host: { name: 'The Book Detectives', image: 'https://i.pravatar.cc/40?img=32' }, tags: ['🔍 Mystery', 'Deep'] },
        { id: '3', name: 'Writing Sprint: 25min', participants: 15, host: { name: 'Author Circle', image: 'https://i.pravatar.cc/40?img=41' }, tags: ['Creative', 'Write'] }
    ];
    
    const demoSuggested = [
        { id: '1', name: 'Alex M.', profilePicture: 'https://i.pravatar.cc/50?img=16', tags: ['Fantasy'], isFavorited: false },
        { id: '2', name: 'Jordan T.', profilePicture: 'https://i.pravatar.cc/50?img=28', tags: ['Sci-Fi'], isFavorited: false },
        { id: '3', name: 'Casey L.', profilePicture: 'https://i.pravatar.cc/50?img=35', tags: ['Mystery'], isFavorited: false }
    ];
    
    // Populate with demo data
    populateNotifications(getMockNotifications(), 2);
    populateTopMatches(demoMatches);
    populateTrendingBoards(demoBoards);
    populateActiveChats(demoChats);
    populateRecentActivity(demoActivity);
    populateVoiceRooms(demoVoiceRooms);
    populateSuggestedReaders(demoSuggested);
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