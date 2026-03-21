document.addEventListener('DOMContentLoaded', function() {
    console.log('%c Litlink Admin Dashboard v2.4.0', 
        'font-size: 16px; font-weight: bold; color: #d97706; background: #1a0f0a; padding: 8px 12px; border-radius: 4px;');
    
    checkAuthAndInitialize();
});

// Global variables
let API_BASE = 'http://localhost:5002/api/admin';
let API_ROOT = 'http://localhost:5002/api';
let authToken = null;
let currentUser = null;
let refreshInterval = null;
let wsConnection = null;

async function checkAuthAndInitialize() {
    authToken = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('user');
    
    if (authToken) window.authToken = authToken;
    
    try {
        currentUser = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        currentUser = null;
    }
    
    console.log('🔐 Checking authentication...', { 
        hasToken: !!authToken, 
        isAdmin: currentUser?.isAdmin 
    });
    
    if (!authToken || !currentUser?.isAdmin) {
        console.log('❌ Not authenticated as admin, redirecting...');
        showToast('Admin access required. Please login as administrator.', 'warning');
        setTimeout(() => {
            window.location.href = '../login.html';
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
        initDashboard();
        
    } catch (error) {
        console.error('❌ Admin authentication failed:', error);
        showLoadingState(false);
        showToast(error.message || 'Admin authentication failed', 'error');
        localStorage.clear();
        setTimeout(() => {
            window.location.href = '../login.html';
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

function initDashboard() {
    initAnimations();
    setupInteractions();
    startRealtimeUpdates();
    initWebSocket();
    loadDashboardData();
}

// ===== DATA LOADING =====
const DASHBOARD_CACHE_KEY = 'litlink_admin_dashboard_cache';
const CACHE_MAX_AGE = 60000; // 1 minute

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
    
    const cached = getCachedDashboardData();
    if (cached?.success) {
        updateStats(cached.stats || {});
        updateRecentReports(cached.recentReports || []);
        showLoadingState(false);
    }
    
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
            cacheDashboardData(data);
        }
        
        showLoadingState(false);
        
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        showLoadingState(false);
        
        if (!cached?.success) {
            showEmptyStatsState();
        }
        showToast('Could not load latest data. Using cached data.', 'warning');
    }
}

// ===== UI UPDATE FUNCTIONS =====
function updateStats(stats) {
    console.log('📊 Updating stats:', stats);
    
    // Update stat cards
    updateStatValue('.stat-card:nth-child(1) .stat-value', stats.totalUsers);
    updateStatValue('.stat-card:nth-child(2) .stat-value', stats.activeToday);
    updateStatValue('.stat-card:nth-child(3) .stat-value', stats.activeMatches || 156);
    updateStatValue('.stat-card:nth-child(4) .stat-value', stats.liveRooms || 24);
    
    // Update moderation stats
    updateStatValue('.mod-card.mod-warning .mod-value', stats.newReports);
    updateStatValue('.mod-card.mod-pending .mod-value', stats.pendingReports);
    updateStatValue('.mod-card.mod-resolved .mod-value', stats.resolvedReports);
    
    // Update user stats
    updateStatValue('.info-card:nth-child(1) .info-row:nth-child(1) .info-value', stats.joinedToday);
    updateStatValue('.info-card:nth-child(1) .info-row:nth-child(2) .info-value', stats.joinedWeek);
    updateStatValue('.info-card:nth-child(2) .info-row:nth-child(1) .info-value', stats.bannedUsers);
    updateStatValue('.info-card:nth-child(2) .info-row:nth-child(2) .info-value', stats.suspendedUsers);
}

function updateStatValue(selector, value) {
    const element = document.querySelector(selector);
    if (element && value !== undefined) {
        const current = parseInt(element.textContent.replace(/,/g, '')) || 0;
        animateValue(element, current, value, 800);
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
                <div class="report-desc">${report.reason || report.category || 'No description'}</div>
            </div>
            <span class="badge ${report.status === 'pending' ? 'badge-pending' : 'badge-reviewed'}">
                ${report.status === 'pending' ? 'Pending' : 'Reviewed'}
            </span>
            <svg class="chevron-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.5"/>
            </svg>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', () => {
            const reportId = item.dataset.reportId;
            if (reportId) openReportDetails(reportId);
        });
    });
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
        default: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>`
    };
    return icons[type] || icons.default;
}

function getReportTypeText(type) {
    const types = { user: 'Profile', post: 'Post', chat: 'Chat' };
    return types[type] || type;
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
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Reason</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">${report.reason}</div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #a78c6d;">Description</div>
                    <div style="background: rgba(232, 213, 196, 0.05); padding: 12px; border-radius: 6px;">${report.description || 'No description'}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="action-btn" data-action="resolve" data-report-id="${report._id}" style="background: #16a34a;">Resolve</button>
                <button class="action-btn" data-action="dismiss" data-report-id="${report._id}" style="background: #dc2626;">Dismiss</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelector('[data-action="resolve"]').onclick = () => {
        resolveReport(report._id);
        modal.remove();
    };
    
    modal.querySelector('[data-action="dismiss"]').onclick = () => {
        dismissReport(report._id);
        modal.remove();
    };
}

function getPriorityColor(priority) {
    const colors = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
    return colors[priority] || '#a78c6d';
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
            </div>
            
            <div style="overflow-x: auto;">
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
                            <tr style="border-bottom: 1px solid rgba(232,213,196,0.05);">
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
                                    <button class="action-btn" data-action="view-user" data-user-id="${user._id}" style="padding:4px 8px; font-size:12px;">View</button>
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
    
    modal.querySelectorAll('[data-action="view-user"]').forEach(btn => {
        btn.onclick = () => {
            modal.remove();
            openUserDetails(btn.dataset.userId);
        };
    });
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
                </div>
                <div>
                    <h4>Actions</h4>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${!user.isBanned && !user.isSuspended ? `
                            <button class="action-btn" data-action="warn" data-user-id="${user._id}" style="background:#eab308;">Warn</button>
                            <button class="action-btn" data-action="suspend" data-user-id="${user._id}" style="background:#f97316;">Suspend</button>
                            <button class="action-btn" data-action="ban" data-user-id="${user._id}" style="background:#dc2626;">Ban</button>
                        ` : `
                            <button class="action-btn" data-action="unban" data-user-id="${user._id}" style="background:#16a34a;">Restore</button>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelectorAll('.action-btn').forEach(btn => {
        btn.onclick = async () => {
            const action = btn.dataset.action;
            const userId = btn.dataset.userId;
            modal.remove();
            
            switch(action) {
                case 'warn': await warnUser(userId); break;
                case 'suspend': await suspendUser(userId); break;
                case 'ban': await banUser(userId); break;
                case 'unban': await unbanUser(userId); break;
            }
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
                    <input type="text" id="newWord" placeholder="Enter new filter word..." style="flex:1; background: rgba(0,0,0,0.3); border: 1px solid rgba(232,213,196,0.2); border-radius: 6px; padding: 12px; color: #e8d5c4;">
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
    
    // Add word
    modal.querySelector('#addWordBtn').onclick = async () => {
        const word = modal.querySelector('#newWord').value.trim();
        if (!word) return;
        
        try {
            const response = await fetch(`${API_BASE}/filter-words`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ word, category: 'profanity', severity: 'medium', action: 'flag' })
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
    
    // Toggle/Delete words
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

// ===== WEB SOCKET REAL-TIME =====
function initWebSocket() {
    const wsUrl = `ws://localhost:5002?token=${authToken}`;
    
    try {
        wsConnection = new WebSocket(wsUrl);
        
        wsConnection.onopen = () => {
            console.log('✅ WebSocket connected');
        };
        
        wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        wsConnection.onclose = () => {
            console.log('WebSocket disconnected, reconnecting in 5s...');
            setTimeout(initWebSocket, 5000);
        };
        
    } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setTimeout(initWebSocket, 5000);
    }
}

function handleWebSocketMessage(data) {
    if (data.type === 'admin-notification') {
        updateNotificationBadge('+1');
        showNotificationToast(data);
        loadDashboardData();
    } else if (data.type === 'notification-count') {
        updateNotificationBadge(data.unreadCount);
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
    } else {
        badge.style.display = 'none';
    }
}

function showNotificationToast(notification) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:20px;">${getNotificationIcon(notification.notificationType)}</div>
            <div style="flex:1;">
                <div style="font-weight:600;">${notification.title || 'Admin Notification'}</div>
                <div style="font-size:12px; color:#a78c6d;">${notification.message}</div>
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
        admin_system_alert: '🔧'
    };
    return icons[type] || '🔔';
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
            setTimeout(() => animateValue(stat, 0, finalValue, 1500), 300 + index * 200);
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
        }, 1500 + index * 300);
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
                <a href="../Admin%20Settings/adsettings.html" class="dropdown-item">Settings</a>
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
            showToast('Voice room monitoring coming soon', 'info');
            break;
        case 'edit-filters':
            openFilterWordsManager();
            break;
    }
}

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
                                <td style="padding:12px;">${report.reporter?.name || 'Unknown'} </td>
                                <td style="padding:12px;">${report.reportedUser?.name || 'Unknown'} </td>
                                <td style="padding:12px;">${report.reason?.substring(0, 50) || ''} </td>
                                <td style="padding:12px;">
                                    <span class="badge ${report.status === 'pending' ? 'badge-pending' : 'badge-reviewed'}">${report.status}</span>
                                 </td>
                                <td style="padding:12px;">${new Date(report.createdAt).toLocaleDateString()} </td>
                                <td style="padding:12px;">
                                    <button class="action-btn view-report" data-report-id="${report._id}" style="padding:4px 8px; font-size:12px;">View</button>
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
    
    modal.querySelectorAll('.view-report').forEach(btn => {
        btn.onclick = () => {
            const reportId = btn.dataset.reportId;
            modal.remove();
            openReportDetails(reportId);
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
            <h3 style="margin:0;">Admin Notifications</h3>
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
        if (wsConnection) wsConnection.close();
        if (refreshInterval) clearInterval(refreshInterval);
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = '../Homepage/index.html';
        }, 1000);
    }
}

// Add CSS animations if not present
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
        .user-dropdown .dropdown-item {
            display: block; padding: 10px 12px; color: #e8d5c4;
            text-decoration: none; border-radius: 6px; transition: background 0.2s;
        }
        .user-dropdown .dropdown-item:hover {
            background: rgba(212,165,116,0.1);
        }
    `;
    document.head.appendChild(style);
}