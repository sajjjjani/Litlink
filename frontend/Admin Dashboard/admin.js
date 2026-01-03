// Litlink Admin Dashboard JavaScript - Real-time Version
document.addEventListener('DOMContentLoaded', function() {
    console.log('%c Litlink Admin Dashboard v2.4.0 (Real-time)', 
        'font-size: 16px; font-weight: bold; color: #d97706; background: #1a0f0a; padding: 8px 12px; border-radius: 4px;');
    
    // Check authentication and initialize
    checkAuthAndInitialize();
});

async function checkAuthAndInitialize() {
    // Get auth data
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    console.log('🔐 Checking authentication...', { 
        hasToken: !!token, 
        isAdmin: user.isAdmin,
        user: user 
    });
    
    // Redirect if not admin
    if (!token || user.isAdmin !== true) {
        console.log('❌ Not authenticated as admin, redirecting...');
        showToast('Admin access required. Please login as administrator.', 'warning');
        
        setTimeout(() => {
            window.location.href = '../login.html';
        }, 1500);
        return;
    }
    
    // Verify admin status with API
    try {
        const response = await fetch('http://localhost:5002/api/admin/me', {
            headers: {
                'Authorization': `Bearer ${token}`
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
        
        // Update UI with admin info
        updateAdminUI(data.user);
        
        // Initialize dashboard
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
    // API Base URL
    const API_BASE = 'http://localhost:5002/api';
    const token = localStorage.getItem('authToken');
    
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
            
            const response = await fetch(`${API_BASE}/admin/dashboard/stats`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch stats');
            }
            
            const data = await response.json();
            
            if (data.success) {
                updateStats(data.stats);
            }
            
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            // Use fallback data
            updateStatsWithFallback();
        } finally {
            showLoadingState(false);
        }
    }
    
    // ===== UI UPDATE FUNCTIONS =====
    function updateStats(stats) {
        console.log('📊 Updating dashboard stats:', stats);
        
        // Update total users
        const totalUsers = document.querySelector('.stat-card:nth-child(1) .stat-value');
        if (totalUsers && stats.totalUsers !== undefined) {
            animateValue(totalUsers, parseInt(totalUsers.textContent.replace(/,/g, '')) || 0, stats.totalUsers, 1000);
        }
        
        // Update active users
        const activeUsers = document.querySelector('.stat-card:nth-child(2) .stat-value');
        if (activeUsers && stats.activeUsers !== undefined) {
            animateValue(activeUsers, parseInt(activeUsers.textContent.replace(/,/g, '')) || 0, stats.activeUsers, 1000);
        }
        
        // Update active matches
        const activeMatches = document.querySelector('.stat-card:nth-child(3) .stat-value');
        if (activeMatches && stats.activeMatches !== undefined) {
            animateValue(activeMatches, parseInt(activeMatches.textContent.replace(/,/g, '')) || 0, stats.activeMatches, 1000);
        }
        
        // Update live voice rooms
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
        
        // Update timestamp
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        updateTimestamp(`Last updated: ${timestamp}`);
    }
    
    function updateStatsWithFallback() {
        // Generate realistic mock data
        const mockStats = {
            totalUsers: Math.floor(12482 + Math.random() * 100),
            activeUsers: Math.floor(843 + Math.random() * 50),
            activeMatches: Math.floor(156 + Math.random() * 20),
            liveRooms: Math.floor(24 + Math.random() * 10),
            newReports: Math.floor(12 + Math.random() * 5),
            pendingReports: Math.floor(5 + Math.random() * 3),
            resolvedReports: Math.floor(128 + Math.random() * 20),
            joinedToday: Math.floor(42 + Math.random() * 10),
            joinedWeek: Math.floor(315 + Math.random() * 30),
            bannedUsers: Math.floor(2 + Math.random() * 3)
        };
        
        updateStats(mockStats);
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
        const reportItems = document.querySelectorAll('.report-item');
        reportItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                createRipple(e);
                
                // Add animation
                this.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 150);
                
                // Simulate opening report details
                const reportType = this.querySelector('.report-type').textContent;
                const reportDesc = this.querySelector('.report-desc').textContent;
                
                console.log(`📋 Opening report: ${reportType} - ${reportDesc}`);
                showToast(`Opening report: ${reportDesc}`, 'info');
            });
        });
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
                // In real app, navigate to users management
                console.log('Navigating to user management...');
                break;
            case 'review-reports':
                console.log('Opening reports management...');
                break;
            case 'monitor-voice':
                console.log('Opening voice room monitoring...');
                break;
            case 'edit-filters':
                console.log('Opening content filter settings...');
                break;
        }
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
                
                console.log('📋 Navigating to all reports...');
                showToast('Loading all reports...', 'info');
            });
        }
    }
    
    function setupNotificationBell() {
        const notificationIcon = document.querySelector('.notification-icon');
        if (notificationIcon) {
            // Simulate periodic notifications
            setInterval(() => {
                notificationIcon.style.animation = 'shake 0.5s ease-in-out';
                setTimeout(() => {
                    notificationIcon.style.animation = '';
                    
                    // Randomly update badge count
                    const badge = notificationIcon.querySelector('.notification-badge');
                    if (badge && Math.random() > 0.7) {
                        const currentCount = parseInt(badge.textContent) || 0;
                        badge.textContent = currentCount + 1;
                        showToast('New notification received', 'warning');
                    }
                }, 500);
            }, 15000 + Math.random() * 15000);
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
                
                // Randomly update live room count
                const roomCount = liveVoiceCard.querySelector('.stat-value');
                if (roomCount && Math.random() > 0.5) {
                    const currentRooms = parseInt(roomCount.textContent) || 0;
                    const change = Math.random() > 0.5 ? 1 : -1;
                    const newRooms = Math.max(1, currentRooms + change);
                    animateValue(roomCount, currentRooms, newRooms, 500);
                }
            }, 8000 + Math.random() * 4000);
        }
    }
    
    function setupStatusIndicator() {
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.style.animation = 'pulse 2s infinite';
            
            // Simulate occasional status changes
            setInterval(() => {
                if (Math.random() > 0.9) {
                    const systemStatus = document.querySelector('.footer-right span:nth-child(2)');
                    if (systemStatus) {
                        const originalText = systemStatus.textContent;
                        const originalColor = systemStatus.style.color;
                        const originalBg = statusIndicator.style.backgroundColor;
                        
                        systemStatus.textContent = 'System Warning';
                        systemStatus.style.color = '#eab308';
                        statusIndicator.style.backgroundColor = '#eab308';
                        
                        showToast('System warning detected', 'warning');
                        
                        setTimeout(() => {
                            systemStatus.textContent = originalText;
                            systemStatus.style.color = originalColor;
                            statusIndicator.style.backgroundColor = originalBg;
                        }, 5000);
                    }
                }
            }, 30000);
        }
    }
    
    // ===== REAL-TIME FUNCTIONS =====
    function startRealtimeUpdates() {
        // Fetch updated stats every 30 seconds
        setInterval(() => {
            fetchDashboardStats();
        }, 30000);
        
        // Simulate real-time updates every 10 seconds
        setInterval(() => {
            simulateRealtimeUpdate();
        }, 10000);
    }
    
    function simulateRealtimeUpdate() {
        // Update active users randomly
        const activeUsers = document.querySelector('.stat-card:nth-child(2) .stat-value');
        if (activeUsers && Math.random() > 0.5) {
            try {
                const currentValue = parseInt(activeUsers.textContent.replace(/,/g, '')) || 0;
                const change = Math.floor(Math.random() * 20) - 5;
                const newValue = Math.max(100, currentValue + change);
                
                activeUsers.style.transition = 'color 0.3s ease';
                if (change > 0) {
                    activeUsers.style.color = '#16a34a';
                } else if (change < 0) {
                    activeUsers.style.color = '#dc2626';
                }
                
                animateValue(activeUsers, currentValue, newValue, 800);
                
                setTimeout(() => {
                    activeUsers.style.color = '#e8d5c4';
                }, 1500);
            } catch (error) {
                console.error('Error updating real-time data:', error);
            }
        }
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
            background: ${type === 'warning' ? 'rgba(234, 179, 8, 0.9)' : 'rgba(44, 24, 16, 0.9)'};
            color: #f5e6d3;
            padding: 12px 20px;
            border-radius: 8px;
            border-left: 4px solid ${type === 'warning' ? '#eab308' : '#d4a574'};
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
    `;
    document.head.appendChild(style);
}