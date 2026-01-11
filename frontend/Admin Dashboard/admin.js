// Litlink Admin Dashboard JavaScript - Real-time Version with Real Data Only
document.addEventListener('DOMContentLoaded', function() {
    console.log('%c Litlink Admin Dashboard v2.4.0 (Real-time)', 
        'font-size: 16px; font-weight: bold; color: #d97706; background: #1a0f0a; padding: 8px 12px; border-radius: 4px;');
    
    // Check authentication and initialize
    checkAuthAndInitialize();
});

// Global variables
let API_BASE = 'http://localhost:5002/api/admin';
let authToken = null;
let currentUser = null;

async function checkAuthAndInitialize() {
    // Get auth data
    authToken = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    currentUser = user;
    
    console.log('🔐 Checking authentication...', { 
        hasToken: !!authToken, 
        isAdmin: user.isAdmin,
        user: user 
    });
    
    // Redirect if not admin
    if (!authToken || user.isAdmin !== true) {
        console.log('❌ Not authenticated as admin, redirecting...');
        showToast('Admin access required. Please login as administrator.', 'warning');
        
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 1500);
        return;
    }
    
    // Verify admin status with API
    try {
        const response = await fetch(`${API_BASE}/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Invalid admin credentials');
        }
        
        const data = await response.json();
        
        if (!data.success || !data.user.isAdmin) {
            throw new Error('User is not an administrator');
        }
        
        console.log('✅ Admin authenticated:', data.user.name);
        currentUser = data.user;
        
        // Update UI with admin info
        updateAdminUI(data.user);
        
        // Initialize dashboard with real data
        initDashboard();
        
    } catch (error) {
        console.error('❌ Admin authentication failed:', error);
        localStorage.clear();
        
        showToast('Admin authentication failed. Please login again.', 'warning');
        
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 2000);
    }
}

function updateAdminUI(user) {
    // Update admin name in header
    const adminName = document.querySelector('.user-name');
    const adminAvatar = document.querySelector('.user-avatar');
    const adminLabel = document.querySelector('.admin-label');
    
    if (adminName && user.name) {
        adminName.textContent = user.name;
    }
    
    if (adminAvatar && user.name) {
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase() || 'A';
        adminAvatar.textContent = initials;
        
        // Add avatar hover effect
        adminAvatar.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) rotate(5deg)';
            this.style.transition = 'all 0.3s ease';
        });
        
        adminAvatar.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    }
    
    if (adminLabel && user.adminLevel) {
        adminLabel.textContent = `${user.adminLevel.replace('_', ' ').toUpperCase()} Panel`;
    }
}

function initDashboard() {
    // Initialize animations and interactions
    initAnimations();
    setupInteractions();
    
    // Start real-time updates
    startRealtimeUpdates();
    
    // Load initial data
    fetchDashboardStats();
    
    // ===== DATA LOADING FUNCTIONS =====
    async function fetchDashboardStats() {
        try {
            showLoadingState(true);
            
            const response = await fetch(`${API_BASE}/dashboard/stats`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch stats');
            }
            
            const data = await response.json();
            
            if (data.success) {
                updateStats(data.stats);
                updateRecentReports(data.recentReports || []);
                updateRecentActivity(data.recentActivity || []);
            } else {
                showToast('Failed to load dashboard data', 'warning');
            }
            
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            showToast('Could not connect to server. Please try again.', 'error');
            // Show empty state instead of mock data
            showEmptyStatsState();
        } finally {
            showLoadingState(false);
        }
    }
    
    // ===== UI UPDATE FUNCTIONS =====
    function updateStats(stats) {
        console.log('📊 Updating dashboard stats with real data:', stats);
        
        // Update total users
        const totalUsers = document.querySelector('.stat-card:nth-child(1) .stat-value');
        if (totalUsers && stats.totalUsers !== undefined) {
            animateValue(totalUsers, parseInt(totalUsers.textContent.replace(/,/g, '')) || 0, stats.totalUsers, 1000);
        }
        
        // Update active users
        const activeUsers = document.querySelector('.stat-card:nth-child(2) .stat-value');
        if (activeUsers && stats.activeToday !== undefined) {
            animateValue(activeUsers, parseInt(activeUsers.textContent.replace(/,/g, '')) || 0, stats.activeToday, 1000);
        }
        
        // Update active matches (placeholder - will be real when implemented)
        const activeMatches = document.querySelector('.stat-card:nth-child(3) .stat-value');
        if (activeMatches && stats.activeMatches !== undefined) {
            animateValue(activeMatches, parseInt(activeMatches.textContent.replace(/,/g, '')) || 0, stats.activeMatches, 1000);
        }
        
        // Update live voice rooms (placeholder - will be real when implemented)
        const liveRooms = document.querySelector('.stat-card:nth-child(4) .stat-value');
        if (liveRooms && stats.liveRooms !== undefined) {
            animateValue(liveRooms, parseInt(liveRooms.textContent.replace(/,/g, '')) || 0, stats.liveRooms, 1000);
        }
        
        // Update moderation stats
        const newReports = document.querySelector('.mod-card.mod-warning .mod-value');
        if (newReports && stats.newReports !== undefined) {
            animateValue(newReports, parseInt(newReports.textContent) || 0, stats.newReports, 800);
        }
        
        const pendingReports = document.querySelector('.mod-card.mod-pending .mod-value');
        if (pendingReports && stats.pendingReports !== undefined) {
            animateValue(pendingReports, parseInt(pendingReports.textContent) || 0, stats.pendingReports, 800);
        }
        
        const resolvedReports = document.querySelector('.mod-card.mod-resolved .mod-value');
        if (resolvedReports && stats.resolvedReports !== undefined) {
            animateValue(resolvedReports, parseInt(resolvedReports.textContent) || 0, stats.resolvedReports, 800);
        }
        
        // Update new users info
        const joinedToday = document.querySelector('.info-card:nth-child(1) .info-row:nth-child(1) .info-value');
        if (joinedToday && stats.joinedToday !== undefined) {
            animateValue(joinedToday, parseInt(joinedToday.textContent) || 0, stats.joinedToday, 800);
        }
        
        const joinedWeek = document.querySelector('.info-card:nth-child(1) .info-row:nth-child(2) .info-value');
        if (joinedWeek && stats.joinedWeek !== undefined) {
            animateValue(joinedWeek, parseInt(joinedWeek.textContent) || 0, stats.joinedWeek, 800);
        }
        
        // Update banned users
        const bannedToday = document.querySelector('.info-card:nth-child(2) .info-row:nth-child(1) .info-value');
        if (bannedToday && stats.bannedUsers !== undefined) {
            animateValue(bannedToday, parseInt(bannedToday.textContent) || 0, stats.bannedUsers, 800);
        }
        
        // Update suspended users
        const suspendedCount = document.querySelector('.info-card:nth-child(2) .info-row:nth-child(2) .info-value');
        if (suspendedCount && stats.suspendedUsers !== undefined) {
            animateValue(suspendedCount, parseInt(suspendedCount.textContent) || 0, stats.suspendedUsers, 800);
        }
        
        // Update timestamp
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        updateTimestamp(`Last updated: ${timestamp}`);
    }
    
    function showEmptyStatsState() {
        // Show zeros or dashes when no data is available
        const statValues = document.querySelectorAll('.stat-value, .mod-value, .info-value');
        statValues.forEach(stat => {
            stat.textContent = '0';
        });
        
        const reportsList = document.querySelector('.reports-list');
        if (reportsList) {
            reportsList.innerHTML = `
                <div class="report-item" style="justify-content: center; opacity: 0.7;">
                    <div class="report-info">
                        <div class="report-type">No data available</div>
                        <div class="report-desc">Could not connect to server</div>
                    </div>
                </div>
            `;
        }
    }
    
    function updateRecentReports(reports) {
        const reportsList = document.querySelector('.reports-list');
        if (!reportsList || !Array.isArray(reports)) return;
        
        // Clear existing reports
        reportsList.innerHTML = '';
        
        // If no reports, show message
        if (reports.length === 0) {
            reportsList.innerHTML = `
                <div class="report-item" style="justify-content: center; opacity: 0.7;">
                    <div class="report-info">
                        <div class="report-type">No recent reports</div>
                    </div>
                </div>
            `;
            return;
        }
        
        // Add each report
        reports.forEach(report => {
            const reportItem = document.createElement('div');
            reportItem.className = 'report-item';
            reportItem.dataset.reportId = report._id;
            
            // Determine icon based on report type
            let iconSvg = '';
            let reportTypeText = '';
            
            switch(report.reportedItemType) {
                case 'user':
                case 'profile':
                    iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M3 18C3 14.134 6.134 11 10 11C13.866 11 17 14.134 17 18" stroke="currentColor" stroke-width="1.5"/>
                    </svg>`;
                    reportTypeText = 'Profile';
                    break;
                case 'post':
                case 'comment':
                    iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M7 8H13M7 11H13M7 14H10" stroke="currentColor" stroke-width="1.5"/>
                    </svg>`;
                    reportTypeText = 'Post';
                    break;
                case 'chat':
                    iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="6" width="16" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M6 9H10M6 12H12" stroke="currentColor" stroke-width="1.5"/>
                    </svg>`;
                    reportTypeText = 'Chat';
                    break;
                default:
                    iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="4" y="4" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M7 8H13M7 11H13M7 14H10" stroke="currentColor" stroke-width="1.5"/>
                    </svg>`;
                    reportTypeText = report.reportedItemType;
            }
            
            // Format time
            const reportTime = new Date(report.createdAt);
            const timeAgo = getTimeAgo(reportTime);
            
            // Determine badge class
            let badgeClass = 'badge-pending';
            let badgeText = 'Pending';
            
            if (report.status === 'resolved') {
                badgeClass = 'badge-reviewed';
                badgeText = 'Reviewed';
            } else if (report.status === 'reviewing') {
                badgeClass = 'badge-warning';
                badgeText = 'Reviewing';
            }
            
            reportItem.innerHTML = `
                <div class="report-icon">
                    ${iconSvg}
                </div>
                <div class="report-info">
                    <div class="report-type">${reportTypeText} <span class="report-time">• ${timeAgo}</span></div>
                    <div class="report-desc">${report.reason || report.category || 'No description'}</div>
                </div>
                <span class="badge ${badgeClass}">${badgeText}</span>
                <svg class="chevron-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.5"/>
                </svg>
            `;
            
            // Add click handler
            reportItem.addEventListener('click', function() {
                const reportId = this.dataset.reportId;
                openReportDetails(reportId);
            });
            
            reportsList.appendChild(reportItem);
        });
    }
    
    function updateRecentActivity(activities) {
        // This would update a recent activity section if you add one
        console.log('Recent activity:', activities);
    }
    
    function updateTimestamp(message) {
        const timestampEl = document.querySelector('.timestamp');
        if (!timestampEl) {
            // Create timestamp element if it doesn't exist
            const header = document.querySelector('.page-header');
            if (header) {
                const timestamp = document.createElement('div');
                timestamp.className = 'timestamp';
                timestamp.style.cssText = 'font-size: 12px; color: #a78c6d; margin-top: 5px;';
                timestamp.textContent = message;
                header.appendChild(timestamp);
            }
        } else {
            timestampEl.textContent = message;
        }
    }
    
    // ===== REPORT FUNCTIONS =====
    async function openReportDetails(reportId) {
        try {
            const response = await fetch(`${API_BASE}/reports/${reportId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch report details');
            }
            
            const data = await response.json();
            
            if (data.success) {
                showReportModal(data.report);
            }
            
        } catch (error) {
            console.error('Error fetching report details:', error);
            showToast('Could not load report details', 'warning');
        }
    }
    
    function showReportModal(report) {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        // Format dates
        const createdAt = new Date(report.createdAt).toLocaleString();
        const resolvedAt = report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : 'Not resolved';
        
        // Get reporter info
        const reporterName = report.reporter ? report.reporter.name : 'Unknown';
        const reporterEmail = report.reporter ? report.reporter.email : 'Unknown';
        
        // Get reported user info
        const reportedUserName = report.reportedUser ? report.reportedUser.name : 'Unknown';
        const reportedUserEmail = report.reportedUser ? report.reportedUser.email : 'Unknown';
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 600px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #e8d5c4;">Report Details</h2>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                        <div>
                            <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Status</div>
                            <span class="badge badge-${report.status === 'pending' ? 'pending' : report.status === 'resolved' ? 'reviewed' : 'warning'}" 
                                  style="display: inline-block;">
                                ${report.status}
                            </span>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Priority</div>
                            <span style="color: ${getPriorityColor(report.priority)}; font-weight: 500;">
                                ${report.priority}
                            </span>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Category</div>
                            <span style="color: #e8d5c4;">${report.category}</span>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Reason</div>
                        <div style="color: #e8d5c4; padding: 12px; background: rgba(232, 213, 196, 0.05); border-radius: 6px;">
                            ${report.reason}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Description</div>
                        <div style="color: #e8d5c4; padding: 12px; background: rgba(232, 213, 196, 0.05); border-radius: 6px;">
                            ${report.description || 'No description provided'}
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <h4 style="color: #d4a574; margin-bottom: 10px;">Reporter</h4>
                        <div style="color: #e8d5c4;">${reporterName}</div>
                        <div style="font-size: 12px; color: #a78c6d;">${reporterEmail}</div>
                    </div>
                    <div>
                        <h4 style="color: #d4a574; margin-bottom: 10px;">Reported User</h4>
                        <div style="color: #e8d5c4;">${reportedUserName}</div>
                        <div style="font-size: 12px; color: #a78c6d;">${reportedUserEmail}</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div>
                        <div style="font-size: 12px; color: #a78c6d;">Created</div>
                        <div style="color: #e8d5c4;">${createdAt}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #a78c6d;">Resolved</div>
                        <div style="color: #e8d5c4;">${resolvedAt}</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="action-btn" data-action="view-user" data-user-id="${report.reportedUser?._id}" 
                            style="padding: 8px 16px; font-size: 14px;">
                        View User
                    </button>
                    <button class="action-btn" data-action="resolve-report" data-report-id="${report._id}"
                            style="padding: 8px 16px; font-size: 14px; background: #16a34a;">
                        Resolve
                    </button>
                    <button class="action-btn" data-action="dismiss-report" data-report-id="${report._id}"
                            style="padding: 8px 16px; font-size: 14px; background: #dc2626;">
                        Dismiss
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add action button handlers
        modal.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const targetId = btn.dataset.userId || btn.dataset.reportId;
                
                switch(action) {
                    case 'view-user':
                        openUserDetails(targetId);
                        document.body.removeChild(modal);
                        break;
                    case 'resolve-report':
                        resolveReport(targetId);
                        document.body.removeChild(modal);
                        break;
                    case 'dismiss-report':
                        dismissReport(targetId);
                        document.body.removeChild(modal);
                        break;
                }
            });
        });
    }
    
    function getPriorityColor(priority) {
        switch(priority) {
            case 'urgent': return '#ef4444';
            case 'high': return '#f97316';
            case 'medium': return '#eab308';
            case 'low': return '#22c55e';
            default: return '#a78c6d';
        }
    }
    
    // ===== USER MANAGEMENT FUNCTIONS =====
    async function openUserDetails(userId) {
        try {
            const response = await fetch(`${API_BASE}/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch user details');
            }
            
            const data = await response.json();
            
            if (data.success) {
                showUserModal(data.user, data.recentReports, data.summary);
            }
            
        } catch (error) {
            console.error('Error fetching user details:', error);
            showToast('Could not load user details', 'warning');
        }
    }
    
    function showUserModal(user, recentReports = [], summary = {}) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        // Format dates
        const createdAt = new Date(user.createdAt).toLocaleDateString();
        const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
        const lastUpdated = new Date(user.updatedAt).toLocaleDateString();
        
        // Determine status badge
        let statusBadge = '';
        if (user.isBanned) {
            statusBadge = '<span class="badge badge-pending" style="background: #dc2626;">Banned</span>';
        } else if (user.isSuspended) {
            statusBadge = '<span class="badge badge-warning" style="background: #eab308;">Suspended</span>';
        } else if (user.isVerified) {
            statusBadge = '<span class="badge badge-reviewed" style="background: #16a34a;">Verified</span>';
        } else {
            statusBadge = '<span class="badge badge-pending">Unverified</span>';
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 800px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <div style="
                            width: 60px;
                            height: 60px;
                            background: rgba(212, 165, 116, 0.1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 24px;
                            color: #d4a574;
                            border: 2px solid rgba(212, 165, 116, 0.2);
                        ">
                            ${user.profilePicture || '👤'}
                        </div>
                        <div>
                            <h2 style="margin: 0 0 4px 0; color: #e8d5c4;">${user.name}</h2>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${statusBadge}
                                ${user.isAdmin ? '<span class="badge" style="background: #7c3aed;">Admin</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                    <div>
                        <h4 style="color: #d4a574; margin-bottom: 12px;">Account Information</h4>
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; color: #a78c6d;">Email</div>
                                <div style="color: #e8d5c4;">${user.email}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; color: #a78c6d;">Username</div>
                                <div style="color: #e8d5c4;">${user.username || 'Not set'}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; color: #a78c6d;">Joined</div>
                                <div style="color: #e8d5c4;">${createdAt}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Last Login</div>
                                <div style="color: #e8d5c4;">${lastLogin}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <h4 style="color: #d4a574; margin-bottom: 12px;">Profile Information</h4>
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; color: #a78c6d;">Bio</div>
                                <div style="color: #e8d5c4;">${user.bio || 'No bio'}</div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="font-size: 12px; color: #a78c6d;">Location</div>
                                <div style="color: #e8d5c4;">${user.location || 'Not specified'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Pronouns</div>
                                <div style="color: #e8d5c4;">${user.pronouns || 'Not specified'}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <h4 style="color: #d4a574; margin-bottom: 12px;">Statistics</h4>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; text-align: center;">
                            <div style="font-size: 12px; color: #a78c6d;">Reports Made</div>
                            <div style="font-size: 24px; color: #e8d5c4; font-weight: 500;">${summary.totalReportsMade || 0}</div>
                        </div>
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; text-align: center;">
                            <div style="font-size: 12px; color: #a78c6d;">Reports Against</div>
                            <div style="font-size: 24px; color: #e8d5c4; font-weight: 500;">${summary.totalReportsAgainst || 0}</div>
                        </div>
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; text-align: center;">
                            <div style="font-size: 12px; color: #a78c6d;">Followers</div>
                            <div style="font-size: 24px; color: #e8d5c4; font-weight: 500;">${summary.followersCount || 0}</div>
                        </div>
                        <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; text-align: center;">
                            <div style="font-size: 12px; color: #a78c6d;">Books Read</div>
                            <div style="font-size: 24px; color: #e8d5c4; font-weight: 500;">${summary.booksReadCount || 0}</div>
                        </div>
                    </div>
                </div>
                
                ${recentReports && recentReports.length > 0 ? `
                <div style="margin-bottom: 24px;">
                    <h4 style="color: #d4a574; margin-bottom: 12px;">Recent Reports</h4>
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; max-height: 200px; overflow-y: auto;">
                        ${recentReports.map(report => `
                            <div style="padding: 12px; border-bottom: 1px solid rgba(232, 213, 196, 0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <div style="color: #e8d5c4; font-weight: 500;">${report.reason}</div>
                                    <span class="badge ${report.status === 'resolved' ? 'badge-reviewed' : 'badge-pending'}" 
                                          style="font-size: 10px; padding: 2px 8px;">
                                        ${report.status}
                                    </span>
                                </div>
                                <div style="font-size: 12px; color: #a78c6d;">
                                    ${new Date(report.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <button class="action-btn" data-action="edit-user" data-user-id="${user._id}"
                            style="padding: 8px 16px; font-size: 14px;">
                        Edit User
                    </button>
                    <button class="action-btn" data-action="view-profile-changes" data-user-id="${user._id}"
                            style="padding: 8px 16px; font-size: 14px;">
                        View Changes
                    </button>
                    ${!user.isBanned ? `
                        <button class="action-btn" data-action="warn-user" data-user-id="${user._id}"
                                style="padding: 8px 16px; font-size: 14px; background: #eab308;">
                            Warn
                        </button>
                        <button class="action-btn" data-action="suspend-user" data-user-id="${user._id}"
                                style="padding: 8px 16px; font-size: 14px; background: #f97316;">
                            Suspend
                        </button>
                        <button class="action-btn" data-action="ban-user" data-user-id="${user._id}"
                                style="padding: 8px 16px; font-size: 14px; background: #dc2626;">
                            Ban
                        </button>
                    ` : `
                        <button class="action-btn" data-action="unban-user" data-user-id="${user._id}"
                                style="padding: 8px 16px; font-size: 14px; background: #16a34a;">
                            Unban
                        </button>
                    `}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add action button handlers
        modal.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const userId = btn.dataset.userId;
                
                switch(action) {
                    case 'edit-user':
                        editUser(userId);
                        break;
                    case 'view-profile-changes':
                        viewProfileChanges(userId);
                        break;
                    case 'warn-user':
                        warnUser(userId);
                        break;
                    case 'suspend-user':
                        suspendUser(userId);
                        break;
                    case 'ban-user':
                        banUser(userId);
                        break;
                    case 'unban-user':
                        unbanUser(userId);
                        break;
                }
                
                document.body.removeChild(modal);
            });
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
                showToast(`Warning sent to user: ${reason}`, 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to warn user', 'warning');
            }
            
        } catch (error) {
            console.error('Error warning user:', error);
            showToast('Failed to warn user', 'warning');
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
                body: JSON.stringify({ 
                    reason,
                    durationDays: parseInt(duration) || 7
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(`User suspended: ${data.message}`, 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to suspend user', 'warning');
            }
            
        } catch (error) {
            console.error('Error suspending user:', error);
            showToast('Failed to suspend user', 'warning');
        }
    }
    
    async function banUser(userId) {
        const reason = prompt('Enter ban reason:', 'Violation of terms of service');
        if (!reason) return;
        
        const duration = prompt('Enter ban duration in days (leave empty for permanent):', '');
        
        try {
            const response = await fetch(`${API_BASE}/users/${userId}/ban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    reason,
                    duration: duration ? parseInt(duration) : undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(`User banned: ${data.message}`, 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to ban user', 'warning');
            }
            
        } catch (error) {
            console.error('Error banning user:', error);
            showToast('Failed to ban user', 'warning');
        }
    }
    
    async function unbanUser(userId) {
        if (!confirm('Are you sure you want to unban this user?')) return;
        
        try {
            const response = await fetch(`${API_BASE}/users/${userId}/unban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(`User unbanned: ${data.message}`, 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to unban user', 'warning');
            }
            
        } catch (error) {
            console.error('Error unbanning user:', error);
            showToast('Failed to unban user', 'warning');
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
                showToast('Report resolved successfully', 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to resolve report', 'warning');
            }
            
        } catch (error) {
            console.error('Error resolving report:', error);
            showToast('Failed to resolve report', 'warning');
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
                showToast('Report dismissed successfully', 'info');
                fetchDashboardStats(); // Refresh stats
            } else {
                showToast(data.message || 'Failed to dismiss report', 'warning');
            }
            
        } catch (error) {
            console.error('Error dismissing report:', error);
            showToast('Failed to dismiss report', 'warning');
        }
    }
    
    function editUser(userId) {
        // Implement edit user modal
        showToast('Edit user functionality coming soon', 'info');
    }
    
    async function viewProfileChanges(userId) {
        try {
            const response = await fetch(`${API_BASE}/users/${userId}/profile-changes`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showProfileChangesModal(data.user, data.profileReports, data.changeCount);
            }
            
        } catch (error) {
            console.error('Error fetching profile changes:', error);
            showToast('Could not load profile changes', 'warning');
        }
    }
    
    function showProfileChangesModal(user, profileReports, changeCount) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 800px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #e8d5c4;">Profile Changes History</h2>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
                        <div style="
                            width: 40px;
                            height: 40px;
                            background: rgba(212, 165, 116, 0.1);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 18px;
                            color: #d4a574;
                        ">
                            ${user.profilePicture || '👤'}
                        </div>
                        <div>
                            <div style="font-size: 18px; color: #e8d5c4; font-weight: 500;">${user.name}</div>
                            <div style="font-size: 14px; color: #a78c6d;">${user.email}</div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 8px;">Current Profile Info</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Username</div>
                                <div style="color: #e8d5c4;">${user.username || 'Not set'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Location</div>
                                <div style="color: #e8d5c4;">${user.location || 'Not specified'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Pronouns</div>
                                <div style="color: #e8d5c4;">${user.pronouns || 'Not specified'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #a78c6d;">Last Updated</div>
                                <div style="color: #e8d5c4;">${new Date(user.lastUpdated).toLocaleString()}</div>
                            </div>
                        </div>
                        <div style="margin-top: 12px;">
                            <div style="font-size: 12px; color: #a78c6d;">Bio</div>
                            <div style="color: #e8d5c4; margin-top: 4px;">${user.bio || 'No bio'}</div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0; color: #d4a574;">Profile Reports (${changeCount})</h4>
                    </div>
                    
                    ${profileReports && profileReports.length > 0 ? `
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto;">
                        ${profileReports.map((report, index) => `
                            <div style="padding: 12px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); ${index === profileReports.length - 1 ? 'border-bottom: none;' : ''}">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                    <div>
                                        <div style="color: #e8d5c4; font-weight: 500; margin-bottom: 4px;">${report.reason}</div>
                                        <div style="font-size: 12px; color: #a78c6d;">Category: ${report.category}</div>
                                    </div>
                                    <span class="badge ${report.status === 'resolved' ? 'badge-reviewed' : 'badge-pending'}" 
                                          style="font-size: 10px; padding: 2px 8px;">
                                        ${report.status}
                                    </span>
                                </div>
                                <div style="font-size: 12px; color: #a78c6d; margin-bottom: 8px;">
                                    Reported on: ${new Date(report.createdAt).toLocaleString()}
                                    ${report.reporter ? ` by ${report.reporter.name}` : ''}
                                </div>
                                <div style="color: #e8d5c4; font-size: 14px;">
                                    ${report.description || 'No description provided'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : `
                    <div style="text-align: center; padding: 40px; color: #a78c6d;">
                        No profile reports found
                    </div>
                    `}
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <button class="action-btn" data-action="close" 
                            style="padding: 8px 16px; font-size: 14px;">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add action button handlers
        modal.querySelector('.action-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
    
    // ===== FILTER WORDS FUNCTIONS =====
    async function openFilterWordsManager() {
        try {
            const response = await fetch(`${API_BASE}/filter-words`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showFilterWordsModal(data.filterWords, data.stats);
            }
            
        } catch (error) {
            console.error('Error fetching filter words:', error);
            showToast('Could not load filter words', 'warning');
        }
    }
    
    function showFilterWordsModal(filterWords, stats) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 1000px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; color: #e8d5c4;">Filter Words Management</h2>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 8px;">Total Words</div>
                        <div style="font-size: 32px; color: #e8d5c4; font-weight: 500;">${stats?.total || 0}</div>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 8px;">Active Words</div>
                        <div style="font-size: 32px; color: #16a34a; font-weight: 500;">${stats?.active || 0}</div>
                    </div>
                    <div style="flex: 2;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 8px;">Categories</div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            ${stats?.byCategory ? Object.entries(stats.byCategory).map(([category, count]) => `
                                <span style="
                                    background: rgba(212, 165, 116, 0.1);
                                    color: #d4a574;
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    font-size: 12px;
                                ">
                                    ${category.replace('_', ' ')}: ${count}
                                </span>
                            `).join('') : ''}
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <input type="text" id="searchFilterWords" placeholder="Search words..." style="
                            flex: 1;
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                        ">
                        <select id="filterCategory" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 150px;
                        ">
                            <option value="all">All Categories</option>
                            <option value="profanity">Profanity</option>
                            <option value="hate_speech">Hate Speech</option>
                            <option value="harassment">Harassment</option>
                            <option value="spam">Spam</option>
                            <option value="sexual">Sexual</option>
                            <option value="violent">Violent</option>
                            <option value="other">Other</option>
                        </select>
                        <button id="addFilterWord" style="
                            background: #16a34a;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            padding: 8px 16px;
                            font-size: 14px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12h14"/>
                            </svg>
                            Add Word
                        </button>
                    </div>
                    
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; overflow: hidden;">
                        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); font-weight: 500; color: #d4a574;">
                            <div>Word</div>
                            <div>Category</div>
                            <div>Severity</div>
                            <div>Action</div>
                            <div>Status</div>
                            <div>Actions</div>
                        </div>
                        <div style="max-height: 400px; overflow-y: auto;">
                            ${filterWords && filterWords.length > 0 ? filterWords.map(word => `
                                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); align-items: center;">
                                    <div style="color: #e8d5c4;">${word.word}</div>
                                    <div>
                                        <span style="
                                            background: rgba(212, 165, 116, 0.1);
                                            color: #d4a574;
                                            padding: 2px 8px;
                                            border-radius: 4px;
                                            font-size: 12px;
                                        ">
                                            ${word.category.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div>
                                        <span style="color: ${getSeverityColor(word.severity)};">
                                            ${word.severity}
                                        </span>
                                    </div>
                                    <div>
                                        <span style="color: #e8d5c4;">
                                            ${word.action.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div>
                                        <span class="${word.isActive ? 'badge-reviewed' : 'badge-pending'}" 
                                              style="font-size: 10px; padding: 2px 8px;">
                                            ${word.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="action-btn" data-action="toggle-word" data-word-id="${word._id}" 
                                                style="padding: 4px 8px; font-size: 12px; background: ${word.isActive ? '#dc2626' : '#16a34a'};">
                                            ${word.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button class="action-btn" data-action="delete-word" data-word-id="${word._id}"
                                                style="padding: 4px 8px; font-size: 12px; background: #dc2626;">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            `).join('') : `
                                <div style="padding: 40px; text-align: center; color: #a78c6d;">
                                    No filter words found
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <div style="border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <h4 style="color: #d4a574; margin-bottom: 12px;">Add Multiple Words</h4>
                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <textarea id="bulkWords" placeholder="Enter words separated by commas or new lines" style="
                            flex: 1;
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-height: 100px;
                            resize: vertical;
                            font-family: monospace;
                        "></textarea>
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <select id="bulkCategory" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 150px;
                        ">
                            <option value="profanity">Profanity</option>
                            <option value="hate_speech">Hate Speech</option>
                            <option value="harassment">Harassment</option>
                            <option value="spam">Spam</option>
                            <option value="sexual">Sexual</option>
                            <option value="violent">Violent</option>
                            <option value="other">Other</option>
                        </select>
                        <select id="bulkSeverity" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 120px;
                        ">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                        <select id="bulkAction" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 150px;
                        ">
                            <option value="warn">Warn</option>
                            <option value="flag" selected>Flag</option>
                            <option value="auto_delete">Auto Delete</option>
                            <option value="require_review">Require Review</option>
                        </select>
                        <button id="importWords" style="
                            background: #d97706;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            padding: 8px 16px;
                            font-size: 14px;
                            cursor: pointer;
                        ">
                            Import Words
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <button class="action-btn" data-action="close" 
                            style="padding: 8px 16px; font-size: 14px;">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add search functionality
        const searchInput = modal.querySelector('#searchFilterWords');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = modal.querySelectorAll('[data-word]');
            
            rows.forEach(row => {
                const word = row.dataset.word.toLowerCase();
                row.style.display = word.includes(searchTerm) ? '' : 'none';
            });
        });
        
        // Add filter functionality
        const categoryFilter = modal.querySelector('#filterCategory');
        categoryFilter.addEventListener('change', (e) => {
            const selectedCategory = e.target.value;
            const rows = modal.querySelectorAll('[data-category]');
            
            rows.forEach(row => {
                const category = row.dataset.category;
                if (selectedCategory === 'all' || category === selectedCategory) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
        
        // Add single word functionality
        modal.querySelector('#addFilterWord').addEventListener('click', () => {
            const word = prompt('Enter the word to filter:');
            if (!word) return;
            
            const category = prompt('Enter category (profanity, hate_speech, harassment, spam, sexual, violent, other):', 'profanity');
            const severity = prompt('Enter severity (low, medium, high, critical):', 'medium');
            const action = prompt('Enter action (warn, flag, auto_delete, require_review):', 'flag');
            
            addFilterWord(word, category, severity, action);
        });
        
        // Add bulk import functionality
        modal.querySelector('#importWords').addEventListener('click', async () => {
            const textarea = modal.querySelector('#bulkWords');
            const wordsText = textarea.value.trim();
            
            if (!wordsText) {
                showToast('Please enter some words', 'warning');
                return;
            }
            
            // Parse words (split by comma or newline)
            const words = wordsText.split(/[\n,]/)
                .map(word => word.trim())
                .filter(word => word.length > 0);
            
            if (words.length === 0) {
                showToast('No valid words found', 'warning');
                return;
            }
            
            const category = modal.querySelector('#bulkCategory').value;
            const severity = modal.querySelector('#bulkSeverity').value;
            const action = modal.querySelector('#bulkAction').value;
            
            try {
                const response = await fetch(`${API_BASE}/filter-words/import`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        words,
                        category,
                        severity,
                        action
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showToast(`Successfully imported ${data.results.added} words`, 'info');
                    textarea.value = '';
                    // Refresh the list
                    openFilterWordsManager();
                    document.body.removeChild(modal);
                } else {
                    showToast(data.message || 'Import failed', 'warning');
                }
                
            } catch (error) {
                console.error('Error importing words:', error);
                showToast('Failed to import words', 'warning');
            }
        });
        
        // Add word action handlers
        modal.querySelectorAll('[data-action="toggle-word"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const wordId = btn.dataset.wordId;
                
                try {
                    const response = await fetch(`${API_BASE}/filter-words/${wordId}/toggle`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showToast(`Word ${data.filterWord.isActive ? 'activated' : 'deactivated'}`, 'info');
                        // Update button text and color
                        btn.textContent = data.filterWord.isActive ? 'Deactivate' : 'Activate';
                        btn.style.background = data.filterWord.isActive ? '#dc2626' : '#16a34a';
                        
                        // Update status badge
                        const statusCell = btn.closest('div').previousElementSibling;
                        const badge = statusCell.querySelector('.badge');
                        badge.textContent = data.filterWord.isActive ? 'Active' : 'Inactive';
                        badge.className = data.filterWord.isActive ? 'badge-reviewed' : 'badge-pending';
                    }
                    
                } catch (error) {
                    console.error('Error toggling word:', error);
                    showToast('Failed to toggle word status', 'warning');
                }
            });
        });
        
        modal.querySelectorAll('[data-action="delete-word"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const wordId = btn.dataset.wordId;
                
                if (!confirm('Are you sure you want to delete this filter word?')) {
                    return;
                }
                
                try {
                    const response = await fetch(`${API_BASE}/filter-words/${wordId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showToast('Filter word deleted', 'info');
                        // Remove the row
                        btn.closest('div').parentElement.remove();
                        
                        // Update stats if needed
                        if (modal.querySelectorAll('[data-word]').length === 0) {
                            // If no words left, show message
                            const container = modal.querySelector('[style*="max-height: 400px"]');
                            container.innerHTML = `
                                <div style="padding: 40px; text-align: center; color: #a78c6d;">
                                    No filter words found
                                </div>
                            `;
                        }
                    }
                    
                } catch (error) {
                    console.error('Error deleting word:', error);
                    showToast('Failed to delete word', 'warning');
                }
            });
        });
        
        // Add close button handler
        modal.querySelector('[data-action="close"]').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
    
    function getSeverityColor(severity) {
        switch(severity) {
            case 'critical': return '#ef4444';
            case 'high': return '#f97316';
            case 'medium': return '#eab308';
            case 'low': return '#22c55e';
            default: return '#a78c6d';
        }
    }
    
    async function addFilterWord(word, category = 'profanity', severity = 'medium', action = 'flag') {
        try {
            const response = await fetch(`${API_BASE}/filter-words`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    word,
                    category,
                    severity,
                    action
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast('Filter word added successfully', 'info');
                // Refresh if filter words modal is open
                if (document.querySelector('.modal-overlay')) {
                    openFilterWordsManager();
                }
            } else {
                showToast(data.message || 'Failed to add filter word', 'warning');
            }
            
        } catch (error) {
            console.error('Error adding filter word:', error);
            showToast('Failed to add filter word', 'warning');
        }
    }
    
    // ===== ANIMATION FUNCTIONS =====
    function initAnimations() {
        // Initialize number animations
        setTimeout(initNumberAnimations, 300);
        setTimeout(initProgressBars, 300);
        setTimeout(fadeInCards, 100);
        
        // Setup animations
        setupNotificationBell();
        setupLiveVoiceAnimation();
        setupStatusIndicator();
    }
    
    function animateValue(element, start, end, duration) {
        if (!element) return;
        
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            element.textContent = value.toLocaleString();
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }
    
    function initNumberAnimations() {
        const statValues = document.querySelectorAll('.stat-value, .mod-value, .info-value');
        statValues.forEach((stat, index) => {
            try {
                const currentText = stat.textContent;
                const finalValue = parseInt(currentText.replace(/,/g, '')) || 0;
                
                if (!isNaN(finalValue)) {
                    stat.textContent = '0';
                    setTimeout(() => {
                        animateValue(stat, 0, finalValue, 1500);
                    }, 300 + index * 200);
                }
            } catch (error) {
                console.error('Error animating value:', error);
            }
        });
    }
    
    function initProgressBars() {
        const progressBars = document.querySelectorAll('.progress-fill');
        progressBars.forEach((bar, index) => {
            try {
                const width = bar.getAttribute('data-width') || '0';
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width + '%';
                    bar.style.transition = 'width 1s ease-out';
                }, 1500 + index * 300);
            } catch (error) {
                console.error('Error animating progress bar:', error);
            }
        });
    }
    
    function fadeInCards() {
        const cards = document.querySelectorAll('.stat-card, .mod-card, .report-item, .info-card, .engagement-item, .safeguard-alert');
        cards.forEach((card, index) => {
            try {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, 100 + index * 50);
            } catch (error) {
                console.error('Error fading in card:', error);
            }
        });
    }
    
    // ===== INTERACTION FUNCTIONS =====
    function setupInteractions() {
        setupUserMenu();
        setupReportItems();
        setupActionButtons();
        setupViewAllButton();
    }
    
    function setupUserMenu() {
        const userMenu = document.querySelector('.user-menu');
        if (userMenu) {
            userMenu.addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('active');
                
                // Create dropdown if it doesn't exist
                if (!this.querySelector('.user-dropdown')) {
                    const dropdown = document.createElement('div');
                    dropdown.className = 'user-dropdown';
                    dropdown.innerHTML = `
                        <a href="../Admin%20Profile/adprofile.html" class="dropdown-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            My Profile
                        </a>
                        <a href="#" class="dropdown-item" id="adminLogoutBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            Logout
                        </a>
                    `;
                    
                    dropdown.style.cssText = `
                        position: absolute;
                        top: 100%;
                        right: 0;
                        background: rgba(44, 24, 16, 0.95);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(232, 213, 196, 0.1);
                        border-radius: 8px;
                        padding: 8px;
                        margin-top: 8px;
                        min-width: 180px;
                        z-index: 1000;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                        opacity: 0;
                        transform: translateY(-10px);
                        animation: dropdownAppear 0.2s ease-out forwards;
                    `;
                    
                    this.appendChild(dropdown);
                    
                    // Add logout functionality
                    document.getElementById('adminLogoutBtn').addEventListener('click', (e) => {
                        e.preventDefault();
                        logout();
                    });
                    
                    // Close dropdown when clicking outside
                    document.addEventListener('click', function closeDropdown(e) {
                        if (!userMenu.contains(e.target)) {
                            dropdown.remove();
                            userMenu.classList.remove('active');
                            document.removeEventListener('click', closeDropdown);
                        }
                    });
                }
            });
        }
    }
    
    function setupReportItems() {
        // This is now handled dynamically in updateRecentReports
    }
    
    function setupActionButtons() {
        const actionButtons = document.querySelectorAll('.action-btn');
        actionButtons.forEach(button => {
            // Hover effect
            button.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 8px 25px rgba(212, 165, 116, 0.2)';
            });
            
            button.addEventListener('mouseleave', function() {
                this.style.transform = '';
                this.style.boxShadow = '';
            });
            
            // Click handler
            button.addEventListener('click', function(e) {
                e.preventDefault();
                createRipple(e);
                
                const action = this.getAttribute('data-action') || this.textContent.trim();
                console.log(`🚀 Action triggered: ${action}`);
                
                showToast(`Opening ${action.replace('-', ' ')}...`, 'info');
                
                // Handle different actions
                handleAdminAction(action);
            });
        });
    }
    
    function handleAdminAction(action) {
        switch(action) {
            case 'manage-users':
                // Open users management modal
                showUsersManagement();
                break;
            case 'review-reports':
                // Open reports management
                openReportsManagement();
                break;
            case 'monitor-voice':
                // Voice room monitoring (placeholder)
                showToast('Voice room monitoring coming soon', 'info');
                break;
            case 'edit-filters':
                // Open filter words manager
                openFilterWordsManager();
                break;
        }
    }
    
    async function showUsersManagement() {
        try {
            const response = await fetch(`${API_BASE}/users?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showUsersModal(data.users, data.pagination, data.stats);
            }
            
        } catch (error) {
            console.error('Error fetching users:', error);
            showToast('Could not load users', 'warning');
        }
    }
    
    function showUsersModal(users, pagination, stats) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 1200px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; color: #e8d5c4;">User Management (${pagination.totalUsers} users)</h2>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Active Users</div>
                        <div style="font-size: 24px; color: #16a34a; font-weight: 500;">${stats.active}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Banned Users</div>
                        <div style="font-size: 24px; color: #dc2626; font-weight: 500;">${stats.banned}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Suspended Users</div>
                        <div style="font-size: 24px; color: #eab308; font-weight: 500;">${stats.suspended}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Admin Users</div>
                        <div style="font-size: 24px; color: #7c3aed; font-weight: 500;">${stats.admin}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <input type="text" id="searchUsers" placeholder="Search by name, email, or username..." style="
                            flex: 1;
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                        ">
                        <select id="filterStatus" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 150px;
                        ">
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="banned">Banned</option>
                            <option value="suspended">Suspended</option>
                            <option value="verified">Verified</option>
                            <option value="unverified">Unverified</option>
                            <option value="admin">Admin</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; overflow: hidden;">
                        <div style="display: grid; grid-template-columns: 40px 2fr 2fr 1fr 1fr 1fr 1fr auto; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); font-weight: 500; color: #d4a574;">
                            <div>#</div>
                            <div>Name</div>
                            <div>Email</div>
                            <div>Status</div>
                            <div>Verified</div>
                            <div>Admin</div>
                            <div>Joined</div>
                            <div>Actions</div>
                        </div>
                        <div style="max-height: 400px; overflow-y: auto;">
                            ${users && users.length > 0 ? users.map((user, index) => `
                                <div data-user-id="${user._id}" style="display: grid; grid-template-columns: 40px 2fr 2fr 1fr 1fr 1fr 1fr auto; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); align-items: center;">
                                    <div style="color: #a78c6d;">${index + 1}.</div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div style="
                                            width: 32px;
                                            height: 32px;
                                            background: rgba(212, 165, 116, 0.1);
                                            border-radius: 50%;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 14px;
                                            color: #d4a574;
                                        ">
                                            ${user.profilePicture || '👤'}
                                        </div>
                                        <div>
                                            <div style="color: #e8d5c4; font-weight: 500;">${user.name}</div>
                                            <div style="font-size: 12px; color: #a78c6d;">${user.username || 'No username'}</div>
                                        </div>
                                    </div>
                                    <div style="color: #e8d5c4;">${user.email}</div>
                                    <div>
                                        ${user.isBanned ? 
                                            '<span class="badge-pending" style="background: #dc2626; font-size: 10px; padding: 2px 8px;">Banned</span>' : 
                                            user.isSuspended ? 
                                            '<span class="badge-warning" style="background: #eab308; font-size: 10px; padding: 2px 8px;">Suspended</span>' : 
                                            '<span class="badge-reviewed" style="background: #16a34a; font-size: 10px; padding: 2px 8px;">Active</span>'
                                        }
                                    </div>
                                    <div>
                                        <span style="color: ${user.isVerified ? '#16a34a' : '#a78c6d'};">
                                            ${user.isVerified ? '✓' : '✗'}
                                        </span>
                                    </div>
                                    <div>
                                        <span style="color: ${user.isAdmin ? '#7c3aed' : '#a78c6d'};">
                                            ${user.isAdmin ? '✓' : '✗'}
                                        </span>
                                    </div>
                                    <div style="font-size: 12px; color: #a78c6d;">
                                        ${new Date(user.createdAt).toLocaleDateString()}
                                    </div>
                                    <div style="display: flex; gap: 4px;">
                                        <button class="action-btn" data-action="view-user" data-user-id="${user._id}" 
                                                style="padding: 4px 8px; font-size: 12px;">
                                            View
                                        </button>
                                    </div>
                                </div>
                            `).join('') : `
                                <div style="padding: 40px; text-align: center; color: #a78c6d;">
                                    No users found
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <div style="font-size: 14px; color: #a78c6d;">
                        Page ${pagination.currentPage} of ${pagination.totalPages}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="action-btn" data-action="prev-page" ${pagination.currentPage <= 1 ? 'disabled' : ''}
                                style="padding: 8px 16px; font-size: 14px; ${pagination.currentPage <= 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                            Previous
                        </button>
                        <button class="action-btn" data-action="next-page" ${pagination.currentPage >= pagination.totalPages ? 'disabled' : ''}
                                style="padding: 8px 16px; font-size: 14px; ${pagination.currentPage >= pagination.totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add search functionality
        const searchInput = modal.querySelector('#searchUsers');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = modal.querySelectorAll('[data-user-id]');
            
            rows.forEach(row => {
                const name = row.querySelector('div:nth-child(2) div:nth-child(2) div:nth-child(1)').textContent.toLowerCase();
                const email = row.querySelector('div:nth-child(3)').textContent.toLowerCase();
                const username = row.querySelector('div:nth-child(2) div:nth-child(2) div:nth-child(2)').textContent.toLowerCase();
                
                if (name.includes(searchTerm) || email.includes(searchTerm) || username.includes(searchTerm)) {
                    row.style.display = 'grid';
                } else {
                    row.style.display = 'none';
                }
            });
        });
        
        // Add filter functionality
        const statusFilter = modal.querySelector('#filterStatus');
        statusFilter.addEventListener('change', (e) => {
            const selectedStatus = e.target.value;
            const rows = modal.querySelectorAll('[data-user-id]');
            
            rows.forEach(row => {
                let shouldShow = false;
                
                switch(selectedStatus) {
                    case 'all':
                        shouldShow = true;
                        break;
                    case 'active':
                        shouldShow = !row.querySelector('div:nth-child(4) .badge-pending[style*="background: #dc2626"]') && 
                                     !row.querySelector('div:nth-child(4) .badge-warning[style*="background: #eab308"]');
                        break;
                    case 'banned':
                        shouldShow = !!row.querySelector('div:nth-child(4) .badge-pending[style*="background: #dc2626"]');
                        break;
                    case 'suspended':
                        shouldShow = !!row.querySelector('div:nth-child(4) .badge-warning[style*="background: #eab308"]');
                        break;
                    case 'verified':
                        shouldShow = row.querySelector('div:nth-child(5) span').textContent === '✓';
                        break;
                    case 'unverified':
                        shouldShow = row.querySelector('div:nth-child(5) span').textContent === '✗';
                        break;
                    case 'admin':
                        shouldShow = row.querySelector('div:nth-child(6) span').textContent === '✓';
                        break;
                    case 'inactive':
                        // This would require checking last login date
                        shouldShow = true; // Placeholder
                        break;
                }
                
                row.style.display = shouldShow ? 'grid' : 'none';
            });
        });
        
        // Add view user handlers
        modal.querySelectorAll('[data-action="view-user"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = btn.dataset.userId;
                document.body.removeChild(modal);
                openUserDetails(userId);
            });
        });
        
        // Add pagination handlers
        modal.querySelector('[data-action="prev-page"]').addEventListener('click', () => {
            if (pagination.currentPage > 1) {
                // Implement pagination
                showToast('Pagination coming soon', 'info');
            }
        });
        
        modal.querySelector('[data-action="next-page"]').addEventListener('click', () => {
            if (pagination.currentPage < pagination.totalPages) {
                // Implement pagination
                showToast('Pagination coming soon', 'info');
            }
        });
    }
    
    async function openReportsManagement() {
        try {
            const response = await fetch(`${API_BASE}/reports?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showReportsModal(data.reports, data.pagination, data.stats);
            }
            
        } catch (error) {
            console.error('Error fetching reports:', error);
            showToast('Could not load reports', 'warning');
        }
    }
    
    function showReportsModal(reports, pagination, stats) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: #2c1810;
                border: 1px solid rgba(232, 213, 196, 0.1);
                border-radius: 12px;
                padding: 24px;
                max-width: 1200px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; color: #e8d5c4;">Reports Management (${pagination.totalReports} reports)</h2>
                    <button class="close-modal" style="
                        background: none;
                        border: none;
                        color: #a78c6d;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    ">×</button>
                </div>
                
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Pending</div>
                        <div style="font-size: 24px; color: #eab308; font-weight: 500;">${stats.pending}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Reviewing</div>
                        <div style="font-size: 24px; color: #f97316; font-weight: 500;">${stats.reviewing}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Resolved</div>
                        <div style="font-size: 24px; color: #16a34a; font-weight: 500;">${stats.resolved}</div>
                    </div>
                    <div style="flex: 1; background: rgba(232, 213, 196, 0.05); border-radius: 8px; padding: 16px;">
                        <div style="font-size: 12px; color: #a78c6d; margin-bottom: 4px;">Dismissed</div>
                        <div style="font-size: 24px; color: #a78c6d; font-weight: 500;">${stats.dismissed || 0}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <select id="filterReportStatus" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 150px;
                        ">
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="reviewing">Reviewing</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                        <select id="filterReportCategory" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 180px;
                        ">
                            <option value="all">All Categories</option>
                            <option value="inappropriate_content">Inappropriate Content</option>
                            <option value="harassment">Harassment</option>
                            <option value="hate_speech">Hate Speech</option>
                            <option value="spam">Spam</option>
                            <option value="fake_account">Fake Account</option>
                            <option value="impersonation">Impersonation</option>
                            <option value="privacy_violation">Privacy Violation</option>
                            <option value="copyright">Copyright</option>
                            <option value="other">Other</option>
                        </select>
                        <select id="filterReportPriority" style="
                            background: rgba(232, 213, 196, 0.05);
                            border: 1px solid rgba(232, 213, 196, 0.1);
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e8d5c4;
                            font-size: 14px;
                            min-width: 120px;
                        ">
                            <option value="all">All Priorities</option>
                            <option value="urgent">Urgent</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    
                    <div style="background: rgba(232, 213, 196, 0.05); border-radius: 8px; overflow: hidden;">
                        <div style="display: grid; grid-template-columns: 40px 1fr 1fr 1fr 1fr 1fr 1fr auto; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); font-weight: 500; color: #d4a574;">
                            <div>#</div>
                            <div>Reporter</div>
                            <div>Reported</div>
                            <div>Reason</div>
                            <div>Status</div>
                            <div>Priority</div>
                            <div>Created</div>
                            <div>Actions</div>
                        </div>
                        <div style="max-height: 400px; overflow-y: auto;">
                            ${reports && reports.length > 0 ? reports.map((report, index) => `
                                <div data-report-id="${report._id}" style="display: grid; grid-template-columns: 40px 1fr 1fr 1fr 1fr 1fr 1fr auto; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(232, 213, 196, 0.1); align-items: center;">
                                    <div style="color: #a78c6d;">${index + 1}.</div>
                                    <div>
                                        <div style="color: #e8d5c4; font-weight: 500;">${report.reporter?.name || 'Unknown'}</div>
                                        <div style="font-size: 12px; color: #a78c6d;">${report.reporter?.email || ''}</div>
                                    </div>
                                    <div>
                                        <div style="color: #e8d5c4; font-weight: 500;">${report.reportedUser?.name || 'Unknown'}</div>
                                        <div style="font-size: 12px; color: #a78c6d;">${report.reportedUser?.email || ''}</div>
                                    </div>
                                    <div style="color: #e8d5c4; font-size: 14px;">${report.reason.substring(0, 30)}${report.reason.length > 30 ? '...' : ''}</div>
                                    <div>
                                        <span class="${report.status === 'pending' ? 'badge-pending' : report.status === 'resolved' ? 'badge-reviewed' : 'badge-warning'}" 
                                              style="font-size: 10px; padding: 2px 8px;">
                                            ${report.status}
                                        </span>
                                    </div>
                                    <div>
                                        <span style="color: ${getPriorityColor(report.priority)}; font-size: 12px;">
                                            ${report.priority}
                                        </span>
                                    </div>
                                    <div style="font-size: 12px; color: #a78c6d;">
                                        ${new Date(report.createdAt).toLocaleDateString()}
                                    </div>
                                    <div style="display: flex; gap: 4px;">
                                        <button class="action-btn" data-action="view-report" data-report-id="${report._id}" 
                                                style="padding: 4px 8px; font-size: 12px;">
                                            View
                                        </button>
                                    </div>
                                </div>
                            `).join('') : `
                                <div style="padding: 40px; text-align: center; color: #a78c6d;">
                                    No reports found
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(232, 213, 196, 0.1); padding-top: 20px;">
                    <div style="font-size: 14px; color: #a78c6d;">
                        Page ${pagination.currentPage} of ${pagination.totalPages}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="action-btn" data-action="prev-page" ${pagination.currentPage <= 1 ? 'disabled' : ''}
                                style="padding: 8px 16px; font-size: 14px; ${pagination.currentPage <= 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                            Previous
                        </button>
                        <button class="action-btn" data-action="next-page" ${pagination.currentPage >= pagination.totalPages ? 'disabled' : ''}
                                style="padding: 8px 16px; font-size: 14px; ${pagination.currentPage >= pagination.totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Add filter functionality
        const statusFilter = modal.querySelector('#filterReportStatus');
        const categoryFilter = modal.querySelector('#filterReportCategory');
        const priorityFilter = modal.querySelector('#filterReportPriority');
        
        const applyFilters = () => {
            const selectedStatus = statusFilter.value;
            const selectedCategory = categoryFilter.value;
            const selectedPriority = priorityFilter.value;
            
            const rows = modal.querySelectorAll('[data-report-id]');
            
            rows.forEach(row => {
                let shouldShow = true;
                
                // Status filter
                if (selectedStatus !== 'all') {
                    const statusElement = row.querySelector('div:nth-child(5) span');
                    const status = statusElement.textContent.toLowerCase();
                    if (status !== selectedStatus) {
                        shouldShow = false;
                    }
                }
                
                // Priority filter
                if (shouldShow && selectedPriority !== 'all') {
                    const priorityElement = row.querySelector('div:nth-child(6) span');
                    const priority = priorityElement.textContent.toLowerCase();
                    if (priority !== selectedPriority) {
                        shouldShow = false;
                    }
                }
                
                row.style.display = shouldShow ? 'grid' : 'none';
            });
        };
        
        statusFilter.addEventListener('change', applyFilters);
        categoryFilter.addEventListener('change', applyFilters);
        priorityFilter.addEventListener('change', applyFilters);
        
        // Add view report handlers
        modal.querySelectorAll('[data-action="view-report"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reportId = btn.dataset.reportId;
                document.body.removeChild(modal);
                openReportDetails(reportId);
            });
        });
        
        // Add pagination handlers
        modal.querySelector('[data-action="prev-page"]').addEventListener('click', () => {
            if (pagination.currentPage > 1) {
                showToast('Pagination coming soon', 'info');
            }
        });
        
        modal.querySelector('[data-action="next-page"]').addEventListener('click', () => {
            if (pagination.currentPage < pagination.totalPages) {
                showToast('Pagination coming soon', 'info');
            }
        });
    }
    
    function setupViewAllButton() {
        const viewAllBtn = document.querySelector('.btn-view-all');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', function(e) {
                e.preventDefault();
                createRipple(e);
                
                this.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 150);
                
                console.log('📋 Opening all reports...');
                openReportsManagement();
            });
        }
    }
    
    function setupNotificationBell() {
        const notificationIcon = document.querySelector('.notification-icon');
        if (notificationIcon) {
            // Check for new notifications periodically
            setInterval(async () => {
                try {
                    // Check for new reports
                    const response = await fetch(`${API_BASE}/dashboard/stats`, {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.stats.newReports > 0) {
                            notificationIcon.style.animation = 'shake 0.5s ease-in-out';
                            setTimeout(() => {
                                notificationIcon.style.animation = '';
                            }, 500);
                            
                            // Update badge count
                            const badge = notificationIcon.querySelector('.notification-badge');
                            if (badge) {
                                badge.textContent = data.stats.newReports;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error checking notifications:', error);
                }
            }, 30000); // Check every 30 seconds
        }
    }
    
    function setupLiveVoiceAnimation() {
        const liveVoiceCard = document.querySelector('.stat-card:nth-child(4)');
        if (liveVoiceCard) {
            // Pulse animation for live rooms
            setInterval(() => {
                liveVoiceCard.style.boxShadow = '0 0 20px rgba(217, 119, 6, 0.3)';
                setTimeout(() => {
                    liveVoiceCard.style.boxShadow = '';
                }, 1000);
            }, 8000 + Math.random() * 4000);
        }
    }
    
    function setupStatusIndicator() {
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.style.animation = 'pulse 2s infinite';
        }
    }
    
    // ===== REAL-TIME FUNCTIONS =====
    function startRealtimeUpdates() {
        // Fetch updated stats every 30 seconds (REAL DATA ONLY)
        setInterval(() => {
            fetchDashboardStats();
        }, 30000);
    }
    
    // ===== UTILITY FUNCTIONS =====
    function createRipple(event) {
        const button = event.currentTarget;
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        ripple.style.animation = 'ripple 0.6s ease-out';

        const existingRipple = button.querySelector('.ripple');
        if (existingRipple) {
            existingRipple.remove();
        }

        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
    
    function showLoadingState(show) {
        const loader = document.getElementById('dashboard-loader');
        if (!loader && show) {
            // Create loader if it doesn't exist
            const loaderEl = document.createElement('div');
            loaderEl.id = 'dashboard-loader';
            loaderEl.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(26, 15, 10, 0.8);
                backdrop-filter: blur(5px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                font-size: 18px;
                color: #d4a574;
            `;
            loaderEl.innerHTML = '🔄 Loading dashboard data...';
            document.body.appendChild(loaderEl);
        } else if (loader && !show) {
            loader.remove();
        }
    }
    
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'warning' ? 'rgba(234, 179, 8, 0.9)' : 
                         type === 'error' ? 'rgba(220, 38, 38, 0.9)' : 
                         type === 'success' ? 'rgba(22, 163, 74, 0.9)' : 
                         'rgba(44, 24, 16, 0.9)'};
            color: #f5e6d3;
            padding: 12px 20px;
            border-radius: 8px;
            border-left: 4px solid ${type === 'warning' ? '#eab308' : 
                              type === 'error' ? '#dc2626' : 
                              type === 'success' ? '#16a34a' : '#d4a574'};
            z-index: 10000;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
            font-size: 14px;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    function getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'min' : 'mins'} ago`;
        if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
        if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
        return date.toLocaleDateString();
    }
    
    function logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        showToast('Logged out successfully', 'info');
        
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 1000);
    }
    
    // ===== ERROR HANDLING =====
    window.addEventListener('error', function(e) {
        console.error('Dashboard error:', e.error);
        showToast('An error occurred. Please refresh.', 'warning');
    });
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        @keyframes shake {
            0%, 100% { transform: rotate(0); }
            25% { transform: rotate(-5deg); }
            75% { transform: rotate(5deg); }
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        @keyframes dropdownAppear {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        
        .ripple {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            transform: scale(0);
            animation: ripple 0.6s ease-out;
        }
        
        .user-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            background: rgba(44, 24, 16, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(232, 213, 196, 0.1);
            border-radius: 8px;
            padding: 8px;
            margin-top: 8px;
            min-width: 180px;
            z-index: 1000;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transform: translateY(-10px);
            animation: dropdownAppear 0.2s ease-out forwards;
        }
        
        .dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            color: #e8d5c4;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.2s;
            font-size: 14px;
        }
        
        .dropdown-item:hover {
            background: rgba(212, 165, 116, 0.1);
        }
        
        .dropdown-item svg {
            width: 16px;
            height: 16px;
        }
        
        .stat-card, .mod-card, .report-item {
            transition: all 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
        }
        
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
            animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }
        
        .modal-content {
            background: #2c1810;
            border: 1px solid rgba(232, 213, 196, 0.1);
            border-radius: 12px;
            padding: 24px;
            max-width: 800px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            animation: slideUp 0.3s ease-out;
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(50px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        .badge-pending {
            background: #eab308;
            color: #1a0f0a;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .badge-reviewed {
            background: #16a34a;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .badge-warning {
            background: #f97316;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .action-btn {
            background: rgba(212, 165, 116, 0.1);
            color: #d4a574;
            border: 1px solid rgba(212, 165, 116, 0.2);
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .action-btn:hover {
            background: rgba(212, 165, 116, 0.2);
            transform: translateY(-1px);
        }
    `;
    document.head.appendChild(style);
}