document.addEventListener('DOMContentLoaded', function() {
    console.log('%c Litlink Admin Dashboard v2.5.1', 
        'font-size: 16px; font-weight: bold; color: #d97706; background: #1a0f0a; padding: 8px 12px; border-radius: 4px;');
    
    checkAuthAndInitialize();
});

// Global variables
let API_BASE = 'http://localhost:5002/api/admin';
let API_ROOT = 'http://localhost:5002/api';
let authToken = null;
let currentUser = null;
let refreshInterval = null;
let socket = null;
let socketConnected = false;
let wsReconnectAttempts = 0;
const MAX_WS_RECONNECT_ATTEMPTS = 10;

// Load Socket.IO client
function loadSocketIO() {
    return new Promise((resolve, reject) => {
        if (window.io) {
            resolve(window.io);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
        script.onload = () => resolve(window.io);
        script.onerror = () => reject(new Error('Failed to load Socket.IO client'));
        document.head.appendChild(script);
    });
}

async function checkAuthAndInitialize() {
    // ── AUTHENTICATION PRIORITY ──────────────────────────────────────────────
    // We prioritize sessionStorage (current tab) over localStorage (global).
    // This prevents stale regular-user data in localStorage from overriding 
    // a fresh admin login in sessionStorage.
    authToken = sessionStorage.getItem('litlink_token') || 
                sessionStorage.getItem('authToken') || 
                localStorage.getItem('litlink_token') || 
                localStorage.getItem('authToken');
                
    const userStr = sessionStorage.getItem('litlink_user') || 
                    sessionStorage.getItem('user') || 
                    localStorage.getItem('litlink_user') || 
                    localStorage.getItem('user');
    
    if (authToken) window.authToken = authToken;
    
    try {
        currentUser = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        console.error('Failed to parse user data:', e);
        currentUser = null;
    }
    
    console.log('🔐 Admin Auth Check:', { 
        hasToken: !!authToken, 
        tokenSource: sessionStorage.getItem('litlink_token') ? 'sessionStorage' : 'localStorage',
        userFound: !!currentUser,
        isAdmin: currentUser?.isAdmin 
    });
    
    if (!authToken || !currentUser?.isAdmin) {
        console.warn('❌ Auth failed: No token or user is not an admin.');
        showToast('Admin access required. Redirecting...', 'warning');
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 1500);
        return;
    }
    
    showLoadingState(true);
    
    try {
        const response = await fetch(`${API_BASE}/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) throw new Error('Invalid admin credentials');
        
        const data = await response.json();
        
        if (!data.success || !data.user.isAdmin) {
            throw new Error('User is not an administrator');
        }
        
        console.log('✅ Admin authenticated:', data.user.name);
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
        
        updateAdminUI(data.user);
        
        await loadSocketIO();
        initSocketIO();
        
        initDashboard();
        
    } catch (error) {
        console.error('❌ Admin authentication failed:', error);
        showLoadingState(false);
        showToast(error.message || 'Admin authentication failed', 'error');
        localStorage.clear();
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 2000);
    }
}

function updateAdminUI(user) {
    const adminName = document.querySelector('.user-name');
    const adminAvatar = document.querySelector('.user-avatar');
    const adminLabel = document.querySelector('.admin-label');
    
    if (adminName && user.name) adminName.textContent = user.name;
    
    if (adminAvatar && user.name) {
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase() || 'A';
        adminAvatar.textContent = initials;
    }
    
    if (adminLabel && user.adminLevel) {
        adminLabel.textContent = `${user.adminLevel.replace('_', ' ').toUpperCase()} Panel`;
    }
}

// ===== FIXED SOCKET.IO CONNECTION =====
function initSocketIO() {
    if (socket && socket.connected) {
        console.log('Socket already connected');
        return;
    }
    
    if (socket && socket.disconnected) {
        socket.connect();
        return;
    }
    
    console.log('🔌 Initializing Socket.IO connection for admin...');
    
    try {
        socket = io('http://localhost:5002', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        socket.on('connect', () => {
            console.log('✅ Socket.IO connected, ID:', socket.id);
            socketConnected = true;
            wsReconnectAttempts = 0;
            
            socket.emit('authenticate', authToken);
            
            const statusIndicator = document.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.style.backgroundColor = '#16a34a';
            }
            
            const statusText = document.querySelector('.footer-right span:nth-child(2)');
            if (statusText) {
                statusText.textContent = 'System Operational (Live)';
            }
        });
        
        socket.on('authenticated', (data) => {
            if (data.success) {
                console.log('✅ Socket.IO authenticated as admin');
                
                setTimeout(() => {
                    socket.emit('get-unread-count');
                }, 500);
                
                if (data.connectedAdmins) {
                    console.log(`👥 ${data.connectedAdmins} admins online`);
                }
            } else {
                console.error('❌ Socket.IO authentication failed:', data.error);
                showToast('Failed to authenticate with real-time server', 'error');
            }
        });
        
        socket.on('admin-authenticated', (data) => {
            console.log('✅ Admin authenticated via Socket.IO:', data.userName);
            if (data.connectedAdmins) {
                console.log(`👥 ${data.connectedAdmins} admins connected`);
            }
        });
        
        socket.on('admin-notification', (data) => {
            console.log('🔔 New admin notification:', data);
            handleWebSocketMessage(data);
        });
        
        socket.on('notification-count', (data) => {
            console.log('📊 Notification count update:', data.unreadCount);
            updateNotificationBadge(data.unreadCount);
        });
        
        socket.on('disconnect', (reason) => {
            console.log('❌ Socket.IO disconnected:', reason);
            socketConnected = false;
            
            const statusIndicator = document.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.style.backgroundColor = '#eab308';
            }
            
            const statusText = document.querySelector('.footer-right span:nth-child(2)');
            if (statusText) {
                statusText.textContent = 'Reconnecting...';
            }
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error);
            wsReconnectAttempts++;
            
            const statusText = document.querySelector('.footer-right span:nth-child(2)');
            if (statusText && wsReconnectAttempts >= 5) {
                statusText.textContent = 'Connection Lost - Refresh Page';
            }
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Socket.IO reconnected after ${attemptNumber} attempts`);
            socketConnected = true;
            socket.emit('authenticate', authToken);
            
            const statusIndicator = document.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.style.backgroundColor = '#16a34a';
            }
            
            const statusText = document.querySelector('.footer-right span:nth-child(2)');
            if (statusText) {
                statusText.textContent = 'System Operational (Live)';
            }
            
            showToast('Reconnected to real-time server', 'success');
        });
        
    } catch (error) {
        console.error('Failed to initialize Socket.IO:', error);
        showToast('Could not connect to real-time server', 'warning');
    }
}

// Voice room status check
async function checkVoiceRoomStatus() {
    try {
        const response = await fetch(`${API_ROOT}/voice-rooms/rooms/live`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            const liveRooms = data.rooms.length;
            const statCard = document.querySelector('.stat-card:nth-child(4) .stat-value');
            if (statCard) {
                const currentValue = parseInt(statCard.textContent) || 0;
                if (currentValue !== liveRooms) {
                    animateValue(statCard, currentValue, liveRooms, 500);
                } else {
                    statCard.textContent = liveRooms;
                }
                if (liveRooms > 0) {
                    statCard.style.color = '#16a34a';
                } else {
                    statCard.style.color = '#e8d5c4';
                }
            }
        }
    } catch (error) {
        console.error('Error checking voice rooms:', error);
    }
}

function handleWebSocketMessage(data) {
    console.log('📨 WebSocket message received:', data.type || data.notificationType);
    
    const notificationType = data.type || data.notificationType;
    
    switch(notificationType) {
        case 'admin-notification':
        case 'admin_new_report':
        case 'admin_new_user':
        case 'admin_user_banned':
        case 'admin_user_suspended':
        case 'admin_report_resolved':
        case 'admin_warning_issued':
            updateNotificationBadge('+1');
            showNotificationToast(data);
            loadDashboardData();
            break;
            
        case 'notification-count':
            updateNotificationBadge(data.unreadCount);
            break;
            
        case 'pong':
            break;
            
        default:
            console.log('Unknown message type:', notificationType, data);
    }
}

function updateNotificationBadge(count) {
    const badge = document.querySelector('.notification-badge');
    if (!badge) return;
    
    let newCount = 0;
    if (typeof count === 'string' && count.startsWith('+')) {
        const current = parseInt(badge.textContent) || 0;
        newCount = current + parseInt(count.substring(1));
    } else {
        newCount = Math.max(0, parseInt(count) || 0);
    }
    
    if (newCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = newCount > 99 ? '99+' : String(newCount);
        badge.style.animation = 'badgePulse 0.5s ease';
        setTimeout(() => {
            badge.style.animation = '';
        }, 500);
    } else {
        badge.style.display = 'none';
    }
}

function showNotificationToast(notification) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    
    const title = notification.title || 
                  (notification.notificationType === 'admin_new_report' ? 'New Report' :
                   notification.notificationType === 'admin_new_user' ? 'New User' :
                   notification.notificationType === 'admin_user_banned' ? 'User Banned' :
                   notification.notificationType === 'admin_user_suspended' ? 'User Suspended' :
                   'Admin Notification');
    
    const message = notification.message || 
                    (notification.notificationType === 'admin_new_report' ? 'A new report requires attention' :
                     notification.notificationType === 'admin_new_user' ? 'A new user has joined the platform' :
                     'Check admin panel for details');
    
    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:20px;">${getNotificationIcon(notification.notificationType)}</div>
            <div style="flex:1;">
                <div style="font-weight:600;">${title}</div>
                <div style="font-size:12px; color:#a78c6d;">${message}</div>
                <div style="font-size:10px; color:#6b4e3a; margin-top:4px;">${new Date().toLocaleTimeString()}</div>
            </div>
        </div>
    `;
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2c1810;
        border-left: 4px solid #d4a574;
        border-radius: 8px;
        padding: 12px 16px;
        z-index: 10001;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease-out;
        cursor: pointer;
        max-width: 350px;
    `;
    
    document.body.appendChild(toast);
    
    toast.onclick = () => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    };
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        admin_new_user: '👤',
        admin_new_report: '⚠️',
        admin_user_banned: '🚫',
        admin_user_suspended: '⏸️',
        admin_system_alert: '🔧',
        admin_warning_issued: '⚠️',
        admin_report_resolved: '✅',
        admin_filter_word_added: '🔤',
        admin_voice_room_flagged: '🎙️'
    };
    return icons[type] || '🔔';
}

// ===== DASHBOARD FUNCTIONS =====
function initDashboard() {
    initAnimations();
    setupInteractions();
    startRealtimeUpdates();
    loadDashboardData();
}

// ===== DATA LOADING =====
const DASHBOARD_CACHE_KEY = 'litlink_admin_dashboard_cache';
const CACHE_MAX_AGE = 30000;

function getCachedDashboardData() {
    try {
        const cached = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_MAX_AGE) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function cacheDashboardData(data) {
    try {
        sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {}
}

async function loadDashboardData() {
    showLoadingState(true);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(`${API_BASE}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        
        if (data.success) {
            updateStats(data.stats);
            updateRecentReports(data.recentReports || []);
            updateRecentActivity(data.recentActivity || []);
            cacheDashboardData(data);
        }
        
        await checkVoiceRoomStatus();
        
        showLoadingState(false);
        
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        showLoadingState(false);
        
        const cached = getCachedDashboardData();
        if (cached?.success) {
            updateStats(cached.stats || {});
            updateRecentReports(cached.recentReports || []);
            updateRecentActivity(cached.recentActivity || []);
            showToast('Using cached data. Server may be slow.', 'warning');
        } else {
            showEmptyStatsState();
            showToast('Could not load dashboard data. Please refresh.', 'error');
        }
    }
}

// ===== UI UPDATE FUNCTIONS =====
function updateStats(stats) {
    console.log('📊 Updating stats:', stats);
    
    updateStatValue('#totalUsersStat', stats.totalUsers || 0);
    updateStatValue('#activeTodayStat', stats.activeToday || 0);
    updateStatValue('#activeMatchesStat', stats.activeMatches || 0);
    updateStatValue('#liveRoomsStat', stats.liveRooms || 0);
    
    updateStatValue('#newReportsStat', stats.newReports || 0);
    updateStatValue('#pendingReportsStat', stats.pendingReports || 0);
    updateStatValue('#resolvedReportsStat', stats.resolvedReports || 0);
    
    updateStatValue('#joinedTodayStat', stats.joinedToday || 0);
    updateStatValue('#joinedWeekStat', stats.joinedWeek || 0);
    updateStatValue('#bannedUsersStat', stats.bannedUsers || 0);
    updateStatValue('#suspendedUsersStat', stats.suspendedUsers || 0);
}

function updateStatValue(selector, value) {
    const element = document.querySelector(selector);
    if (element && value !== undefined) {
        const current = parseInt(element.textContent.replace(/,/g, '')) || 0;
        if (current !== value) {
            animateValue(element, current, value, 500);
        } else {
            element.textContent = value.toLocaleString();
        }
    }
}

function animateValue(element, start, end, duration) {
    if (!element) return;
    const range = end - start;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.floor(start + (range * progress));
        element.textContent = value.toLocaleString();
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

function updateRecentReports(reports) {
    const reportsList = document.querySelector('.reports-list');
    if (!reportsList) return;
    
    if (!reports || reports.length === 0) {
        reportsList.innerHTML = `
            <div class="report-item" style="justify-content: center;">
                <div class="report-info">
                    <div class="report-type">No recent reports</div>
                </div>
            </div>
        `;
        return;
    }
    
    reportsList.innerHTML = reports.map(report => `
        <div class="report-item" data-report-id="${report._id}">
            <div class="report-icon">
                ${getReportIcon(report.reportedItemType)}
            </div>
            <div class="report-info">
                <div class="report-type">${getReportTypeText(report.reportedItemType)} 
                    <span class="report-time">• ${getTimeAgo(report.createdAt)}</span>
                </div>
                <div class="report-desc">${(report.reason || report.category || 'No description').substring(0, 60)}</div>
            </div>
            <span class="badge ${report.status === 'pending' ? 'badge-pending' : 'badge-reviewed'}">
                ${report.status === 'pending' ? 'Pending' : report.status === 'resolved' ? 'Resolved' : 'Reviewed'}
            </span>
            <svg class="chevron-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.5"/>
            </svg>
        </div>
    `).join('');
    
    document.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', () => {
            const reportId = item.dataset.reportId;
            if (reportId) openReportDetails(reportId);
        });
    });
}

function updateRecentActivity(activity) {
    const engagementContent = document.querySelector('.engagement-content');
    if (!engagementContent) return;
    
    if (activity && activity.length > 0) {
        const topUsers = activity.slice(0, 3).map((user, index) => `
            <div class="user-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div class="user-info" style="display: flex; align-items: center; gap: 10px;">
                    <div class="avatar" style="width: 32px; height: 32px; background: #7A4432; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;">${(user.name || 'U').charAt(0).toUpperCase()}</div>
                    <span class="user-name">${user.name || 'Unknown'}</span>
                </div>
                <span class="user-count" style="font-size: 12px; color: #a78c6d;">Active</span>
            </div>
        `).join('');
        
        engagementContent.innerHTML = `
            <div class="engagement-item">
                <div class="engagement-label">Recently Active Users</div>
                ${topUsers}
            </div>
        `;
    } else {
        engagementContent.innerHTML = `
            <div class="engagement-item">
                <div class="engagement-label">Activity Data</div>
                <div style="color: #a78c6d;">No recent activity</div>
            </div>
        `;
    }
}

function getReportIcon(type) {
    const icons = {
        user: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 18C3 14.134 6.134 11 10 11C13.866 11 17 14.134 17 18" stroke="currentColor" stroke-width="1.5"/>
        </svg>`,
        post: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 8H13M7 11H13M7 14H10" stroke="currentColor" stroke-width="1.5"/>
        </svg>`,
        chat: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="6" width="16" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 9H10M6 12H12" stroke="currentColor" stroke-width="1.5"/>
        </svg>`,
        profile: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 18C3 14.134 6.134 11 10 11C13.866 11 17 14.134 17 18" stroke="currentColor" stroke-width="1.5"/>
        </svg>`,
        voice_room: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19C14.9706 19 19 14.9706 19 10" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 5V10L13 12" stroke="currentColor" stroke-width="1.5"/>
        </svg>`,
        default: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>`
    };
    return icons[type] || icons.default;
}

function getReportTypeText(type) {
    const types = { 
        user: 'User Report', 
        post: 'Post Report', 
        chat: 'Chat Report',
        profile: 'Profile Report',
        voice_room: 'Voice Room Report'
    };
    return types[type] || type || 'Report';
}

function showEmptyStatsState() {
    const statValues = document.querySelectorAll('.stat-value, .mod-value, .info-value');
    statValues.forEach(stat => { stat.textContent = '0'; });
}

// ===== REPORT FUNCTIONS =====
async function openReportDetails(reportId) {
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to fetch report');
        
        const data = await response.json();
        if (data.success) showReportModal(data.report);
        
    } catch (error) {
        console.error('Error fetching report:', error);
        showToast('Could not load report details', 'warning');
    }
}

function showReportModal(report) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #e8d5c4;">Report Details</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <div style="font-size: 12px; color: #a78c6d;">Status</div>
                        <span class="badge ${report.status === 'pending' ? 'badge-pending' : 'badge-reviewed'}">${report.status}</span>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #a78c6d;">Priority</div>
                        <span style="color: ${getPriorityColor(report.priority)};">${report.priority || 'medium'}</span>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #a78c6d;">Type</div>
                        <span>${getReportTypeText(report.reportedItemType)}</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Reported By</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">
                        ${report.reporter?.name || 'Anonymous'} (${report.reporter?.email || 'N/A'})
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Reported User</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">
                        ${report.reportedUser?.name || 'Unknown'} (${report.reportedUser?.email || 'N/A'})
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Reason</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">${report.reason || report.category || 'No reason provided'}</div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Description</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">${report.description || 'No description'}</div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Reported At</div>
                    <div>${new Date(report.createdAt).toLocaleString()}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="action-btn resolve-report" data-report-id="${report._id}" style="background: #16a34a;">Resolve</button>
                <button class="action-btn dismiss-report" data-report-id="${report._id}" style="background: #dc2626;">Dismiss</button>
                <button class="action-btn assign-report" data-report-id="${report._id}" style="background: #eab308;">Assign to Me</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelector('.resolve-report').onclick = () => {
        resolveReport(report._id);
        modal.remove();
    };
    
    modal.querySelector('.dismiss-report').onclick = () => {
        dismissReport(report._id);
        modal.remove();
    };
    
    modal.querySelector('.assign-report').onclick = () => {
        assignReportToMe(report._id);
        modal.remove();
    };
}

function getPriorityColor(priority) {
    const colors = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
    return colors[priority] || '#a78c6d';
}

// ===== USER ACTION FUNCTIONS =====
async function resolveReport(reportId) {
    const resolution = prompt('Enter resolution notes:', 'Report resolved by admin');
    if (!resolution) return;
    
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}/resolve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ resolution })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Report resolved successfully', 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to resolve report', 'error');
        }
    } catch (error) {
        console.error('Error resolving report:', error);
        showToast('Failed to resolve report', 'error');
    }
}

async function dismissReport(reportId) {
    const reason = prompt('Enter dismissal reason:', 'Report dismissed as invalid');
    if (!reason) return;
    
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}/dismiss`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Report dismissed', 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to dismiss report', 'error');
        }
    } catch (error) {
        console.error('Error dismissing report:', error);
        showToast('Failed to dismiss report', 'error');
    }
}

async function assignReportToMe(reportId) {
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}/assign`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ assignTo: currentUser._id })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Report assigned to you', 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to assign report', 'error');
        }
    } catch (error) {
        console.error('Error assigning report:', error);
        showToast('Failed to assign report', 'error');
    }
}

// ===== USER MANAGEMENT FUNCTIONS =====
async function showUsersManagement() {
    try {
        const response = await fetch(`${API_BASE}/users?limit=50`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showUsersModal(data.users, data.pagination, data.stats);
        
    } catch (error) {
        console.error('Error fetching users:', error);
        showToast('Could not load users', 'warning');
    }
}

function showUsersModal(users, pagination, stats) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0;">User Management (${pagination.totalUsers} users)</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Total Users</div>
                    <div style="font-size:24px; font-weight:500;">${pagination.totalUsers}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Active</div>
                    <div style="font-size:24px; font-weight:500; color:#16a34a;">${stats?.active || 0}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Banned</div>
                    <div style="font-size:24px; font-weight:500; color:#dc2626;">${stats?.banned || 0}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Suspended</div>
                    <div style="font-size:24px; font-weight:500; color:#eab308;">${stats?.suspended || 0}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 16px;">
                <input type="text" id="userSearchInput" placeholder="Search by name or email..." 
                    style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(232,213,196,0.2); border-radius: 6px; color: #e8d5c4;">
            </div>
            
            <div style="overflow-x: auto; max-height: 500px; overflow-y: auto;">
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid rgba(232,213,196,0.1);">
                            <th style="text-align:left; padding:12px;">Name</th>
                            <th style="text-align:left; padding:12px;">Email</th>
                            <th style="text-align:left; padding:12px;">Status</th>
                            <th style="text-align:left; padding:12px;">Role</th>
                            <th style="text-align:left; padding:12px;">Joined</th>
                            <th style="text-align:left; padding:12px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr style="border-bottom: 1px solid rgba(232,213,196,0.05);" data-user-id="${user._id}">
                                <td style="padding:12px;">${user.name || 'Unknown'}</td>
                                <td style="padding:12px;">${user.email}</td>
                                <td style="padding:12px;">
                                    ${user.isBanned ? '<span style="color:#dc2626;">Banned</span>' : 
                                      user.isSuspended ? '<span style="color:#eab308;">Suspended</span>' : 
                                      '<span style="color:#16a34a;">Active</span>'}
                                </td>
                                <td style="padding:12px;">${user.isAdmin ? 'Admin' : 'User'}</td>
                                <td style="padding:12px;">${new Date(user.createdAt).toLocaleDateString()}</td>
                                <td style="padding:12px;">
                                    <button class="action-btn view-user" data-user-id="${user._id}" style="padding:4px 8px; font-size:12px;">View</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div>Page ${pagination.currentPage} of ${pagination.totalPages}</div>
                <div style="display: flex; gap: 8px;">
                    ${pagination.currentPage > 1 ? `<button class="action-btn" data-page="${pagination.currentPage - 1}" style="padding:4px 12px;">Previous</button>` : ''}
                    ${pagination.currentPage < pagination.totalPages ? `<button class="action-btn" data-page="${pagination.currentPage + 1}" style="padding:4px 12px;">Next</button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    const searchInput = modal.querySelector('#userSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = modal.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const name = row.querySelector('td:first-child')?.textContent.toLowerCase() || '';
                const email = row.querySelector('td:nth-child(2)')?.textContent.toLowerCase() || '';
                const matches = name.includes(searchTerm) || email.includes(searchTerm);
                row.style.display = matches ? '' : 'none';
            });
        });
    }
    
    modal.querySelectorAll('[data-page]').forEach(btn => {
        btn.onclick = () => {
            modal.remove();
            loadUsersPage(parseInt(btn.dataset.page));
        };
    });
    
    modal.querySelectorAll('.view-user').forEach(btn => {
        btn.onclick = () => {
            const userId = btn.dataset.userId;
            modal.remove();
            openUserDetails(userId);
        };
    });
}

async function loadUsersPage(page) {
    try {
        const response = await fetch(`${API_BASE}/users?page=${page}&limit=50`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showUsersModal(data.users, data.pagination, data.stats);
        
    } catch (error) {
        console.error('Error loading users page:', error);
        showToast('Could not load users', 'warning');
    }
}

async function openUserDetails(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showUserModal(data.user, data.recentReports, data.summary);
        
    } catch (error) {
        console.error('Error fetching user:', error);
        showToast('Could not load user details', 'warning');
    }
}

function showUserModal(user, recentReports = [], summary = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">User Profile</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div style="display: flex; gap: 20px; margin-bottom: 24px;">
                <div style="width: 80px; height: 80px; background: rgba(212,165,116,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px;">
                    ${user.profilePicture || '👤'}
                </div>
                <div>
                    <h3 style="margin: 0 0 8px 0;">${user.name}</h3>
                    <div style="color: #a78c6d;">${user.email}</div>
                    <div style="margin-top: 8px;">
                        ${user.isBanned ? '<span style="background:#dc2626; padding:2px 8px; border-radius:4px; font-size:12px;">Banned</span>' : 
                          user.isSuspended ? '<span style="background:#eab308; padding:2px 8px; border-radius:4px; font-size:12px;">Suspended</span>' : 
                          '<span style="background:#16a34a; padding:2px 8px; border-radius:4px; font-size:12px;">Active</span>'}
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div>
                    <h4>Statistics</h4>
                    <div>Reports Made: ${summary.totalReportsMade || 0}</div>
                    <div>Reports Against: ${summary.totalReportsAgainst || 0}</div>
                    <div>Joined: ${new Date(user.createdAt).toLocaleDateString()}</div>
                    <div>Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</div>
                </div>
                <div>
                    <h4>Actions</h4>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${!user.isBanned && !user.isSuspended ? `
                            <button class="action-btn warn-user" data-user-id="${user._id}" style="background:#eab308;">Warn</button>
                            <button class="action-btn suspend-user" data-user-id="${user._id}" style="background:#f97316;">Suspend</button>
                            <button class="action-btn ban-user" data-user-id="${user._id}" style="background:#dc2626;">Ban</button>
                        ` : `
                            <button class="action-btn unban-user" data-user-id="${user._id}" style="background:#16a34a;">Restore</button>
                        `}
                    </div>
                </div>
            </div>
            
            ${recentReports && recentReports.length > 0 ? `
                <div>
                    <h4>Recent Reports</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${recentReports.map(report => `
                            <div style="padding: 8px; border-bottom: 1px solid rgba(232,213,196,0.1);">
                                <div>${report.reason || report.category}</div>
                                <div style="font-size: 12px; color: #a78c6d;">${new Date(report.createdAt).toLocaleDateString()}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelectorAll('.warn-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.userId;
            modal.remove();
            await warnUser(userId);
        };
    });
    
    modal.querySelectorAll('.suspend-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.userId;
            modal.remove();
            await suspendUser(userId);
        };
    });
    
    modal.querySelectorAll('.ban-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.userId;
            modal.remove();
            await banUser(userId);
        };
    });
    
    modal.querySelectorAll('.unban-user').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.userId;
            modal.remove();
            await unbanUser(userId);
        };
    });
}

// ===== USER ACTION FUNCTIONS =====
async function warnUser(userId) {
    const reason = prompt('Enter warning reason:', 'Violation of community guidelines');
    if (!reason) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/warn`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`Warning sent to user`, 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to warn user', 'error');
        }
    } catch (error) {
        console.error('Error warning user:', error);
        showToast('Failed to warn user', 'error');
    }
}

async function suspendUser(userId) {
    const duration = prompt('Enter suspension duration in days (default: 7):', '7');
    if (!duration) return;
    
    const reason = prompt('Enter suspension reason:', 'Violation of community guidelines');
    if (!reason) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/suspend`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason, durationDays: parseInt(duration) })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`User suspended for ${duration} days`, 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to suspend user', 'error');
        }
    } catch (error) {
        console.error('Error suspending user:', error);
        showToast('Failed to suspend user', 'error');
    }
}

async function banUser(userId) {
    const reason = prompt('Enter ban reason:', 'Violation of terms of service');
    if (!reason) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/ban`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`User banned`, 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to ban user', 'error');
        }
    } catch (error) {
        console.error('Error banning user:', error);
        showToast('Failed to ban user', 'error');
    }
}

async function unbanUser(userId) {
    if (!confirm('Are you sure you want to unban this user?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/unban`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`User unbanned`, 'success');
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to unban user', 'error');
        }
    } catch (error) {
        console.error('Error unbanning user:', error);
        showToast('Failed to unban user', 'error');
    }
}

// ===== FILTER WORDS MANAGEMENT =====
async function openFilterWordsManager() {
    try {
        const response = await fetch(`${API_BASE}/filter-words`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showFilterWordsModal(data.filterWords, data.stats);
        
    } catch (error) {
        console.error('Error fetching filter words:', error);
        showToast('Could not load filter words', 'warning');
    }
}

function showFilterWordsModal(filterWords, stats) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0;">Filter Words Management</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Total Words</div>
                    <div style="font-size:32px; font-weight:500;">${stats?.total || 0}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Active Words</div>
                    <div style="font-size:32px; font-weight:500; color:#16a34a;">${stats?.active || 0}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="newWord" placeholder="Enter new filter word..." 
                        style="flex:1; background: rgba(0,0,0,0.3); border: 1px solid rgba(232,213,196,0.2); border-radius: 6px; padding: 12px; color: #e8d5c4;">
                    <select id="wordCategory" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(232,213,196,0.2); border-radius: 6px; padding: 12px; color: #e8d5c4;">
                        <option value="profanity">Profanity</option>
                        <option value="hate_speech">Hate Speech</option>
                        <option value="harassment">Harassment</option>
                        <option value="spam">Spam</option>
                        <option value="sexual">Sexual</option>
                        <option value="violent">Violent</option>
                    </select>
                    <select id="wordSeverity" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(232,213,196,0.2); border-radius: 6px; padding: 12px; color: #e8d5c4;">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                    <button id="addWordBtn" class="action-btn" style="background: #16a34a;">Add Word</button>
                </div>
            </div>
            
            <div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid rgba(232,213,196,0.1);">
                            <th style="text-align:left; padding:12px;">Word</th>
                            <th style="text-align:left; padding:12px;">Category</th>
                            <th style="text-align:left; padding:12px;">Severity</th>
                            <th style="text-align:left; padding:12px;">Status</th>
                            <th style="text-align:left; padding:12px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filterWords.map(word => `
                            <tr data-word-id="${word._id}">
                                <td style="padding:12px;">${word.word}</td>
                                <td style="padding:12px;">${word.category}</td>
                                <td style="padding:12px;">${word.severity}</td>
                                <td style="padding:12px;">
                                    <span style="color: ${word.isActive ? '#16a34a' : '#a78c6d'};">${word.isActive ? 'Active' : 'Inactive'}</span>
                                </td>
                                <td style="padding:12px;">
                                    <button class="action-btn toggle-word" data-word-id="${word._id}" style="padding:4px 8px; font-size:12px; background: ${word.isActive ? '#dc2626' : '#16a34a'};">${word.isActive ? 'Deactivate' : 'Activate'}</button>
                                    <button class="action-btn delete-word" data-word-id="${word._id}" style="padding:4px 8px; font-size:12px; background:#dc2626;">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelector('#addWordBtn').onclick = async () => {
        const word = modal.querySelector('#newWord').value.trim();
        const category = modal.querySelector('#wordCategory').value;
        const severity = modal.querySelector('#wordSeverity').value;
        
        if (!word) {
            showToast('Please enter a word', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/filter-words`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ word, category, severity, action: 'flag' })
            });
            
            const data = await response.json();
            if (data.success) {
                showToast('Filter word added', 'success');
                modal.remove();
                openFilterWordsManager();
            } else {
                showToast(data.message || 'Failed to add word', 'error');
            }
        } catch (error) {
            console.error('Error adding word:', error);
            showToast('Failed to add word', 'error');
        }
    };
    
    modal.querySelectorAll('.toggle-word').forEach(btn => {
        btn.onclick = async () => {
            const wordId = btn.dataset.wordId;
            try {
                const response = await fetch(`${API_BASE}/filter-words/${wordId}/toggle`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                
                const data = await response.json();
                if (data.success) {
                    showToast(`Word ${data.filterWord.isActive ? 'activated' : 'deactivated'}`, 'success');
                    modal.remove();
                    openFilterWordsManager();
                }
            } catch (error) {
                console.error('Error toggling word:', error);
                showToast('Failed to toggle word', 'error');
            }
        };
    });
    
    modal.querySelectorAll('.delete-word').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('Delete this filter word?')) return;
            const wordId = btn.dataset.wordId;
            try {
                const response = await fetch(`${API_BASE}/filter-words/${wordId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                
                const data = await response.json();
                if (data.success) {
                    showToast('Word deleted', 'success');
                    modal.remove();
                    openFilterWordsManager();
                }
            } catch (error) {
                console.error('Error deleting word:', error);
                showToast('Failed to delete word', 'error');
            }
        };
    });
}

// ===== OPEN REPORTS MANAGEMENT =====
async function openReportsManagement() {
    try {
        const response = await fetch(`${API_BASE}/reports?limit=50`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showReportsModal(data.reports, data.pagination, data.stats);
        
    } catch (error) {
        console.error('Error fetching reports:', error);
        showToast('Could not load reports', 'warning');
    }
}

function showReportsModal(reports, pagination, stats) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0;">Reports Management (${pagination.totalReports} reports)</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Pending</div>
                    <div style="font-size:24px; font-weight:500; color:#eab308;">${stats?.pending || 0}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Resolved</div>
                    <div style="font-size:24px; font-weight:500; color:#16a34a;">${stats?.resolved || 0}</div>
                </div>
                <div style="flex:1; background: rgba(232,213,196,0.05); padding: 16px; border-radius: 8px;">
                    <div style="font-size:12px; color:#a78c6d;">Dismissed</div>
                    <div style="font-size:24px; font-weight:500;">${stats?.dismissed || 0}</div>
                </div>
            </div>
            
            <div style="overflow-x: auto; max-height: 500px; overflow-y: auto;">
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid rgba(232,213,196,0.1);">
                            <th style="text-align:left; padding:12px;">Reporter</th>
                            <th style="text-align:left; padding:12px;">Reported</th>
                            <th style="text-align:left; padding:12px;">Reason</th>
                            <th style="text-align:left; padding:12px;">Status</th>
                            <th style="text-align:left; padding:12px;">Created</th>
                            <th style="text-align:left; padding:12px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reports.map(report => `
                            <tr data-report-id="${report._id}">
                                <td style="padding:12px;">${report.reporter?.name || 'Unknown'}</td>
                                <td style="padding:12px;">${report.reportedUser?.name || 'Unknown'}</td>
                                <td style="padding:12px;">${(report.reason || report.category || '').substring(0, 50)}</td>
                                <td style="padding:12px;">
                                    <span class="badge ${report.status === 'pending' ? 'badge-pending' : report.status === 'resolved' ? 'badge-reviewed' : 'badge-warning'}">${report.status}</span>
                                </td>
                                <td style="padding:12px;">${new Date(report.createdAt).toLocaleDateString()}</td>
                                <td style="padding:12px;">
                                    <button class="action-btn view-report" data-report-id="${report._id}" style="padding:4px 8px; font-size:12px;">View</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 16px; display: flex; justify-content: space-between;">
                <div>Page ${pagination.currentPage} of ${pagination.totalPages}</div>
                <div style="display: flex; gap: 8px;">
                    ${pagination.currentPage > 1 ? `<button class="action-btn" data-page="${pagination.currentPage - 1}" style="padding:4px 12px;">Previous</button>` : ''}
                    ${pagination.currentPage < pagination.totalPages ? `<button class="action-btn" data-page="${pagination.currentPage + 1}" style="padding:4px 12px;">Next</button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelectorAll('[data-page]').forEach(btn => {
        btn.onclick = () => {
            const page = parseInt(btn.dataset.page);
            modal.remove();
            loadReportsPage(page);
        };
    });
    
    modal.querySelectorAll('.view-report').forEach(btn => {
        btn.onclick = () => {
            const reportId = btn.dataset.reportId;
            modal.remove();
            openReportDetails(reportId);
        };
    });
}

async function loadReportsPage(page) {
    try {
        const response = await fetch(`${API_BASE}/reports?page=${page}&limit=50`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) showReportsModal(data.reports, data.pagination, data.stats);
        
    } catch (error) {
        console.error('Error loading reports page:', error);
        showToast('Could not load reports', 'warning');
    }
}

// ===== ANIMATION FUNCTIONS =====
function initAnimations() {
    setTimeout(initNumberAnimations, 300);
    setTimeout(initProgressBars, 300);
    setTimeout(fadeInCards, 100);
}

function initNumberAnimations() {
    const statValues = document.querySelectorAll('.stat-value, .mod-value, .info-value');
    statValues.forEach((stat, index) => {
        const finalValue = parseInt(stat.textContent.replace(/,/g, '')) || 0;
        if (!isNaN(finalValue)) {
            stat.textContent = '0';
            setTimeout(() => animateValue(stat, 0, finalValue, 1000), 300 + index * 100);
        }
    });
}

function initProgressBars() {
    const progressBars = document.querySelectorAll('.progress-fill');
    progressBars.forEach((bar, index) => {
        const width = bar.getAttribute('data-width') || '0';
        bar.style.width = '0%';
        setTimeout(() => {
            bar.style.width = width + '%';
            bar.style.transition = 'width 1s ease-out';
        }, 1000 + index * 200);
    });
}

function fadeInCards() {
    const cards = document.querySelectorAll('.stat-card, .mod-card, .report-item, .info-card, .engagement-item, .safeguard-alert');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + index * 50);
    });
}

// ===== INTERACTION FUNCTIONS =====
function setupInteractions() {
    setupUserMenu();
    setupActionButtons();
    setupViewAllButton();
    setupNotificationBell();
}

function setupUserMenu() {
    const userMenu = document.querySelector('.user-menu');
    if (userMenu) {
        userMenu.addEventListener('click', function(e) {
            e.stopPropagation();
            
            let dropdown = this.querySelector('.user-dropdown');
            if (dropdown) {
                dropdown.remove();
                return;
            }
            
            dropdown = document.createElement('div');
            dropdown.className = 'user-dropdown';
            dropdown.innerHTML = `
                <a href="../Admin%20Profile/adprofile.html" class="dropdown-item">My Profile</a>
                <a href="../Admin%20Profile/adsettings.html" class="dropdown-item">Settings</a>
                <a href="#" class="dropdown-item" id="logoutBtn">Logout</a>
            `;
            
            dropdown.style.cssText = `
                position: absolute;
                top: 100%;
                right: 0;
                background: #2c1810;
                border: 1px solid rgba(232,213,196,0.1);
                border-radius: 8px;
                padding: 8px;
                min-width: 150px;
                z-index: 1000;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            `;
            
            this.appendChild(dropdown);
            
            document.getElementById('logoutBtn').onclick = (e) => {
                e.preventDefault();
                logout();
            };
            
            document.addEventListener('click', function closeDropdown(e) {
                if (!userMenu.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', closeDropdown);
                }
            });
        });
    }
}

function setupActionButtons() {
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const action = this.getAttribute('data-action') || this.textContent.trim().toLowerCase().replace(/\s/g, '-');
            handleAdminAction(action);
        });
    });
}

function handleAdminAction(action) {
    switch(action) {
        case 'manage-users':
            showUsersManagement();
            break;
        case 'review-reports':
            openReportsManagement();
            break;
        case 'monitor-voice':
            showVoiceMonitoringModal();
            break;
        case 'edit-filters':
            openFilterWordsManager();
            break;
        default:
            console.log('Unknown action:', action);
    }
}

async function showVoiceMonitoringModal() {
    try {
        const response = await fetch(`${API_ROOT}/voice-rooms/rooms/live`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            showVoiceRoomsModal(data.rooms);
        } else {
            showToast('Failed to load live rooms', 'error');
        }
    } catch (error) {
        console.error('Error fetching voice rooms:', error);
        showToast('Could not load voice monitoring data', 'warning');
    }
}

function showVoiceRoomsModal(rooms) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'voiceMonitoringModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0; color: #e8d5c4;">Voice Room Management</h2>
                <button class="close-modal" style="background: none; border: none; color: #a78c6d; font-size: 24px; cursor: pointer;">×</button>
            </div>
            
            <div class="modal-tabs" style="display: flex; gap: 20px; margin-bottom: 24px; border-bottom: 1px solid rgba(232, 213, 196, 0.1);">
                <button class="tab-btn active" data-tab="live" style="background: none; border: none; color: #e8d5c4; padding: 10px 0; cursor: pointer; border-bottom: 2px solid #d4a574; font-weight: 600;">Live Rooms</button>
                <button class="tab-btn" data-tab="history" style="background: none; border: none; color: #a78c6d; padding: 10px 0; cursor: pointer; font-weight: 600;">Room History</button>
            </div>

            <div id="liveTab" class="tab-content">
                <div style="margin-bottom: 24px; padding: 16px; background: rgba(220, 38, 38, 0.1); border-left: 4px solid #dc2626; border-radius: 4px;">
                    <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px;">Admin Note</div>
                    <div style="font-size: 13px; color: rgba(232, 213, 196, 0.8);">Voice rooms are monitored by AI. High-risk rooms are flagged automatically. You can join rooms as a silent listener or end them if they violate terms.</div>
                </div>

                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(232, 213, 196, 0.1); text-align: left;">
                                <th style="padding: 12px;">Room Name</th>
                                <th style="padding: 12px;">Host</th>
                                <th style="padding: 12px;">Participants</th>
                                <th style="padding: 12px;">Started</th>
                                <th style="padding: 12px;">Risk Level</th>
                                <th style="padding: 12px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rooms.length === 0 ? `
                                <tr>
                                    <td colspan="6" style="padding: 40px; text-align: center; color: #a78c6d;">No live voice rooms currently active</td>
                                </tr>
                            ` : rooms.map(room => `
                                <tr style="border-bottom: 1px solid rgba(232, 213, 196, 0.05);">
                                    <td style="padding: 12px;">${room.name}</td>
                                    <td style="padding: 12px;">${room.hostName || 'Unknown'}</td>
                                    <td style="padding: 12px;">${room.participantCount || 0} users</td>
                                    <td style="padding: 12px;">${getTimeAgo(room.createdAt)}</td>
                                    <td style="padding: 12px;">
                                        <span style="color: ${room.riskLevel === 'high' ? '#dc2626' : room.riskLevel === 'medium' ? '#eab308' : '#16a34a'};">
                                            ${(room.riskLevel || 'Low').toUpperCase()}
                                        </span>
                                    </td>
                                    <td style="padding: 12px;">
                                        <button class="action-btn join-room" data-room-id="${room._id}" style="padding: 4px 8px; font-size: 12px;">Listen</button>
                                        <button class="action-btn end-room" data-room-id="${room._id}" style="padding: 4px 8px; font-size: 12px; background: #dc2626; color: white;">End</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="historyTab" class="tab-content" style="display: none;">
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(232, 213, 196, 0.1); text-align: left;">
                                <th style="padding: 12px;">Room Name</th>
                                <th style="padding: 12px;">Host</th>
                                <th style="padding: 12px;">Ended</th>
                                <th style="padding: 12px;">Duration</th>
                                <th style="padding: 12px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="historyTableBody">
                            <tr>
                                <td colspan="5" style="padding: 40px; text-align: center; color: #a78c6d;">Loading history...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close logic
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    // Tab logic
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            modal.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderBottom = 'none';
                b.style.color = '#a78c6d';
            });
            btn.classList.add('active');
            btn.style.borderBottom = '2px solid #d4a574';
            btn.style.color = '#e8d5c4';
            
            const tab = btn.dataset.tab;
            modal.querySelector('#liveTab').style.display = tab === 'live' ? 'block' : 'none';
            modal.querySelector('#historyTab').style.display = tab === 'history' ? 'block' : 'none';
            
            if (tab === 'history') {
                loadHistoryTable();
            }
        };
    });

    // Live actions
    setupLiveRoomActions(modal);
}

async function loadHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    try {
        const response = await fetch(`${API_BASE}/voice-rooms/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        if (data.success) {
            if (data.rooms.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding: 40px; text-align: center; color: #a78c6d;">No history found</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.rooms.map(room => `
                <tr style="border-bottom: 1px solid rgba(232, 213, 196, 0.05);">
                    <td style="padding: 12px;">${room.name}</td>
                    <td style="padding: 12px;">${room.hostName || 'Unknown'}</td>
                    <td style="padding: 12px;">${new Date(room.endedAt).toLocaleString()}</td>
                    <td style="padding: 12px;">${room.duration || 0} mins</td>
                    <td style="padding: 12px;">
                        <button class="action-btn view-room-details" data-room-id="${room._id}" style="padding: 4px 8px; font-size: 12px;">Details</button>
                    </td>
                </tr>
            `).join('');

            // Add details click handlers
            tbody.querySelectorAll('.view-room-details').forEach(btn => {
                btn.onclick = () => {
                    const roomId = btn.dataset.roomId;
                    const room = data.rooms.find(r => r._id === roomId);
                    if (room) {
                        alert(`Room: ${room.name}\nHost: ${room.hostName || 'Unknown'}\nEnded: ${new Date(room.endedAt).toLocaleString()}\nDuration: ${room.duration || 0} mins\nDescription: ${room.description || 'No description'}`);
                    }
                };
            });
        }
    } catch (error) {
        console.error('Error loading history:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 40px; text-align: center; color: #dc2626;">Error loading history</td></tr>';
    }
}

function setupLiveRoomActions(modal) {
    modal.querySelectorAll('.join-room').forEach(btn => {
        btn.onclick = () => {
            showToast('Joining as silent listener...', 'info');
        };
    });
    
    modal.querySelectorAll('.end-room').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('Are you sure you want to forcibly end this voice room?')) {
                const roomId = btn.dataset.roomId;
                try {
                    const response = await fetch(`${API_ROOT}/voice-rooms/rooms/${roomId}/end`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
                    });
                    const data = await response.json();
                    if (data.success) {
                        showToast('Room ended successfully', 'success');
                        modal.remove();
                        showVoiceMonitoringModal();
                    }
                } catch (error) {
                    showToast('Failed to end room', 'error');
                }
            }
        };
    });
}

function setupViewAllButton() {
    const viewAllBtn = document.querySelector('.btn-view-all');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openReportsManagement();
        });
    }
}

function setupNotificationBell() {
    const notificationIcon = document.querySelector('.notification-icon');
    if (notificationIcon) {
        notificationIcon.addEventListener('click', () => {
            toggleNotificationPanel();
        });
    }
}

async function toggleNotificationPanel() {
    let panel = document.querySelector('.notification-panel');
    if (panel) {
        panel.remove();
        return;
    }
    
    try {
        const response = await fetch(`${API_ROOT}/notifications/admin`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderNotificationPanel(data.notifications, data.unreadCount);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        showToast('Could not load notifications', 'warning');
    }
}

function renderNotificationPanel(notifications, unreadCount) {
    const panel = document.createElement('div');
    panel.className = 'notification-panel';
    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid rgba(232,213,196,0.1);">
            <h3 style="margin:0;">Admin Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}</h3>
            <button class="close-panel" style="background: none; border: none; color: #a78c6d; font-size: 20px; cursor: pointer;">×</button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            ${notifications.length === 0 ? `
                <div style="padding: 40px; text-align: center; color: #a78c6d;">No notifications</div>
            ` : notifications.map(n => `
                <div class="notification-item ${!n.read ? 'unread' : ''}" data-id="${n.id}" style="padding: 16px; border-bottom: 1px solid rgba(232,213,196,0.05); cursor: pointer;">
                    <div style="font-weight: 500; margin-bottom: 4px;">${n.title}</div>
                    <div style="font-size: 13px; color: #a78c6d;">${n.message}</div>
                    <div style="font-size: 11px; color: #6b4e3a; margin-top: 8px;">${new Date(n.timestamp).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>
        <div style="padding: 12px; border-top: 1px solid rgba(232,213,196,0.1); text-align: center;">
            <button id="markAllRead" class="action-btn" style="padding: 8px 16px; font-size: 12px;">Mark all as read</button>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.close-panel').onclick = () => panel.remove();
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };
    
    panel.querySelectorAll('.notification-item').forEach(item => {
        item.onclick = async () => {
            const id = item.dataset.id;
            try {
                await fetch(`${API_ROOT}/notifications/read/${id}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                item.classList.remove('unread');
                updateNotificationBadge('-1');
            } catch (error) {
                console.error('Error marking read:', error);
            }
        };
    });
    
    panel.querySelector('#markAllRead').onclick = async () => {
        try {
            await fetch(`${API_ROOT}/notifications/read-all`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            panel.querySelectorAll('.notification-item').forEach(item => {
                item.classList.remove('unread');
            });
            updateNotificationBadge(0);
        } catch (error) {
            console.error('Error marking all read:', error);
        }
    };
}

// ===== REAL-TIME UPDATES =====
function startRealtimeUpdates() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        loadDashboardData();
    }, 30000);
}

// ===== UTILITY FUNCTIONS =====
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
}

function showLoadingState(show) {
    let loader = document.getElementById('dashboard-loader');
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'dashboard-loader';
        loader.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(26, 15, 10, 0.8); backdrop-filter: blur(5px);
            display: flex; justify-content: center; align-items: center;
            z-index: 9999; font-size: 18px; color: #d4a574;
        `;
        loader.innerHTML = '🔄 Loading dashboard data...';
        document.body.appendChild(loader);
    } else if (!show && loader) {
        loader.remove();
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    const bgColor = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : type === 'warning' ? '#eab308' : '#2c1810';
    const borderColor = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : type === 'warning' ? '#eab308' : '#d4a574';
    
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${bgColor}; color: #f5e6d3; padding: 12px 20px;
        border-radius: 8px; border-left: 4px solid ${borderColor};
        z-index: 10000; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease-out; font-size: 14px;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        sessionStorage.removeItem('litlink_token');
        sessionStorage.removeItem('litlink_user');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('user');
        
        if (socket) {
            socket.disconnect();
        }
        if (refreshInterval) clearInterval(refreshInterval);
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 1000);
    }
}

// Add CSS animations
if (!document.querySelector('#admin-animations')) {
    const style = document.createElement('style');
    style.id = 'admin-animations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes badgePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
        }
        .notification-panel {
            position: fixed; top: 70px; right: 20px; width: 380px;
            background: #2c1810; border: 1px solid rgba(232,213,196,0.1);
            border-radius: 12px; z-index: 9999; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            animation: slideInRight 0.3s ease-out;
        }
        .notification-item.unread {
            background: rgba(212,165,116,0.05);
        }
        .notification-item:hover {
            background: rgba(232,213,196,0.05);
        }
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(5px);
            display: flex; justify-content: center; align-items: center;
            z-index: 10000; animation: fadeIn 0.3s ease-out;
        }
        .modal-content {
            background: #2c1810; border: 1px solid rgba(232,213,196,0.1);
            border-radius: 12px; padding: 24px; max-width: 800px;
            width: 90%; max-height: 80vh; overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .action-btn {
            background: rgba(212,165,116,0.1); color: #d4a574;
            border: 1px solid rgba(212,165,116,0.2); border-radius: 6px;
            padding: 8px 16px; cursor: pointer; transition: all 0.3s ease;
        }
        .action-btn:hover {
            background: rgba(212,165,116,0.2); transform: translateY(-2px);
        }
        .badge-pending { background: #eab308; color: #1a0f0a; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
        .badge-reviewed { background: #16a34a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
        .badge-warning { background: #f97316; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
        .user-dropdown .dropdown-item {
            display: block; padding: 10px 12px; color: #e8d5c4;
            text-decoration: none; border-radius: 6px; transition: background 0.2s;
        }
        .user-dropdown .dropdown-item:hover {
            background: rgba(212,165,116,0.1);
        }
        .status-indicator {
            width: 8px; height: 8px; border-radius: 50%; background-color: #eab308;
            margin-right: 8px; display: inline-block;
        }
    `;
    document.head.appendChild(style);
}