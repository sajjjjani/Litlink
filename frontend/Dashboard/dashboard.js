// Litlink - Book Community Dashboard - Real Data Integration

// ===== AUTHENTICATION & SESSION FUNCTIONS =====

function checkAuth() {
    const token = localStorage.getItem('litlink_token');
    const user = JSON.parse(localStorage.getItem('litlink_user') || 'null');
    
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
        
        if (toggle.checked) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
}

function loadDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    const toggle = document.getElementById('darkModeToggle');
    
    if (toggle) {
        toggle.checked = darkMode;
        if (darkMode) {
            document.body.classList.add('dark-mode');
        }
    }
}

function toggleNotifications() {
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) {
        const isEnabled = toggle.checked;
        localStorage.setItem('notificationsEnabled', isEnabled);
        applyNotificationSetting(isEnabled);
        showNotification(`Notifications ${isEnabled ? 'enabled' : 'disabled'}`, isEnabled ? 'success' : 'info');
    }
}

function applyNotificationSetting(isEnabled) {
    console.log('🔔 Notifications:', isEnabled ? 'Enabled' : 'Disabled');
    
    const notificationBtn = document.querySelector('.notifications-btn');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (!isEnabled) {
        if (notificationBtn) {
            notificationBtn.style.opacity = '0.5';
            notificationBtn.style.cursor = 'not-allowed';
            notificationBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                showNotification('Notifications are disabled', 'warning');
                return false;
            };
        }
        
        if (notificationBadge) {
            notificationBadge.style.display = 'none';
        }
        
        stopNotificationPolling();
    } else {
        if (notificationBtn) {
            notificationBtn.style.opacity = '1';
            notificationBtn.style.cursor = 'pointer';
            notificationBtn.onclick = toggleNotificationsDropdown;
        }
        
        startNotificationPolling();
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
        localStorage.clear();
        window.location.href = '../Homepage/index.html';
    }
}

function showComingSoon(feature) {
    showNotification(`${feature} feature is coming soon!`, 'info');
}

function startDiscussion() {
    window.location.href = '../Discussion Board/discussion.html';
}

function browseBooks() {
    window.location.href = '../Browse/browse.html';
}

function joinVoiceRoom() {
    window.location.href = '../Voice Room/voice-rooms.html';
}

function editProfile() {
    window.location.href = '../Profile/profile.html';
}

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

function initNotifications() {
    if (!document.getElementById('notification-container')) {
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
            pointer-events: none;
        `;
        document.body.appendChild(notificationContainer);
    }
    
    loadNotificationSettings();
    loadDarkModePreference();
}

function loadNotificationSettings() {
    const notificationsEnabled = localStorage.getItem('notificationsEnabled');
    const notificationsToggle = document.getElementById('notificationsToggle');
    
    if (notificationsToggle) {
        const isEnabled = notificationsEnabled === null ? true : notificationsEnabled === 'true';
        notificationsToggle.checked = isEnabled;
        applyNotificationSetting(isEnabled);
    }
}

function toggleNotificationsDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const menu = document.getElementById('notificationsMenu');
    if (menu) {
        menu.classList.toggle('active');
        
        const settingsMenu = document.getElementById('settingsMenu');
        if (settingsMenu) settingsMenu.classList.remove('active');
        
        if (menu.classList.contains('active')) {
            loadNotifications();
        }
    }
}

async function loadNotifications() {
    try {
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
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            populateNotifications(data.notifications || [], data.unreadCount || 0);
        } else {
            console.error('Failed to load notifications:', data.message);
            populateNotifications(getMockNotifications(), 2);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        populateNotifications(getMockNotifications(), 2);
    }
}

function populateNotifications(notifications, unreadCount) {
    const notificationsList = document.getElementById('notificationsList');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (!notificationsList) return;
    
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
    
    notificationsList.innerHTML = '';
    
    if (notifications && notifications.length > 0) {
        notifications.forEach(notif => {
            const notificationItem = document.createElement('div');
            notificationItem.className = `notification-item ${notif.read ? '' : 'unread'}`;
            notificationItem.dataset.notificationId = notif.id;
            notificationItem.dataset.type = notif.type;
            
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
                        <span>${escapeHtml(notif.title || 'Notification')}</span>
                        <span class="notification-time">${notif.timestamp || 'Just now'}</span>
                    </div>
                    <div class="notification-message">${escapeHtml(notif.message || '')}</div>
                </div>
                ${!notif.read ? '<div class="notification-dot"></div>' : ''}
            `;
            
            notificationItem.addEventListener('click', function() {
                handleNotificationClick(notif.id, notif.actionUrl, notif.type);
            });
            
            notificationsList.appendChild(notificationItem);
        });
    } else {
        notificationsList.innerHTML = `
            <div class="notification-item empty">
                <div style="color: #d4b5a0; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px;">
                    <div style="font-size: 3rem; opacity: 0.5;">🔔</div>
                    <div style="font-size: 1rem;">No notifications yet</div>
                    <div style="font-size: 0.8rem; color: #8b6f47;">Stay active to receive notifications</div>
                </div>
            </div>
        `;
    }
}

async function handleNotificationClick(notificationId, actionUrl, type) {
    try {
        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled !== 'false') {
            const token = localStorage.getItem('litlink_token');
            
            await fetch(`http://localhost:5002/api/notifications/read/${notificationId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const notificationItem = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.classList.remove('unread');
                const dot = notificationItem.querySelector('.notification-dot');
                if (dot) dot.remove();
                updateNotificationBadge(-1);
            }
        }
        
        if (actionUrl) {
            if (actionUrl.startsWith('/')) {
                window.location.href = `..${actionUrl}`;
            } else if (actionUrl.startsWith('http')) {
                window.open(actionUrl, '_blank');
            } else {
                window.location.href = actionUrl;
            }
        } else {
            switch(type) {
                case 'match':
                    document.querySelector('.matches-grid')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case 'message':
                    window.location.href = '../Chat/chat.html';
                    break;
                case 'board':
                    window.location.href = '../Discussion Board/discussion.html';
                    break;
                case 'voice':
                    window.location.href = '../Voice Room/voice-rooms.html';
                    break;
                default:
                    showNotification('Notification opened', 'info');
            }
        }
        
        const menu = document.getElementById('notificationsMenu');
        if (menu) menu.classList.remove('active');
        
    } catch (error) {
        console.error('Error handling notification:', error);
        showNotification('Error opening notification', 'error');
    }
}

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
            document.querySelectorAll('.notification-item').forEach(item => {
                item.classList.remove('unread');
                const dot = item.querySelector('.notification-dot');
                if (dot) dot.remove();
            });
            
            updateNotificationBadge(0, true);
            showNotification('All notifications marked as read', 'success');
        }
    } catch (error) {
        console.error('Error marking all as read:', error);
        showNotification('Error marking notifications as read', 'error');
    }
}

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

function viewAllNotifications() {
    showNotification('Opening notifications page...', 'info');
    const notificationsMenu = document.getElementById('notificationsMenu');
    if (notificationsMenu) notificationsMenu.classList.remove('active');
}

let pollingInterval = null;

function startNotificationPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
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
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.success) {
                const badge = document.getElementById('notificationBadge');
                const currentCount = badge ? parseInt(badge.textContent) || 0 : 0;
                
                if (data.unreadCount > currentCount) {
                    updateNotificationBadge(data.unreadCount - currentCount);
                    
                    const notificationsMenu = document.getElementById('notificationsMenu');
                    if (!notificationsMenu || !notificationsMenu.classList.contains('active')) {
                        showNotification('New notification received', 'info');
                    }
                }
            }
        } catch (error) {
            console.error('Error polling notifications:', error);
        }
    }, 30000);
}

function stopNotificationPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

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
            actionUrl: '/Chat/chat.html'
        },
        { 
            id: 'notif2',
            type: 'message',
            title: 'New Message',
            message: 'Sarah replied to your book suggestion',
            timestamp: '1h ago',
            read: false,
            icon: '💬',
            actionUrl: '/Chat/chat.html'
        },
        { 
            id: 'notif3',
            type: 'board',
            title: 'Board Update',
            message: 'New discussion started in Fantasy Worlds',
            timestamp: '3h ago',
            read: true,
            icon: '📌',
            actionUrl: '/Discussion Board/discussion.html'
        }
    ];
}

// ===== USER WEBSOCKET =====
let userSocket = null;
let userSocketReconnectTimer = null;

function initUserWebSocket(token) {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = 'localhost:5002';
    const wsUrl = `${protocol}://${host}?token=${encodeURIComponent(token)}`;

    try {
        userSocket = new WebSocket(wsUrl);

        userSocket.onopen = () => {
            console.log('✅ User WebSocket connected');
            userSocket.send(JSON.stringify({ type: 'get-unread-count' }));
        };

        userSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleUserSocketMessage(data);
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };

        userSocket.onclose = () => {
            console.warn('User WebSocket closed');
            scheduleUserSocketReconnect(token);
        };

        userSocket.onerror = (error) => {
            console.error('User WebSocket error:', error);
        };
    } catch (error) {
        console.error('Failed to open WebSocket:', error);
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
            console.log('WebSocket authenticated as:', data.userName);
            break;
        case 'notification-count':
        case 'notification':
            loadNotifications();
            break;
        default:
            break;
    }
}

// ===== MAIN DASHBOARD LOADING =====

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📚 Dashboard loading with real data...');
    
    const auth = checkAuth();
    if (!auth) return;
    
    const { token, user } = auth;
    
    console.log('✅ Authenticated user:', user.name);
    
    initNotifications();
    initUserWebSocket(token);
    updateWelcomeCard(user);
    
    try {
        showLoadingState();
        
        // Load real data from multiple endpoints
        await Promise.all([
            loadTopMatches(token),
            loadTrendingBoards(), // Keeping original discussion board
            loadActiveChats(token),
            loadRecentActivity(token),
            loadVoiceRooms(token),
            loadSuggestedReaders(token)
        ]);
        
        hideLoadingState();
        
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
        showNotification('Connection error. Using offline data.', 'warning');
        loadFallbackData(user);
        hideLoadingState();
    }
    
    const exploreBtn = document.querySelector('.explore-btn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'dashexplore.html';
        });
    }
    
    const moreBtn = document.querySelector('.more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function() {
            window.location.href = '../Chat/chat.html';
        });
    }
    
    const viewMessagesBtn = document.querySelector('.view-messages-btn');
    if (viewMessagesBtn) {
        viewMessagesBtn.addEventListener('click', function() {
            window.location.href = '../Chat/chat.html';
        });
    }
    
    const viewMoreBtn = document.querySelector('.view-more');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', function() {
            window.location.href = '../Voice Room/voice-rooms.html';
        });
    }
});

// ===== LOAD REAL DATA FROM API ENDPOINTS =====

async function loadTopMatches(token) {
    try {
        const response = await fetch('http://localhost:5002/api/users/matches', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.matches) {
                // Filter out system admin
                const filteredMatches = data.matches.filter(m => 
                    m.name !== 'System Admin' && 
                    m.name !== 'Admin' && 
                    !m.isSystem &&
                    m.role !== 'admin'
                );
                populateTopMatches(filteredMatches);
            } else {
                populateTopMatches([]);
            }
        } else {
            populateTopMatches([]);
        }
    } catch (error) {
        console.error('Error loading matches:', error);
        populateTopMatches([]);
    }
}

// KEEPING ORIGINAL DISCUSSION BOARD - NO CHANGES HERE
function loadTrendingBoards() {
    // Original discussion board data - unchanged
    const boards = [
        { id: '1', name: 'Fantasy Worlds', icon: '✨', color: 'purple', activeUsers: 15000 },
        { id: '2', name: 'Modern Romance', icon: '💕', color: 'pink', activeUsers: 9000 },
        { id: '3', name: 'Mystery & Thriller', icon: '👑', color: 'blue', activeUsers: 21000 },
        { id: '4', name: 'Literary Fiction', icon: '✒️', color: 'brown', activeUsers: 6000 },
        { id: '5', name: 'Young Adult', icon: '🌹', color: 'teal', activeUsers: 12000 },
        { id: '6', name: 'Sci-Fi Classics', icon: '🚀', color: 'indigo', activeUsers: 8000 }
    ];
    
    populateTrendingBoards(boards);
}

async function loadActiveChats(token) {
    try {
        const response = await fetch('http://localhost:5002/api/chat/conversations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.conversations) {
                populateActiveChats(data.conversations);
            } else {
                populateActiveChats([]);
            }
        } else {
            populateActiveChats([]);
        }
    } catch (error) {
        console.error('Error loading chats:', error);
        populateActiveChats([]);
    }
}

async function loadRecentActivity(token) {
    try {
        const response = await fetch('http://localhost:5002/api/activity/recent', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.activities) {
                populateRecentActivity(data.activities);
            } else {
                populateRecentActivity([]);
            }
        } else {
            populateRecentActivity([]);
        }
    } catch (error) {
        console.error('Error loading activity:', error);
        populateRecentActivity([]);
    }
}

async function loadVoiceRooms(token) {
    try {
        const response = await fetch('http://localhost:5002/api/voice-rooms/rooms/live', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.rooms) {
                populateVoiceRooms(data.rooms);
            } else {
                // Show empty state
                const voiceRoomsContainer = document.getElementById('voiceRooms');
                if (voiceRoomsContainer) {
                    voiceRoomsContainer.innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                            <p style="color: #d4b5a0;">No active voice rooms at the moment.</p>
                            <button onclick="window.location.href='../Voice Room/voice-rooms.html'" class="explore-btn" style="margin-top: 16px;">Browse All Rooms</button>
                        </div>
                    `;
                }
            }
        } else {
            showEmptyVoiceRooms();
        }
    } catch (error) {
        console.error('Error loading voice rooms:', error);
        showEmptyVoiceRooms();
    }
}

async function loadSuggestedReaders(token) {
    try {
        const response = await fetch('http://localhost:5002/api/users/suggested', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.users) {
                // Filter out system admin
                const filteredUsers = data.users.filter(u => 
                    u.name !== 'System Admin' && 
                    u.name !== 'Admin' && 
                    !u.isSystem &&
                    u.role !== 'admin'
                );
                populateSuggestedReaders(filteredUsers);
            } else {
                populateSuggestedReaders([]);
            }
        } else {
            populateSuggestedReaders([]);
        }
    } catch (error) {
        console.error('Error loading suggested readers:', error);
        populateSuggestedReaders([]);
    }
}

// ===== POPULATE FUNCTIONS =====

function updateWelcomeCard(user) {
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user.name) {
        userNameElement.textContent = user.name;
    }
    
    const userGenreElement = document.getElementById('userGenre');
    if (userGenreElement) {
        if (user.favoriteGenres && user.favoriteGenres.length > 0) {
            userGenreElement.textContent = user.favoriteGenres[0];
        } else {
            userGenreElement.textContent = 'Reading';
        }
    }
    
    const userAvatarElement = document.getElementById('userAvatar');
    if (userAvatarElement) {
        if (user.profilePicture && user.profilePicture !== 'null' && user.profilePicture !== 'undefined') {
            userAvatarElement.src = user.profilePicture;
        } else {
            const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
            userAvatarElement.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=E0B973&color=3B1D14&size=80`;
        }
        userAvatarElement.alt = user.name || 'User';
    }
    
    const matchCountElement = document.getElementById('matchCount');
    if (matchCountElement) {
        matchCountElement.textContent = 'Find new matches';
    }
}

function populateTopMatches(matches) {
    const matchesGrid = document.getElementById('matchesGrid');
    if (!matchesGrid) return;
    
    if (!matches || matches.length === 0) {
        matchesGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <p style="color: #d4b5a0;">No matches yet. Explore readers to find your book soulmate!</p>
                <button onclick="window.location.href='dashexplore.html'" class="explore-btn" style="margin-top: 16px;">Explore Readers</button>
            </div>
        `;
        return;
    }
    
    matchesGrid.innerHTML = '';
    
    matches.slice(0, 4).forEach(match => {
        const matchCard = document.createElement('div');
        matchCard.className = 'match-card';
        matchCard.dataset.userId = match._id || match.id;
        
        const profileImage = match.profilePicture && match.profilePicture !== 'null' 
            ? match.profilePicture 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(match.name)}&background=E0B973&color=3B1D14&size=80`;
        
        const genres = match.favoriteGenres || match.tags || ['Reader'];
        const sharedBooks = match.sharedBooks || Math.floor(Math.random() * 30) + 5;
        
        matchCard.innerHTML = `
            <img src="${profileImage}" alt="${match.name}" class="match-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(match.name)}&background=E0B973&color=3B1D14&size=80'">
            <h3>${match.name}</h3>
            <div class="tags">
                ${genres.slice(0, 2).map(genre => `<span class="tag">${genre}</span>`).join('')}
            </div>
            <p class="match-stat">📚 ${sharedBooks} shared books</p>
            <button class="connect-btn ${match.isConnected ? 'connected' : ''}" onclick="event.stopPropagation(); connectToUser('${match._id || match.id}', this)">
                ${match.isConnected ? '✓ Connected' : '🔗 Connect'}
            </button>
        `;
        
        matchCard.addEventListener('click', () => {
            window.location.href = `../Profile/view-profile.html?id=${match._id || match.id}`;
        });
        
        matchesGrid.appendChild(matchCard);
    });
}

// ORIGINAL POPULATE TRENDING BOARDS - UNCHANGED
function populateTrendingBoards(boards) {
    const boardsGrid = document.getElementById('boardsGrid');
    if (!boardsGrid) return;
    
    boardsGrid.innerHTML = '';
    
    boards.forEach(board => {
        const boardCard = document.createElement('div');
        boardCard.className = 'board-card';
        boardCard.dataset.boardId = board.id;
        
        boardCard.innerHTML = `
            <div class="board-icon ${board.color}">${board.icon}</div>
            <h3>${board.name}</h3>
            <p class="board-active">🟢 ${formatNumber(board.activeUsers)} active</p>
            <button class="join-btn" onclick="event.stopPropagation(); joinBoard('${board.id}', this)">
                Join Board →
            </button>
        `;
        
        boardCard.addEventListener('click', () => {
            window.location.href = `../Discussion Board/board.html?id=${board.id}`;
        });
        
        boardsGrid.appendChild(boardCard);
    });
}

function populateActiveChats(chats) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;
    
    if (!chats || chats.length === 0) {
        chatList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px;">
                <p style="color: #d4b5a0;">No active chats. Start a conversation!</p>
            </div>
        `;
        return;
    }
    
    chatList.innerHTML = '';
    
    chats.slice(0, 3).forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat._id || chat.id;
        
        const otherParticipant = chat.participants?.find(p => p._id !== getCurrentUserId()) || {};
        const name = chat.name || otherParticipant.name || 'Chat';
        const avatar = chat.avatar || otherParticipant.profilePicture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E0B973&color=3B1D14&size=48`;
        
        const lastMessage = chat.lastMessage?.content || 'No messages yet';
        const timestamp = chat.lastMessage?.createdAt ? timeAgo(new Date(chat.lastMessage.createdAt)) : 'Just now';
        const unreadCount = chat.unreadCount || 0;
        
        chatItem.innerHTML = `
            <img src="${avatar}" alt="${name}" class="chat-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E0B973&color=3B1D14&size=48'">
            <div class="chat-content">
                <h4>${name}</h4>
                <p>${escapeHtml(lastMessage)}</p>
            </div>
            <span class="chat-time">${timestamp}</span>
            <span class="chat-icon">💬</span>
            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
        `;
        
        chatItem.addEventListener('click', () => {
            window.location.href = `../Chat/chat.html?id=${chat._id || chat.id}`;
        });
        
        chatList.appendChild(chatItem);
    });
}

function populateRecentActivity(activities) {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    
    if (!activities || activities.length === 0) {
        activityList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px;">
                <p style="color: #d4b5a0;">No recent activity</p>
            </div>
        `;
        return;
    }
    
    activityList.innerHTML = '';
    
    activities.slice(0, 3).forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        const icon = activity.icon || '📚';
        const description = activity.description || 'Activity';
        const timestamp = activity.timestamp ? timeAgo(new Date(activity.timestamp)) : 'Just now';
        
        activityItem.innerHTML = `
            <span>${icon}</span>
            <div>
                <p>${escapeHtml(description)}</p>
                <span class="time">${timestamp}</span>
            </div>
        `;
        
        activityList.appendChild(activityItem);
    });
}

function populateVoiceRooms(rooms) {
    const voiceRoomsContainer = document.getElementById('voiceRooms');
    if (!voiceRoomsContainer) return;
    
    if (!rooms || rooms.length === 0) {
        showEmptyVoiceRooms();
        return;
    }
    
    voiceRoomsContainer.innerHTML = '';
    
    rooms.slice(0, 3).forEach(room => {
        const voiceRoom = document.createElement('div');
        voiceRoom.className = 'voice-room';
        voiceRoom.dataset.roomId = room._id || room.id;
        
        const hostImage = room.host?.profilePicture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(room.host?.name || 'Host')}&background=E0B973&color=3B1D14&size=28`;
        
        const tags = room.tags || room.genres || ['Discussion'];
        const participants = room.participants?.length || room.listeners || 0;
        
        voiceRoom.innerHTML = `
            <div class="room-header">
                <h3>${room.name}</h3>
                <span class="participant-count">👥 ${participants}</span>
            </div>
            <div class="room-host">
                <img src="${hostImage}" alt="${room.host?.name || 'Host'}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(room.host?.name || 'Host')}&background=E0B973&color=3B1D14&size=28'">
                <span>Hosted by ${room.host?.name || 'Host'}</span>
            </div>
            <div class="room-tags">
                ${tags.slice(0, 2).map(tag => `<span class="room-tag">${tag}</span>`).join('')}
            </div>
            <button class="join-room-btn" onclick="event.stopPropagation(); joinVoiceRoom('${room._id || room.id}', this)">
                Join
            </button>
        `;
        
        voiceRoom.addEventListener('click', () => {
            window.location.href = `../Voice Room/room.html?id=${room._id || room.id}`;
        });
        
        voiceRoomsContainer.appendChild(voiceRoom);
    });
}

function showEmptyVoiceRooms() {
    const voiceRoomsContainer = document.getElementById('voiceRooms');
    if (voiceRoomsContainer) {
        voiceRoomsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <p style="color: #d4b5a0;">No active voice rooms at the moment.</p>
                <button onclick="window.location.href='../Voice Room/voice-rooms.html'" class="explore-btn" style="margin-top: 16px;">Browse All Rooms</button>
            </div>
        `;
    }
}

function populateSuggestedReaders(users) {
    const suggestedList = document.getElementById('suggestedList');
    if (!suggestedList) return;
    
    if (!users || users.length === 0) {
        suggestedList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px;">
                <p style="color: #d4b5a0;">No suggestions yet</p>
            </div>
        `;
        return;
    }
    
    suggestedList.innerHTML = '';
    
    users.slice(0, 3).forEach(reader => {
        const suggestedItem = document.createElement('div');
        suggestedItem.className = 'suggested-item';
        suggestedItem.dataset.userId = reader._id || reader.id;
        
        const profileImage = reader.profilePicture && reader.profilePicture !== 'null'
            ? reader.profilePicture
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(reader.name)}&background=E0B973&color=3B1D14&size=50`;
        
        const genres = reader.favoriteGenres || reader.tags || ['Reader'];
        
        suggestedItem.innerHTML = `
            <img src="${profileImage}" alt="${reader.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(reader.name)}&background=E0B973&color=3B1D14&size=50'">
            <div>
                <h4>${reader.name}</h4>
                <p>Likes: ${genres.slice(0, 2).join(', ')}</p>
            </div>
            <button class="star-btn" onclick="event.stopPropagation(); toggleFavorite('${reader._id || reader.id}', this)">${reader.isFavorited ? '✓' : '⭐'}</button>
        `;
        
        suggestedItem.addEventListener('click', () => {
            window.location.href = `../Profile/view-profile.html?id=${reader._id || reader.id}`;
        });
        
        suggestedList.appendChild(suggestedItem);
    });
}

function getCurrentUserId() {
    try {
        const user = JSON.parse(localStorage.getItem('litlink_user') || '{}');
        return user._id || user.id;
    } catch {
        return null;
    }
}

// ===== INTERACTIVE FEATURES =====

async function connectToUser(userId, button) {
    try {
        const token = localStorage.getItem('litlink_token');
        
        if (button.textContent.includes('Connected')) {
            const response = await fetch(`http://localhost:5002/api/users/disconnect/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                button.textContent = '🔗 Connect';
                button.classList.remove('connected');
                button.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
                showNotification('Disconnected', 'info');
            }
        } else {
            const response = await fetch(`http://localhost:5002/api/users/connect/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                button.textContent = '✓ Connected';
                button.classList.add('connected');
                button.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                showNotification('Connected!', 'success');
            }
        }
    } catch (error) {
        console.error('Connection error:', error);
        showNotification('Connection failed', 'error');
    }
}

async function joinBoard(boardId, button) {
    try {
        const token = localStorage.getItem('litlink_token');
        
        window.location.href = `../Discussion Board/board.html?id=${boardId}`;
    } catch (error) {
        console.error('Join board error:', error);
        showNotification('Failed to join board', 'error');
    }
}

async function joinVoiceRoom(roomId, button) {
    try {
        const token = localStorage.getItem('litlink_token');
        
        const response = await fetch(`http://localhost:5002/api/voice-rooms/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            button.textContent = '🎙️ Joined';
            button.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
            showNotification('Joined voice room', 'success');
            
            const countElement = button.closest('.voice-room').querySelector('.participant-count');
            const currentCount = parseInt(countElement.textContent.match(/\d+/)[0]);
            countElement.textContent = `👥 ${currentCount + 1}`;
        } else {
            window.location.href = `../Voice Room/room.html?id=${roomId}`;
        }
    } catch (error) {
        console.error('Voice room error:', error);
        window.location.href = `../Voice Room/room.html?id=${roomId}`;
    }
}

async function toggleFavorite(userId, button) {
    try {
        const token = localStorage.getItem('litlink_token');
        
        if (button.textContent === '⭐') {
            const response = await fetch(`http://localhost:5002/api/users/favorite/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                button.textContent = '✓';
                button.style.color = '#059669';
                showNotification('Added to favorites', 'success');
            }
        } else {
            const response = await fetch(`http://localhost:5002/api/users/unfavorite/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                button.textContent = '⭐';
                button.style.color = 'inherit';
                showNotification('Removed from favorites', 'info');
            }
        }
    } catch (error) {
        console.error('Favorite error:', error);
        showNotification('Action failed', 'error');
    }
}

// ===== FALLBACK DATA =====

function loadFallbackData(user) {
    console.log('📦 Loading fallback data...');
    
    updateWelcomeCard(user);
    
    const fallbackMatches = [
        { id: '1', name: 'Elena R.', favoriteGenres: ['Fantasy', 'Sci-Fi'], sharedBooks: 32, isConnected: false },
        { id: '2', name: 'Marcus Chen', favoriteGenres: ['Mystery', 'Thriller'], sharedBooks: 28, isConnected: false }
    ];
    
    const fallbackChats = [
        { id: '1', name: 'The Midnight Library Club', lastMessage: 'Has anyone finished chapter 5 yet? That twist!', lastMessage: { createdAt: new Date(Date.now() - 2*60000) }, unreadCount: 3 }
    ];
    
    const fallbackActivity = [
        { icon: '📚', description: 'Sarah posted in Fantasy Board', timestamp: new Date(Date.now() - 3*60*60000) }
    ];
    
    populateTopMatches(fallbackMatches);
    loadTrendingBoards(); // Load original boards
    populateActiveChats(fallbackChats);
    populateRecentActivity(fallbackActivity);
    showEmptyVoiceRooms();
    populateSuggestedReaders([]);
}

// ===== UTILITY FUNCTIONS =====

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString();
}

function showLoadingState() {
    console.log('⏳ Loading...');
}

function hideLoadingState() {
    console.log('✅ Loaded');
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
        <span class="notification-icon">${icons[type]}</span>
        <span class="notification-message">${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 
                     type === 'warning' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                     type === 'error' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' :
                     'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'};
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
        max-width: 350px;
        pointer-events: auto;
    `;
    
    const container = document.getElementById('notification-container');
    if (container) {
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(400px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}