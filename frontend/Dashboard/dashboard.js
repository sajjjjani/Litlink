let dashboardUserId = null;

function getAuthToken() {
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getToken === 'function') {
        return window.LitlinkSessionAuth.getToken();
    }
    return sessionStorage.getItem('litlink_token') || localStorage.getItem('litlink_token') || sessionStorage.getItem('token') || localStorage.getItem('token');
}

function getAuthUser() {
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getUser === 'function') {
        return window.LitlinkSessionAuth.getUser();
    }
    try {
        const userStr = sessionStorage.getItem('litlink_user') || localStorage.getItem('litlink_user');
        return userStr ? JSON.parse(userStr) : null;
    } catch {
        return null;
    }
}

function getAuthUserId() {
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getUserId === 'function') {
        return window.LitlinkSessionAuth.getUserId();
    }
    const user = getAuthUser();
    return user ? (user._id || user.id || null) : null;
}

function normalizeMatchPercentage(value) {
    if (window.LitlinkMatchUtils && typeof window.LitlinkMatchUtils.normalizePercentage === 'function') {
        return window.LitlinkMatchUtils.normalizePercentage(value);
    }
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
}

function getAiIntroSessionKey(userId) {
    return `litlink_dashboard_ai_intro_done_${userId}`;
}

function shouldPlayAiIntro(userId) {
    if (!userId) return false;
    return sessionStorage.getItem(getAiIntroSessionKey(userId)) !== '1';
}

function markAiIntroComplete(userId) {
    if (!userId) return;
    sessionStorage.setItem(getAiIntroSessionKey(userId), '1');
}

function checkAuth() {
    const token = getAuthToken();
    const user = getAuthUser();

    if (!token || !user) {
        console.warn('❌ No authentication found, redirecting to login...');
        
        // GUARD: Don't redirect if we are already at the homepage
        if (window.location.pathname.includes('index.html')) {
            console.log('🛡️ Guard: Already at homepage, skipping redirect');
            return null;
        }

        console.trace('↪️ Dashboard auth check fail redirect');
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
    const toggle = document.getElementById('notificationsToggle');
    
    // Sync the toggle UI if it exists (for cross-tab sync)
    if (toggle && toggle.checked !== isEnabled) {
        toggle.checked = isEnabled;
    }

    if (!isEnabled) {
        if (notificationBtn) {
            notificationBtn.style.opacity = '0.5';
            notificationBtn.style.cursor = 'not-allowed';
            notificationBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                showNotification('Notifications are disabled', 'warning');
                return false;
            };
        }

        if (notificationBadge) {
            notificationBadge.style.display = 'none';
        }

        if (typeof stopNotificationPolling === 'function') {
            stopNotificationPolling();
        }
    } else {
        if (notificationBtn) {
            notificationBtn.style.opacity = '1';
            notificationBtn.style.cursor = 'pointer';
            notificationBtn.onclick = toggleNotificationsDropdown;
        }

        if (typeof startNotificationPolling === 'function') {
            startNotificationPolling();
        }
        if (typeof loadNotifications === 'function') {
            loadNotifications();
        }
    }

    // Update real-time client state if it exists
    if (typeof _notifClient !== 'undefined' && _notifClient) {
        _notifClient.showToasts = isEnabled;
        if (!isEnabled && _notifClient.socket) {
            console.log('🔌 Disconnecting NotificationClient due to user preference');
            _notifClient.disconnect();
        } else if (isEnabled && (!_notifClient.socket || !_notifClient.socket.connected)) {
            console.log('🔌 Reconnecting NotificationClient due to user preference');
            const token = getAuthToken();
            if (token) _notifClient.connect();
        }
    }
}

// Global cross-tab synchronization
window.addEventListener('storage', (e) => {
    if (e.key === 'notificationsEnabled') {
        const isEnabled = e.newValue === 'true';
        applyNotificationSetting(isEnabled);
    }
});

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.classList.toggle('active');
    }
}

function logout() {
    const performLogout = () => {
        if (window.AuthState) {
            AuthState.clearAuth();
        } else {
            localStorage.clear();
            sessionStorage.clear();
        }
        
        console.trace('↪️ Dashboard manual logout redirect');
        window.location.href = '../Homepage/index.html';
    };

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal(
            'Log Out',
            'Do you want to log out from Litlink?',
            performLogout
        );
        return;
    }

    if (confirm('Are you sure you want to logout?')) {
        performLogout();
    }
}

function showComingSoon(feature) {
    showNotification(`${feature} feature is coming soon!`, 'info');
}

function startDiscussion() {
    window.location.href = '../Discussion Board/discussion.html';
}

function browseBooks() {
    window.location.href = 'dashexplore.html';
}

function joinVoiceRoom() {
    window.location.href = '../Voice Room/voice-rooms.html';
}

function editProfile() {
    window.location.href = '../Profile/profile.html';
}

document.addEventListener('click', function (event) {
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

        const token = getAuthToken();
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
                'follow': 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
                'unfollow': 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                'thread_create': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                'like': 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
                'comment': 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                'circle_request': 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                'circle_accept': 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                'thread_liked': 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
                'thread_commented': 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                'circle_new_thread': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                'circle_join_request': 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                'circle_accepted': 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
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

            notificationItem.addEventListener('click', function () {
                handleNotificationClick(notif);
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

function resolveNotificationPath(notification) {
    const type = notification.type || notification.legacyType;
    const referenceId = notification.referenceId || notification.targetId || notification.relatedEntityId || null;
    const metadata = notification.metadata || {};

    if (notification.actionUrl) {
        const actionUrl = notification.actionUrl;

        // Translate backend API-style routes to static frontend pages.
        if (actionUrl.includes('/circles/') && actionUrl.includes('/threads/')) {
            const parts = actionUrl.split('/').filter(Boolean);
            const threadsIdx = parts.indexOf('threads');
            const threadId = threadsIdx !== -1 ? parts[threadsIdx + 1] : null;
            return threadId
                ? `../Discussion Board/discussion.html?threadId=${threadId}`
                : '../Discussion Board/discussion.html';
        }
        if (actionUrl.startsWith('/frontend/circles/') && actionUrl.includes('/threads/')) {
            const parts = actionUrl.split('/').filter(Boolean);
            const threadsIdx = parts.indexOf('threads');
            const threadId = threadsIdx !== -1 ? parts[threadsIdx + 1] : null;
            return threadId
                ? `../Discussion Board/discussion.html?threadId=${threadId}`
                : '../Discussion Board/discussion.html';
        }
        if (actionUrl.startsWith('/circles/')) {
            return '../Discussion Board/discussion.html';
        }

        if (actionUrl.startsWith('/discussions/')) {
            const threadId = actionUrl.split('/').filter(Boolean)[1];
            return threadId
                ? `../Discussion Board/discussion.html?threadId=${threadId}`
                : '../Discussion Board/discussion.html';
        }
        if (actionUrl.startsWith('/circles/') && actionUrl.endsWith('/requests')) {
            return '../Circle Requests/circle-requests.html';
        }
        if (actionUrl === '/circle-requests') {
            return '../Circle Requests/circle-requests.html';
        }
        if (actionUrl.startsWith('/voice-rooms/')) {
            const roomId = actionUrl.split('/').filter(Boolean)[1];
            return roomId
                ? `../Voice Room/room.html?id=${roomId}`
                : '../Voice Room/voice-rooms.html';
        }
        if (actionUrl.startsWith('/profile/')) {
            const userId = actionUrl.split('/').filter(Boolean)[1];
            return userId
                ? `../Profile/view-profile.html?id=${userId}`
                : '../Profile/profile.html';
        }
        if (actionUrl === '/discussion-board') {
            return '../Discussion Board/discussion.html';
        }

        return actionUrl;
    }

    const threadId = referenceId || metadata.threadId;
    const roomId = referenceId || metadata.roomId;
    const userId = referenceId || metadata.followerId || metadata.userId;

    switch (type) {
        case 'follow':
            return userId ? `../Profile/view-profile.html?id=${userId}` : '../Profile/profile.html';
        case 'voice_room_created':
        case 'voice':
            return '../Voice Room/voice-rooms.html';
        case 'like':
        case 'comment':
        case 'thread_liked':
        case 'thread_commented':
        case 'thread_create':
            return threadId ? `../Discussion Board/discussion.html?threadId=${threadId}` : '../Discussion Board/discussion.html';
        case 'circle_new_thread':
            return '../Discussion Board/discussion.html';
        case 'circle_created':
            return '../Discussion Board/discussion.html';
        case 'circle_request':
        case 'circle_join_request':
            return '../Circle Requests/circle-requests.html';
        case 'circle_accept':
        case 'circle_accepted':
            return '../Discussion Board/discussion.html?tab=my-circles';
        case 'message':
            return '../Chat/chat.html';
        default:
            return null;
    }
}

async function handleNotificationClick(notification) {
    try {
        const notificationId = notification.id;
        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled !== 'false') {
            const token = getAuthToken();

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

        const targetPath = resolveNotificationPath(notification);
        if (targetPath) {
            if (targetPath.startsWith('/')) {
                window.location.href = `..${targetPath}`;
            } else if (targetPath.startsWith('http')) {
                window.open(targetPath, '_blank');
            } else {
                window.location.href = targetPath;
            }
        } else {
            showNotification('This notification has no destination yet.', 'info');
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

        const token = getAuthToken();
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
    // Skip polling when the WebSocket client is active — it pushes counts in real-time.
    // Polling only kicks in as a fallback when NotificationClient is unavailable.
    if (typeof NotificationClient !== 'undefined') {
        console.log('ℹ️ WebSocket active — skipping REST polling');
        return;
    }

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

            const token = getAuthToken();
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

                if (data.unreadCount !== currentCount) {
                    updateNotificationBadge(data.unreadCount - currentCount);
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

// ===== UNREAD MESSAGE COUNT =====

async function fetchUnreadMessageCount() {
    const token = getAuthToken();
    if (!token) return 0;
    try {
        const response = await fetch('http://localhost:5002/api/chat/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            return data.unreadCount || 0;
        }
        return 0;
    } catch (error) {
        console.warn('Error fetching unread message count:', error);
        return 0;
    }
}

function updateUnreadMessageBadge(count) {
    const badge = document.getElementById('unreadMessageBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

let unreadMessagePollingInterval = null;

function startUnreadMessagePolling() {
    if (unreadMessagePollingInterval) clearInterval(unreadMessagePollingInterval);
    fetchUnreadMessageCount().then(updateUnreadMessageBadge);
    unreadMessagePollingInterval = setInterval(async () => {
        const count = await fetchUnreadMessageCount();
        updateUnreadMessageBadge(count);
    }, 30000);
}

function stopUnreadMessagePolling() {
    if (unreadMessagePollingInterval) {
        clearInterval(unreadMessagePollingInterval);
        unreadMessagePollingInterval = null;
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

// ===== USER WEBSOCKET (Socket.IO via NotificationClient) =====
// Requires: <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
// Requires: <script src="../utils/notificationClient.js"></script>

let _notifClient = null;

function initUserWebSocket(token) {
    if (!token) return;

    // If NotificationClient isn't loaded yet, fall back to polling only
    if (typeof NotificationClient === 'undefined') {
        console.warn('⚠️ NotificationClient not found — using polling fallback. ' +
            'Add socket.io CDN and notificationClient.js to dashboard.html');
        return;
    }

    _notifClient = new NotificationClient({
        serverUrl: 'http://localhost:5002',
        token: token,
        isAdmin: false,
        showToasts: localStorage.getItem('notificationsEnabled') !== 'false'
    });

    if (localStorage.getItem('notificationsEnabled') !== 'false') {
        _notifClient.connect();
    } else {
        console.log('ℹ️ Notifications disabled — skipping real-time connection');
    }

    // ── Generic fallback: any notification type not handled below ─────────
    _notifClient.on('notification', (data) => {
        console.log('🔔 Real-time notification:', data.type, data);

        // Refresh the dropdown list if it's open
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) {
            loadNotifications();
        }
        // Optimistic insert into dropdown
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: data.type,
            title: data.title,
            message: data.message,
            timestamp: 'Just now',
            read: false,
            icon: data.icon || '🔔',
            actionUrl: data.actionUrl || _defaultActionUrl(data.type, data.metadata)
        });
    });

    // ── Badge count pushed from server on connect (replaces REST polling) ─
    _notifClient.on('badge-updated', ({ count }) => {
        // NotificationClient already updated #notificationBadge via _setUserBadge,
        // so nothing extra to do here — just keep in sync with local state.
        console.log('🔢 Badge count updated:', count);
    });

    // ── Named type handlers: the 5 required notification types ────────────

    _notifClient.on('follow', (data) => {
        console.log('👤 Follow notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'follow',
            title: data.title || 'New Follower',
            message: data.message || `${data.metadata?.followerName || 'Someone'} followed you`,
            timestamp: 'Just now',
            read: false,
            icon: '👤',
            actionUrl: data.actionUrl || _defaultActionUrl('follow', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    _notifClient.on('circle_new_thread', (data) => {
        console.log('💬 Circle new thread notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'circle_new_thread',
            title: data.title || 'New Circle Post',
            message: data.message || `New post in ${data.metadata?.circleName || 'your circle'}`,
            timestamp: 'Just now',
            read: false,
            icon: '💬',
            actionUrl: data.actionUrl || _defaultActionUrl('circle_new_thread', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    _notifClient.on('circle_join_request', (data) => {
        console.log('🔔 Circle join request notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'circle_join_request',
            title: data.title || 'Join Request',
            message: data.message || `New join request for ${data.metadata?.circleName || 'your circle'}`,
            timestamp: 'Just now',
            read: false,
            icon: '🔔',
            actionUrl: data.actionUrl || _defaultActionUrl('circle_join_request', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    _notifClient.on('circle_accepted', (data) => {
        console.log('✅ Circle accepted notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'circle_accepted',
            title: data.title || 'Circle Request Accepted',
            message: data.message || `You were accepted into ${data.metadata?.circleName || 'a circle'}`,
            timestamp: 'Just now',
            read: false,
            icon: '✅',
            actionUrl: data.actionUrl || _defaultActionUrl('circle_accepted', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    _notifClient.on('thread_liked', (data) => {
        console.log('❤️ Thread liked notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'thread_liked',
            title: data.title || 'Post Liked',
            message: data.message || `${data.metadata?.likerName || 'Someone'} liked your post`,
            timestamp: 'Just now',
            read: false,
            icon: '❤️',
            actionUrl: data.actionUrl || _defaultActionUrl('thread_liked', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    _notifClient.on('thread_commented', (data) => {
        console.log('💭 Thread commented notification:', data);
        _prependNotificationItem({
            id: data.id || ('rt_' + Date.now()),
            type: 'thread_commented',
            title: data.title || 'New Comment',
            message: data.message || `${data.metadata?.commenterName || 'Someone'} commented on your post`,
            timestamp: 'Just now',
            read: false,
            icon: '💭',
            actionUrl: data.actionUrl || _defaultActionUrl('thread_commented', data.metadata)
        });
        const menu = document.getElementById('notificationsMenu');
        if (menu && menu.classList.contains('active')) loadNotifications();
    });

    // ── Real-time unread message count ──────────────────────────────────
    if (_notifClient.socket) {
        _notifClient.socket.on('unread-count-updated', (data) => {
            console.log('💬 Unread count updated:', data.unreadCount);
            updateUnreadMessageBadge(data.unreadCount || 0);
        });
    } else {
        _notifClient.on('unread-count-updated', (data) => {
            console.log('💬 Unread count updated:', data.unreadCount);
            updateUnreadMessageBadge(data.unreadCount || 0);
        });
    }

    _notifClient.connect();
}

// Derive a sensible URL when the server didn't send one
function _defaultActionUrl(type, metadata) {
    switch (type) {
        case 'follow':
            return metadata?.followerId ? `/profile/${metadata.followerId}` : null;
        case 'thread_liked':
        case 'thread_commented':
        case 'thread_create':
        case 'like':
        case 'comment':
            return metadata?.threadId ? `/discussions/${metadata.threadId}` : '../Discussion Board/discussion.html';
        case 'circle_new_thread':
            return metadata?.threadId ? `/discussions/${metadata.threadId}` : '/discussions';
        case 'circle_join_request':
        case 'circle_request':
            return '/circle-requests';
        case 'circle_accepted':
        case 'circle_accept':
            return metadata?.circleId ? `/circles/${metadata.circleId}` : '../Discussion Board/discussion.html';
        case 'message':
            return '../Chat/chat.html';
        default:
            return null;
    }
}

// Insert a new notification at the top of the dropdown without a full reload
function _prependNotificationItem(notif) {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    // Remove the "no notifications" placeholder if present
    const empty = list.querySelector('.notification-item.empty');
    if (empty) empty.remove();

    const iconColors = {
        follow: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
        thread_liked: 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
        thread_commented: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        thread_create: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        like: 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
        comment: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        circle_new_thread: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        circle_join_request: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        circle_accepted: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
        circle_request: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        circle_accept: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
        unfollow: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        match: 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)',
        message: 'linear-gradient(135deg, #3d2617 0%, #2c1810 100%)',
        board: 'linear-gradient(135deg, #92400e 0%, #78350f 100%)',
        voice: 'linear-gradient(135deg, #a16207 0%, #854d0e 100%)',
        system: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        info: 'linear-gradient(135deg, #4b5563 0%, #374151 100%)'
    };

    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.dataset.notificationId = notif.id;
    item.dataset.type = notif.type;

    item.innerHTML = `
        <div class="notification-icon" style="background: ${iconColors[notif.type] || iconColors.info}">
            ${notif.icon || '🔔'}
        </div>
        <div class="notification-content">
            <div class="notification-title">
                <span>${escapeHtml(notif.title || 'Notification')}</span>
                <span class="notification-time">${notif.timestamp || 'Just now'}</span>
            </div>
            <div class="notification-message">${escapeHtml(notif.message || '')}</div>
        </div>
        <div class="notification-dot"></div>
    `;

    item.addEventListener('click', () => {
        handleNotificationClick(notif);
    });

    list.insertBefore(item, list.firstChild);
}

// ===== MAIN DASHBOARD LOADING =====

document.addEventListener('DOMContentLoaded', async function () {
    console.log('📚 Dashboard loading with real data...');

    const auth = checkAuth();
    if (!auth) return;

    const { token, user } = auth;

    dashboardUserId = user._id || user.id;
    console.log('✅ Authenticated user:', user.name);

    // Profile completion gate: redirect if < 30%
    const completion = user.completionPercentage || 0;
    if (completion < 30) {
        console.warn(`⚠️ Profile only ${completion}% complete — redirecting to profile`);
        if (typeof showNotification === 'function') {
            showNotification('Please complete at least 30% of your profile before accessing the dashboard.', 'warning');
        }
        setTimeout(() => {
            window.location.href = '../Profile/profile.html';
        }, 2000);
        return;
    }

    initNotifications();
    initUserWebSocket(token);
    startUnreadMessagePolling();
    updateWelcomeCard(user);

    try {
        showLoadingState();

        // Load real data from multiple endpoints
        await Promise.all([
            loadTopMatches(token),
            loadTrendingBoards(token, dashboardUserId),
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
        exploreBtn.addEventListener('click', function (e) {
            e.preventDefault();
            window.location.href = 'dashexplore.html';
        });
    }

    const moreBtn = document.querySelector('.more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function () {
            window.location.href = '../Chat/chat.html';
        });
    }

    const viewMessagesBtn = document.querySelector('.view-messages-btn');
    if (viewMessagesBtn) {
        viewMessagesBtn.addEventListener('click', function () {
            window.location.href = '../Chat/chat.html';
        });
    }

    const viewMoreBtn = document.querySelector('.view-more');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', function () {
            window.location.href = '../Voice Room/voice-rooms.html';
        });
    }
});

// ===== LOAD REAL DATA FROM API ENDPOINTS =====
async function loadTopMatches(token) {
    try {
        const response = await fetch('http://localhost:5002/api/chat/matches?source=dashboard&t=' + Date.now(), {
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.matches) {
                const filteredMatches = data.matches.filter(m => {
                    const d = m.userDetails || m;
                    return d.name !== 'System Admin' &&
                        d.name !== 'Admin' &&
                        !d.isSystem &&
                        d.role !== 'admin';
                });

                const normalizedMatches = filteredMatches
                    .map(match => ({
                        ...match,
                        compatibility: normalizeMatchPercentage(match.compatibility)
                    }))
                    .sort((a, b) => (b.compatibility || 0) - (a.compatibility || 0));

                const playIntro = shouldPlayAiIntro(dashboardUserId);
                await populateTopMatches(normalizedMatches, { playIntro });
                markAiIntroComplete(dashboardUserId);
            } else {
                await populateTopMatches([], { playIntro: false });
            }
        } else {
            await populateTopMatches([], { playIntro: false });
        }
    } catch (error) {
        console.error('Error loading top matches:', error);
        await populateTopMatches([], { playIntro: false });
    }
}

// Trending circles from real backend activity (no mock fallback)
async function loadTrendingBoards(token, userId) {
    const boardsGrid = document.getElementById('boardsGrid');
    if (boardsGrid) {
        boardsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 24px;">
                <i class="fas fa-spinner fa-spin"></i>
                <p style="margin-top: 10px; color: #d4b5a0;">Loading trending circles...</p>
            </div>
        `;
    }

    if (!token || !userId) {
        populateTrendingCircles([], { mode: 'unauthorized' });
        return;
    }

    try {
        const response = await fetch(`http://localhost:5002/api/dashboard/${userId}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const circles = data?.dashboard?.trendingCircles || data?.dashboard?.trendingBoards || [];
            if (data.success && Array.isArray(circles)) {
                populateTrendingCircles(circles);
                return;
            }
        }
        populateTrendingCircles([], { mode: 'empty' });
    } catch (error) {
        console.error('Error loading trending circles:', error);
        populateTrendingCircles([], { mode: 'error' });
    }
}

async function loadActiveChats(token) {
    try {
        // /api/chat/conversations does not exist — use /api/chat/matches which
        // returns the list of users you have conversations with
        const response = await fetch('http://localhost:5002/api/chat/matches', {
            cache: 'no-store',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.matches && data.matches.length > 0) {
                // Filter only active conversations (ones that actually have a last message time or preview isn't the empty default)
                const activeMatches = data.matches.filter(m => m.preview !== 'No messages yet' || m.lastMessageTime);
                const conversations = activeMatches.map(m => ({
                    id: m.userId || m._id,
                    name: m.name,
                    avatar: m.profilePicture || null,
                    lastMessage: m.preview || '',
                    unreadCount: m.unreadCount || 0,
                    updatedAt: m.lastMessageTime ? new Date(m.lastMessageTime) : new Date(0)
                }));
                // Sort by latest activity (newest first)
                conversations.sort((a, b) => b.updatedAt - a.updatedAt);
                populateActiveChats(conversations);
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
        // /api/activity/recent does not exist on the server.
        // Build recent activity from the notifications endpoint instead —
        // it already tracks follows, likes, comments, circle events, etc.
        const response = await fetch('http://localhost:5002/api/notifications?limit=5&sort=-createdAt', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.notifications && data.notifications.length > 0) {
                // Map notification shape → activity shape
                const activities = data.notifications.map(n => ({
                    icon: n.icon || '🔔',
                    description: n.message || n.title,
                    timestamp: n.createdAt ? new Date(n.createdAt) : new Date(),
                    actionUrl: n.actionUrl || null
                }));
                populateRecentActivity(activities);
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
        // /api/users/suggested crashes (500). Use /api/matches/match-suggestions
        // which is the correct working endpoint for reader recommendations.
        const response = await fetch('http://localhost:5002/api/matches/match-suggestions?limit=5', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // Shape: { success, suggestions: [{ userId, name, profilePicture,
            //   favoriteGenres, matchScore, … }] }
            const users = data.suggestions || data.users || data.matches || [];
            if (data.success && users.length > 0) {
                const filtered = users.filter(u =>
                    u.name !== 'System Admin' &&
                    u.name !== 'Admin' &&
                    !u.isSystem &&
                    u.role !== 'admin'
                );
                populateSuggestedReaders(filtered);
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

/**
 * Enhanced populateTopMatches with structured AI reasoning and animations.
 */
async function populateTopMatches(matches, options = {}) {
    const matchesGrid = document.getElementById('matchesGrid');
    if (!matchesGrid) return;
    const playIntro = options.playIntro === true;

    if (matches && matches.length > 0) {
        matchesGrid.innerHTML = '';
        if (playIntro) {
            const statusContainer = document.createElement('div');
            statusContainer.className = 'ai-status-container';
            matchesGrid.appendChild(statusContainer);

            const messages = ["Analyzing your profile", "Finding your matches", "Calculating match scores"];
            const greetingEl = document.getElementById('aiGreeting');
            if (greetingEl) {
                greetingEl.classList.remove('visible');
                setTimeout(() => {
                    const greetings = [
                        "Found some readers that match your vibe.",
                        "These matches look promising based on your preferences.",
                        "You might enjoy connecting with these readers.",
                        "Analyzing your literary profile... here are your top matches.",
                        "Discovered some fellow readers who share your interests."
                    ];
                    greetingEl.textContent = greetings[Math.floor(Math.random() * greetings.length)];
                    greetingEl.classList.add('visible');
                }, 500);
            }

            for (const msg of messages) {
                const messageEl = document.createElement('div');
                messageEl.className = 'status-message';
                messageEl.innerHTML = `${msg}<span class="dots"></span>`;
                statusContainer.appendChild(messageEl);
                await new Promise(r => setTimeout(r, 50));
                messageEl.classList.add('visible');
                await new Promise(r => setTimeout(r, 450));
                messageEl.classList.add('fade-out');
                await new Promise(r => setTimeout(r, 200));
                messageEl.remove();
            }

            statusContainer.remove();
            matchesGrid.classList.remove('pulse-active');
            void matchesGrid.offsetWidth;
            matchesGrid.classList.add('pulse-active');
        }
    } else {
        matchesGrid.innerHTML = `
            <div class="ai-empty-state">
                <i class="fas fa-robot"></i>
                <p>We couldn't find strong matches yet.</p>
                <span>Try updating your profile genres and activity to improve results.</span>
                <br>
                <button onclick="window.location.href='dashexplore.html'" class="explore-btn" style="margin-top: 24px;">Explore Readers</button>
            </div>
        `;
        return;
    }

    // 2. Render Enhanced Match Cards
    const cardsToRender = matches.slice(0, 6);
    cardsToRender.forEach((match, index) => {
        const matchCard = document.createElement('div');
        matchCard.className = 'match-card';
        const uId = match.userId || match._id || match.id;
        matchCard.dataset.userId = uId;

        const details = match.userDetails || match;
        const matchName = details.name || 'User';
        const profileImage = details.profilePicture && details.profilePicture !== 'null'
            ? details.profilePicture
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(matchName)}&background=E0B973&color=3B1D14&size=80`;

        const genres = Array.isArray(details.favoriteGenres)
            ? details.favoriteGenres
            : Array.isArray(details.tags)
                ? details.tags
                : [details.genre || 'Reader'];
        const points = getStructuredReasoning(match);
        const detailedExplanation = getDetailedExplanation(match);

        const percentage = normalizeMatchPercentage(match.compatibility);

        let confidenceLabel = "Good Match";
        if (percentage >= 85) confidenceLabel = "Highly Compatible";
        else if (percentage >= 70) confidenceLabel = "Strong Match";
        else if (percentage < 50) confidenceLabel = "Low Match";

        const radius = 45;
        const circumference = 2 * Math.PI * radius;

        matchCard.innerHTML = `
            ${index === 0 ? '<div class="best-match-label">✨ Best Match</div>' : ''}
            <div class="ai-match-badge">AI Match</div>
            
            <div class="match-score-container">
                <svg class="progress-ring">
                    <circle class="progress-ring__background" stroke="currentColor" stroke-width="4" fill="transparent" r="${radius}" cx="50" cy="50"/>
                    <circle class="progress-ring__circle" stroke-width="4" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${circumference}" fill="transparent" r="${radius}" cx="50" cy="50"/>
                </svg>
                <div class="match-avatar-wrapper">
                    <img src="${profileImage}" alt="${matchName}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(matchName)}&background=E0B973&color=3B1D14&size=80'">
                </div>
                <div class="match-percentage-badge" id="score-val-${uId}">0%</div>
            </div>

            <div class="confidence-label">${confidenceLabel}</div>
            
            <h3>${matchName}</h3>
            <div class="tags">
                ${genres.slice(0, 2).map(genre => `<span class="tag">${genre}</span>`).join('')}
            </div>
            
            <div class="reasoning-points">
                ${points.map(p => `
                    <div class="reasoning-point">
                        <span class="dot">•</span>
                        <span class="label">${p.label}:</span>
                        <span class="value">${p.value}</span>
                    </div>
                `).join('')}
            </div>
            
            <button class="why-toggle" onclick="event.stopPropagation(); toggleWhy(this, '${uId}')">
                ✨ Why this match?
            </button>
            <div class="expanded-reasoning" id="why-text-${uId}">
                ${detailedExplanation}
            </div>
            
            <button class="connect-btn" onclick="event.stopPropagation(); window.location.href='../Chat/chat.html?userId=${uId}'">
                <i class="fas fa-comments"></i> Start Chat
            </button>
        `;

        matchCard.addEventListener('click', () => {
            window.location.href = `../Profile/view-profile.html?id=${uId}`;
        });

        matchesGrid.appendChild(matchCard);

        // 3. Staggered Card Reveal
        setTimeout(() => {
            matchCard.classList.add('reveal');

            // 4. Animate Match Score & Ring
            const circle = matchCard.querySelector('.progress-ring__circle');
            const scoreVal = document.getElementById(`score-val-${uId}`);
            if (circle && scoreVal) {
                const radius = 45;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percentage / 100) * circumference;

                // Start animation slightly after card appears
                setTimeout(() => {
                    circle.style.strokeDashoffset = offset;
                    animateScoreCounter(scoreVal, percentage, 800);
                }, 400);
            }

            // 5. Staggered Reasoning Point Reveal
            const pointsList = matchCard.querySelectorAll('.reasoning-point');
            pointsList.forEach((point, pIndex) => {
                setTimeout(() => {
                    point.classList.add('reveal');
                }, 600 + (pIndex * 150));
            });

        }, index * 100);
    });
}

function populateTrendingCircles(circles, options = {}) {
    const boardsGrid = document.getElementById('boardsGrid');
    if (!boardsGrid) return;

    const mode = options.mode || 'ok';
    const safeCircles = Array.isArray(circles) ? circles : [];

    if (safeCircles.length === 0) {
        let message = 'No trending circles yet. Start a discussion to spark activity.';
        if (mode === 'error') {
            message = 'Unable to load trending circles right now.';
        } else if (mode === 'unauthorized') {
            message = 'Please sign in to view trending circles.';
        }

        boardsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 24px;">
                <i class="fas fa-users"></i>
                <p style="margin-top: 10px; color: #d4b5a0;">${message}</p>
            </div>
        `;
        return;
    }

    boardsGrid.innerHTML = '';

    safeCircles.forEach(circle => {
        const circleId = circle.circleId || circle.id;
        const memberCount = circle.memberCount || 0;
        const activeDiscussions = circle.activeDiscussions || circle.threadCount || 0;
        const recentEngagement = circle.recentEngagement || 0;
        const latestPosts = circle.latestPosts || 0;
        const lastActivityAt = circle.lastActivityAt ? timeAgo(new Date(circle.lastActivityAt)) : 'No recent activity';

        const boardCard = document.createElement('div');
        boardCard.className = 'board-card';
        boardCard.dataset.boardId = circleId;

        boardCard.innerHTML = `
            <div class="board-icon">${circle.icon || '📚'}</div>
            <h3>${escapeHtml(circle.name || 'Circle')}</h3>
            <p class="board-active">🟢 ${formatNumber(memberCount)} members · ${activeDiscussions} active discussions</p>
            <p class="board-active">⚡ ${formatNumber(recentEngagement)} engagement · ${latestPosts} new posts</p>
            <p class="board-active">🕒 ${lastActivityAt}</p>
            <button class="join-btn" onclick="event.stopPropagation(); joinBoard('${circleId}', this)">
                Open Circle →
            </button>
        `;

        boardCard.addEventListener('click', () => {
            window.location.href = `../Discussion Board/discussion.html?circleId=${encodeURIComponent(circleId)}`;
        });

        boardsGrid.appendChild(boardCard);
    });
}

function populateTrendingBoards(boards, options) {
    populateTrendingCircles(boards, options);
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
            <button class="join-room-btn" onclick="event.stopPropagation(); joinLiveVoiceRoom('${room._id || room.id}', this)">
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
            <div class="empty-voice-rooms" style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; background: rgba(61, 36, 23, 0.3); border-radius: 12px; border: 1px dashed rgba(212, 181, 160, 0.2);">
                <div style="font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.6;">🎙️</div>
                <p style="color: #d4b5a0; font-size: 1.1rem; margin-bottom: 1.5rem;">No active voice rooms at the moment.</p>
                <button onclick="window.location.href='../Voice Room/voice-rooms.html'" class="explore-btn" style="padding: 0.8rem 2rem; border-radius: 50px; background: #d4a574; color: #1a0f0a; border: none; font-weight: 600; cursor: pointer; transition: transform 0.2s;">
                    Browse All Rooms
                </button>
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
    return getAuthUserId();
}

// ===== INTERACTIVE FEATURES =====

async function connectToUser(userId, button) {
    try {
        const token = getAuthToken();

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
        if (!boardId) return;
        window.location.href = `../Discussion Board/discussion.html?circleId=${encodeURIComponent(boardId)}`;
    } catch (error) {
        console.error('Join board error:', error);
        showNotification('Failed to join board', 'error');
    }
}

async function joinLiveVoiceRoom(roomId, button) {
    try {
        const token = getAuthToken();

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
        const token = getAuthToken();

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
        { id: '1', name: 'The Midnight Library Club', lastMessage: 'Has anyone finished chapter 5 yet? That twist!', lastMessage: { createdAt: new Date(Date.now() - 2 * 60000) }, unreadCount: 3 }
    ];

    const fallbackActivity = [
        { icon: '📚', description: 'Sarah posted in Fantasy Board', timestamp: new Date(Date.now() - 3 * 60 * 60000) }
    ];

    populateTopMatches(fallbackMatches, { playIntro: false });
    populateTrendingCircles([], { mode: 'error' });
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
// ===== AI REASONING HELPERS =====

function getStructuredReasoning(match) {
    const details = match.userDetails || match;
    const genres = details.favoriteGenres || details.tags || [];
    const explanation = match.explanation || '';

    const points = [];

    // 1. Shared Genres
    const genreVal = genres.length > 0 ? genres.slice(0, 1)[0] : 'Literature';
    points.push({ label: 'Shared genres', value: genreVal });

    // 2. Discussion Style (Inferred from profile/explanation)
    let style = 'Deep analyzer';
    if (explanation.toLowerCase().includes('fantasy')) style = 'World builder';
    if (explanation.toLowerCase().includes('mystery')) style = 'Puzzle solver';
    if (explanation.toLowerCase().includes('romance')) style = 'Empathy focused';
    points.push({ label: 'Discussion style', value: style });

    // 3. Interaction Patterns
    let interaction = 'Voice explorer';
    if (explanation.toLowerCase().includes('daily') || details.activityScore > 80) interaction = 'Daily active';
    else if (Math.random() > 0.5) interaction = 'Discussion regular';

    points.push({ label: 'Interaction', value: interaction });

    return points;
}

function getDetailedExplanation(match) {
    const details = match.userDetails || match;
    const name = details.name || 'this reader';
    const explanation = match.explanation || 'You have similar reading interests.';

    return `The AI analyzed your profiles and found that you and ${name} both prioritize ${explanation.toLowerCase()}. This shared passion, combined with similar interaction patterns, makes you an excellent match for meaningful literary discussions.`;
}

function toggleWhy(btn, id) {
    const text = document.getElementById(`why-text-${id}`);
    if (text) {
        text.classList.toggle('active');
        btn.textContent = text.classList.contains('active') ? '✨ Show less' : '✨ Why this match?';
    }
}
window.toggleWhy = toggleWhy;

function animateScoreCounter(element, target, duration) {
    let start = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out quadratic
        const easeProgress = progress * (2 - progress);
        const currentVal = Math.floor(easeProgress * target);

        element.textContent = `${currentVal}%`;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = `${target}%`;
        }
    }

    requestAnimationFrame(update);
}

/**
 * Re-triggers the AI matching sequence without a full page reload.
 */
async function refreshMatches() {
    const token = getAuthToken();
    const user = getAuthUser();

    if (token && user) {
        console.log('🔄 Refreshing matches...');
        loadTopMatches(token);
    }
}
window.refreshMatches = refreshMatches;
