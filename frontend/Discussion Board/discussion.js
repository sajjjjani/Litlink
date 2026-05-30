function getAuthToken() {
    // CRITICAL: Always prioritize sessionStorage for tab-specific isolation
    // This prevents session contamination between multiple logged-in accounts
    const sessionToken = sessionStorage.getItem('litlink_token') || sessionStorage.getItem('token');
    if (sessionToken) return sessionToken;
    
    // Fallback to global auth system if available
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getToken === 'function') {
        return window.LitlinkSessionAuth.getToken();
    }
    
    // Last resort: localStorage (shared across tabs)
    return localStorage.getItem('litlink_token') || localStorage.getItem('token');
}

function getAuthUser() {
    // CRITICAL: Always prioritize sessionStorage for tab-specific isolation
    try {
        const sessionUser = sessionStorage.getItem('litlink_user') || sessionStorage.getItem('user');
        if (sessionUser) return JSON.parse(sessionUser);
    } catch (e) {
        console.error('Error parsing session user:', e);
    }
    
    // Fallback to global auth system
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getUser === 'function') {
        return window.LitlinkSessionAuth.getUser();
    }
    
    // Last resort: localStorage
    try {
        const localUser = localStorage.getItem('litlink_user') || localStorage.getItem('user');
        return localUser ? JSON.parse(localUser) : null;
    } catch (e) {
        console.error('Error parsing local user:', e);
        return null;
    }
}

function getAuthUserId() {
    // CRITICAL: Always prioritize sessionStorage for tab-specific isolation
    const sessionUserId = sessionStorage.getItem('litlink_userId') || sessionStorage.getItem('userId');
    if (sessionUserId) return sessionUserId;
    
    // Fallback to global auth system
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getUserId === 'function') {
        return window.LitlinkSessionAuth.getUserId();
    }
    
    // Extract from user object
    const user = getAuthUser();
    return user ? (user._id || user.id || '') : '';
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Litlink Community Board loaded!');
    const query = new URLSearchParams(window.location.search);
    if (query.get('tab') === 'circle-requests') {
        window.location.href = '../Circle Requests/circle-requests.html';
        return;
    }
    
    const token = getAuthToken();
    if (!token) {
        console.log('No token found - user not logged in');
        showNotification('Please log in to participate in discussions', 'info');
    }
    
    await initializePage();
    await loadUserCircles();
    const requestedCircleId = query.get('circleId');
    if (requestedCircleId) {
        switchToCircle(requestedCircleId);
    }
    setupEventListeners();
    await loadThreads();
    loadHighlights();
    loadGenreStats();
    setupWebSocket();
    initializeCommunityFeatures();
    loadRecentActivity();
});

// Global variables
let currentUser = null;
let currentPage = 1;
let currentFilter = 'recent';
let currentGenre = 'All Genres';
let currentCircle = null;
let currentFeed = 'circle';
let searchTimeout = null;
let socket = null;
let isLoading = false;
let hasMoreThreads = true;
let userCircles = [];

async function initializePage() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        // CRITICAL: Always fetch fresh user data from server to ensure correct identity
        const response = await fetch('http://localhost:5002/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            
            // CRITICAL: Store user data in sessionStorage for tab-specific isolation
            // This prevents cross-tab contamination when multiple accounts are logged in
            const currentId = String(currentUser?._id || currentUser?.id || '');
            const userStr = JSON.stringify(currentUser);
            
            // Always update sessionStorage with fresh data
            sessionStorage.setItem('litlink_user', userStr);
            sessionStorage.setItem('user', userStr);
            sessionStorage.setItem('litlink_userId', currentId);
            sessionStorage.setItem('litlink_token', token);
            
            // Log warning if there was a mismatch (debugging multi-account issues)
            const previousUserId = sessionStorage.getItem('userId');
            if (previousUserId && previousUserId !== currentId) {
                console.warn('[DISCUSSION] User identity changed in this tab:', {
                    previous: previousUserId,
                    current: currentId
                });
            }
            sessionStorage.setItem('userId', currentId);
            
            updateUserInfo();
            addMyCreatedCirclesSection();
        } else {
            // Token is invalid, clear session
            console.error('Failed to authenticate user');
            sessionStorage.clear();
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

function updateUserInfo() {
    if (currentUser) {
        const avatar = document.querySelector('.avatar');
        if (avatar) {
            avatar.innerHTML = `<img src="${currentUser.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.name}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
    }
}

async function loadUserCircles() {
    try {
        const token = getAuthToken();
        if (!token) {
            const circleSelect = document.getElementById('activeCircle');
            if (circleSelect) {
                circleSelect.innerHTML = '<option value="">Please log in to join circles</option>';
            }
            return;
        }
        
        const response = await fetch('http://localhost:5002/api/discussions/user/circles', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                userCircles = data.circles;
                updateCircleSelector(data.circles);
                addCreateCircleButton();
                
                if (data.pendingRequests && data.pendingRequests.length > 0) {
                    showNotification(`You have ${data.pendingRequests.length} pending circle join request(s)`, 'info');
                }
                
                if (data.circles.length > 0) {
                    if (!currentCircle || !data.circles.some(c => c.circleId === currentCircle)) {
                        currentCircle = data.circles[0].circleId;
                    }
                    updateFeedTitle();
                    loadCircleMembers(currentCircle);
                } else {
                    showEmptyCirclesState();
                }
            }
        }
    } catch (error) {
        console.error('Error loading user circles:', error);
        const circleSelect = document.getElementById('activeCircle');
        if (circleSelect) {
            circleSelect.innerHTML = '<option value="">Error loading circles</option>';
        }
    }
}

function showEmptyCirclesState() {
    const circleSelect = document.getElementById('activeCircle');
    if (circleSelect) {
        circleSelect.innerHTML = '<option value="" disabled selected>No circles joined yet</option>';
    }
    
    const membersAvatars = document.getElementById('membersAvatars');
    if (membersAvatars) {
        membersAvatars.innerHTML = `
            <div class="empty-state" style="width: 100%; padding: 20px;">
                <i class="fas fa-users"></i>
                <p style="margin-top: 10px;">Join a circle to get started!</p>
                <button class="btn-primary" id="discoverCirclesEmptyBtn" style="margin-top: 10px; padding: 8px 16px; font-size: 13px;">
                    <i class="fas fa-search"></i> Discover Circles
                </button>
            </div>
        `;
        
        const discoverBtn = document.getElementById('discoverCirclesEmptyBtn');
        if (discoverBtn) {
            discoverBtn.addEventListener('click', () => showCircleDiscoveryModal());
        }
    }
}

function updateCircleSelector(circles) {
    const circleSelect = document.getElementById('activeCircle');
    if (!circleSelect) return;
    
    const previousValue = circleSelect.value;
    
    circleSelect.innerHTML = '';
    
    if (!circles || circles.length === 0) {
        circleSelect.innerHTML = '<option value="" disabled selected>No circles joined yet</option>';
        return;
    }
    
    circles.forEach(circle => {
        const option = document.createElement('option');
        option.value = circle.circleId;
        option.textContent = `${circle.icon || '📚'} ${circle.name}`;
        option.dataset.role = circle.role;
        circleSelect.appendChild(option);
    });
    
    if (previousValue && circles.some(c => c.circleId === previousValue)) {
        circleSelect.value = previousValue;
    }
}

function addCreateCircleButton() {
    const circleSelector = document.querySelector('.active-circle-selector');
    if (!circleSelector) return;
    
    const existingBtn = circleSelector.querySelector('.create-circle-quick-btn');
    if (existingBtn) existingBtn.remove();
    
    const createBtn = document.createElement('button');
    createBtn.className = 'create-circle-quick-btn';
    createBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create New Circle';
    createBtn.addEventListener('click', () => showCreateCircleModal());
    
    circleSelector.appendChild(createBtn);
}

function setupWebSocket() {
    const token = getAuthToken();
    if (!token) return;

    if (socket && socket.connected) {
        return;
    }
    
    if (typeof io === 'undefined') {
        console.warn('Socket.IO not loaded, real-time updates disabled');
        return;
    }
    
    try {
        socket = io('http://localhost:5002', {
            auth: { token },
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            const activeToken = getAuthToken();
            socket.emit('authenticate', activeToken);
        });
        
        socket.on('connect_error', (error) => {
            console.log('⚠️ WebSocket connection error:', error.message);
        });
        
        socket.on('new-thread', (data) => {
            showNotification('New public discussion: ' + data.thread.title, 'info');
            if (currentPage === 1 && currentFeed !== 'circle') {
                loadThreads();
            }
            addActivityToFeed({
                userAvatar: data.thread.author?.profilePicture,
                userName: data.thread.author?.name,
                action: 'started a public discussion',
                target: data.thread.title,
                targetId: data.thread._id,
                targetType: 'thread',
                timeAgo: 'Just now'
            });
        });
        
        socket.on('circle-request-approved', (data) => {
            showNotification(`✅ ${data.message}`, 'success');
            loadUserCircles();
            loadThreads();
            addActivityToFeed({
                userAvatar: currentUser?.profilePicture,
                userName: currentUser?.name,
                action: 'joined',
                target: data.circleName,
                targetId: data.circleId,
                targetType: 'circle',
                timeAgo: 'Just now'
            });
        });
        
        socket.on('new-circle-thread', (data) => {
            if (data.circleId === currentCircle && currentFeed === 'circle') {
                loadThreads();
                showNotification(`🔔 New in ${data.circleName}: ${data.message}`, 'info');
            }
            addActivityToFeed({
                userAvatar: data.thread?.author?.profilePicture,
                userName: data.thread?.author?.name,
                action: `posted in circle`,
                target: data.circleName,
                targetId: data.circleId,
                targetType: 'circle',
                timeAgo: 'Just now'
            });
        });
        
        socket.on('new-comment', (data) => {
            addActivityToFeed({
                userAvatar: data.userAvatar,
                userName: data.userName,
                action: 'commented on',
                target: data.threadTitle,
                targetId: data.threadId,
                targetType: 'comment',
                timeAgo: 'Just now'
            });
        });
        
        socket.on('circle-created', (data) => {
            addActivityToFeed({
                userAvatar: currentUser?.profilePicture,
                userName: currentUser?.name,
                action: 'created a new circle',
                target: data.circleName,
                targetId: data.circleId,
                targetType: 'circle',
                timeAgo: 'Just now'
            });
        });
        
        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
        });

        socket.on('reconnect_attempt', (attempt) => {
            console.log('WebSocket reconnect attempt:', attempt);
        });

        socket.on('reconnect', (attempt) => {
            console.log('WebSocket reconnected after attempts:', attempt);
        });

        // Real-time notification events
        socket.on('notification', (data) => {
            showNotification(data.title + ': ' + data.message, 'info');
        });

        socket.on('circle-join-request', (data) => {
            showNotification('\uD83D\uDD14 ' + data.title + ': ' + data.message, 'info');
        });

    } catch (error) {
        console.error('Error setting up WebSocket:', error);
    }
}

async function loadRecentActivity() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/discussions/recent-activity', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.activities && data.activities.length > 0) {
                const feedScroll = document.getElementById('feedScroll');
                if (feedScroll) {
                    feedScroll.innerHTML = '';
                }
                data.activities.forEach(activity => {
                    addActivityToFeed(activity);
                });
            } else {
                initializeCommunityFeatures();
            }
        } else {
            initializeCommunityFeatures();
        }
    } catch (error) {
        console.error('Error loading recent activity:', error);
        initializeCommunityFeatures();
    }
}

function addActivityToFeed(activity) {
    const feedScroll = document.getElementById('feedScroll');
    if (!feedScroll) return;
    
    if (feedScroll.children.length === 1 && feedScroll.children[0].querySelector('.empty-state-message')) {
        feedScroll.innerHTML = '';
    }
    
    const activityElement = document.createElement('div');
    activityElement.className = 'feed-item';
    activityElement.style.animation = 'slideIn 0.3s ease';
    
    const avatarUrl = activity.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(activity.userName || 'user')}`;
    
    let targetLink = '';
    if (activity.targetType === 'thread' && activity.targetId) {
        targetLink = `<a href="#" class="feed-link" onclick="viewThread('${activity.targetId}'); return false;">${escapeHtml(activity.target)}</a>`;
    } else if (activity.targetType === 'circle') {
        targetLink = `<span class="feed-link" style="cursor: pointer;" onclick="switchToCircle('${activity.targetId}')">${escapeHtml(activity.target)}</span>`;
    } else {
        targetLink = `<span class="feed-link">${escapeHtml(activity.target)}</span>`;
    }
    
    activityElement.innerHTML = `
        <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(activity.userName)}" class="feed-avatar" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
        <div class="feed-content">
            <span class="feed-user">${escapeHtml(activity.userName || 'Someone')}</span> 
            ${escapeHtml(activity.action)} 
            ${targetLink}
            <span class="feed-time">${escapeHtml(activity.timeAgo || 'Just now')}</span>
        </div>
    `;
    
    if (activity.targetType === 'circle') {
        const circleLink = activityElement.querySelector('.feed-link');
        if (circleLink) {
            circleLink.addEventListener('click', (e) => {
                e.preventDefault();
                switchToCircle(activity.targetId);
            });
        }
    }
    
    feedScroll.insertBefore(activityElement, feedScroll.firstChild);
    
    while (feedScroll.children.length > 20) {
        feedScroll.removeChild(feedScroll.lastChild);
    }
}

function switchToCircle(circleId) {
    const circleSelect = document.getElementById('activeCircle');
    if (circleSelect) {
        const option = Array.from(circleSelect.options).find(opt => opt.value === circleId);
        if (option) {
            circleSelect.value = circleId;
            currentCircle = circleId;
            updateFeedTitle();
            currentPage = 1;
            loadThreads();
            loadCircleMembers(currentCircle);
            showNotification(`Switched to circle`, 'info');
        }
    }
}

function initializeCommunityFeatures() {
    const feedScroll = document.getElementById('feedScroll');
    if (!feedScroll) return;
    
    if (feedScroll.children.length === 0 || 
        (feedScroll.children.length === 1 && feedScroll.children[0].innerHTML.includes('Loading'))) {
        feedScroll.innerHTML = `
            <div class="feed-item">
                <div class="feed-content empty-state-message" style="text-align: center; padding: 20px;">
                    <i class="fas fa-info-circle" style="font-size: 24px; margin-bottom: 10px; display: block; color: #a88b76;"></i>
                    <p style="color: #c4a891;">No recent activity yet. Join a circle or start a discussion!</p>
                    <p style="color: #a88b76; font-size: 12px; margin-top: 8px;">Activity will appear here when users create threads, post comments, or join circles.</p>
                </div>
            </div>
        `;
    }
}

// ===== FIXED: EVENT LISTENERS =====
function setupEventListeners() {
    const circleSelect = document.getElementById('activeCircle');
    if (circleSelect) {
        circleSelect.addEventListener('change', function() {
            if (this.value) {
                currentCircle = this.value;
                updateFeedTitle();
                currentPage = 1;
                loadThreads();
                loadCircleMembers(currentCircle);
            }
        });
    }
    
    const discoverBtn = document.getElementById('discoverCirclesBtn');
    if (discoverBtn) {
        discoverBtn.addEventListener('click', () => showCircleDiscoveryModal());
    }
    
    const createCircleHeaderBtn = document.getElementById('createCircleBtn');
    if (createCircleHeaderBtn) {
        createCircleHeaderBtn.addEventListener('click', () => showCreateCircleModal());
    }
    
    // FIX 1: "Create New Circle Thread" button → Circle-only thread
    const createCircleBtn = document.getElementById('createCircleThreadBtn');
    if (createCircleBtn) {
        createCircleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Create Circle Thread clicked - showing circle-only modal');
            showCircleThreadModal();  // Circle-only thread
        });
    }
    
    // FIX 2: "Start Public Discussion" button → Public thread
    const createPublicBtn = document.getElementById('createPublicDiscussionBtn');
    if (createPublicBtn) {
        createPublicBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Create Public Discussion clicked - showing public modal');
            showPublicDiscussionModal();  // Public thread
        });
    }

    // FIX 3: "Start a New Thread" button (bottom) → Public thread
    const startThreadBtn = document.getElementById('startThreadBtn');
    if (startThreadBtn) {
        startThreadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Start Thread (bottom) clicked - showing public modal');
            showPublicDiscussionModal();  // Public thread only
        });
    }
    
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFeed = this.dataset.feed;
            updateFeedTitle();
            currentPage = 1;
            loadThreads();
        });
    });
    
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            handleCircleAction(action);
        });
    });
    
    const filterOptions = document.querySelectorAll('.filter-option');
    filterOptions.forEach(option => {
        option.addEventListener('click', function() {
            filterOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            const filterText = this.querySelector('.filter-label span').textContent.toLowerCase();
            currentFilter = filterText.replace(' ', '_');
            currentPage = 1;
            loadThreads();
        });
    });
    
    const genreTags = document.querySelectorAll('.genre-tag');
    genreTags.forEach(tag => {
        tag.addEventListener('click', function() {
            if (this.textContent === 'All Genres') {
                genreTags.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentGenre = 'All Genres';
            } else {
                this.classList.toggle('active');
                const allGenres = document.querySelector('.genre-tag:first-child');
                const activeTags = document.querySelectorAll('.genre-tag.active');
                
                if (activeTags.length > 0) {
                    allGenres.classList.remove('active');
                    currentGenre = activeTags[0].textContent;
                } else {
                    allGenres.classList.add('active');
                    currentGenre = 'All Genres';
                }
            }
            
            currentPage = 1;
            loadThreads();
        });
    });
    
    const searchBar = document.querySelector('.search-bar');
    const searchBtn = document.querySelector('.search-btn');
    
    if (searchBar) {
        searchBar.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value.trim();
                if (searchTerm.length >= 2 || searchTerm.length === 0) {
                    currentPage = 1;
                    loadThreads(searchTerm);
                }
            }, 500);
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            const term = searchBar.value.trim();
            if (term) {
                currentPage = 1;
                loadThreads(term);
            } else {
                searchBar.focus();
            }
        });
    }
    
    const sortSelect = document.querySelector('.sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentPage = 1;
            loadThreads();
        });
    }
    
    const loadMoreBtn = document.querySelector('.load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            if (!isLoading && hasMoreThreads) {
                currentPage++;
                loadThreads(null, true);
            }
        });
    }
}

async function loadCircleMembers(circleId) {
    const membersAvatars = document.getElementById('membersAvatars');
    const memberCountSpan = document.getElementById('memberCount');
    
    if (!membersAvatars) return;

    // Show loading state
    membersAvatars.innerHTML = '<div class="loading-spinner-small" style="width: 20px; height: 20px; border: 2px solid rgba(232, 212, 192, 0.1); border-top: 2px solid #e8d4c0; border-radius: 50%; animation: spin 1s linear infinite;"></div>';
    
    try {
        const token = getAuthToken();
        const response = await fetch(`http://localhost:5002/api/discussions/circles/${circleId}/details`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.circle.members) {
                const members = data.circle.members;
                const previewMembers = members.slice(0, 5);
                
                if (members.length > 0) {
                    membersAvatars.innerHTML = previewMembers.map(m => `
                        <img src="${m.user.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(m.user.name)}" 
                             alt="${escapeHtml(m.user.name)}" 
                             title="${escapeHtml(m.user.name)}"
                             class="member-avatar"
                             style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid #e8d4c0; object-fit: cover; margin-right: -10px; transition: transform 0.2s; cursor: pointer;"
                             onmouseover="this.style.transform='translateY(-5px)'; this.style.zIndex='10';"
                             onmouseout="this.style.transform='translateY(0)'; this.style.zIndex='1';">
                    `).join('');

                    if (members.length > 5) {
                        membersAvatars.innerHTML += `<span class="more-members" style="background: rgba(139, 69, 40, 0.5); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; border: 2px solid #e8d4c0; margin-left: 5px;">+${members.length - 5}</span>`;
                    }
                } else {
                    membersAvatars.innerHTML = '<span style="font-size: 12px; color: #a88b76;">No members yet</span>';
                }

                if (memberCountSpan) {
                    memberCountSpan.textContent = `${members.length} members`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading circle members:', error);
        membersAvatars.innerHTML = '<i class="fas fa-exclamation-circle" title="Error loading members" style="color: #ff4444;"></i>';
    }
}

// ===== CIRCLE DISCOVERY FUNCTIONS =====

async function showCircleDiscoveryModal() {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to discover circles', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }
    
    showNotification('Loading available circles...', 'info');
    
    try {
        const response = await fetch('http://localhost:5002/api/discussions/circles/all', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load circles');
        
        const data = await response.json();
        
        if (data.success) {
            renderCircleDiscoveryModal(data.circles);
        } else {
            showNotification('Error loading circles', 'error');
        }
    } catch (error) {
        console.error('Error loading circles for discovery:', error);
        showNotification('Error loading circles', 'error');
    }
}

function renderCircleDiscoveryModal(circles) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content discovery-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2><i class="fas fa-compass"></i> Discover Reading Circles</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                <div style="margin-bottom: 20px;">
                    <button class="btn-primary" id="createCircleFromDiscoverBtn" style="width: 100%;">
                        <i class="fas fa-plus-circle"></i> Create Your Own Circle
                    </button>
                </div>
                <div id="circleDiscoveryList">
                    ${circles && circles.length > 0 ? renderCirclesList(circles) : '<div class="empty-state"><i class="fas fa-info-circle"></i><p>No circles available yet. Be the first to create one!</p></div>'}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const createBtn = modal.querySelector('#createCircleFromDiscoverBtn');
    
    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            closeModal();
            showCreateCircleModal();
        });
    }
    
    const joinButtons = modal.querySelectorAll('.join-circle-btn');
    joinButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const circleId = btn.dataset.circleId;
            const circleName = btn.dataset.circleName;
            await requestJoinCircle(circleId, circleName, btn);
        });
    });
}

function renderCirclesList(circles) {
    if (!circles || circles.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-info-circle"></i>
                <h3>No circles available</h3>
                <p>Check back later for new reading circles!</p>
            </div>
        `;
    }
    
    return circles.map(circle => `
        <div class="circle-discovery-card" style="background: linear-gradient(135deg, rgba(139, 69, 40, 0.2), rgba(45, 24, 16, 0.3)); border: 1px solid rgba(232, 212, 192, 0.1); border-radius: 16px; padding: 20px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <div style="font-size: 40px;">${circle.icon || '📚'}</div>
                <div style="flex: 1;">
                    <h3 style="color: #fff; font-size: 18px; margin-bottom: 5px;">${escapeHtml(circle.name)}</h3>
                    <p style="color: #c4a891; font-size: 13px;">${escapeHtml(circle.description || 'No description available')}</p>
                </div>
            </div>
            <div style="display: flex; gap: 20px; margin: 15px 0; font-size: 13px; color: #a88b76;">
                <span><i class="fas fa-users"></i> ${circle.memberCount} members</span>
                <span><i class="fas fa-tag"></i> ${circle.genre}</span>
                <span><i class="fas fa-comments"></i> ${circle.threadCount || 0} discussions</span>
            </div>
            <button class="btn-join-circle join-circle-btn ${circle.isMember ? 'joined' : circle.hasPendingRequest ? 'pending' : ''}" 
                    data-circle-id="${circle.circleId}" 
                    data-circle-name="${circle.name}"
                    ${circle.isMember || circle.hasPendingRequest ? 'disabled' : ''}
                    style="width: 100%; background: rgba(139, 69, 40, 0.3); border: 1px solid rgba(232, 212, 192, 0.2); border-radius: 8px; padding: 10px 20px; color: #e8d4c0; cursor: pointer; transition: all 0.3s;">
                ${circle.isMember ? '✓ Member' : circle.hasPendingRequest ? '⏳ Request Pending' : '➕ Join Circle'}
            </button>
        </div>
    `).join('');
}

async function requestJoinCircle(circleId, circleName, button) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to join circles', 'error');
        return;
    }
    
    const message = await promptJoinMessage(circleName);
    if (message === null) return;
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    button.disabled = true;
    
    try {
        const response = await fetch(`http://localhost:5002/api/discussions/circles/${circleId}/request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Join request sent to ${circleName}!`, 'success');
            button.innerHTML = '⏳ Request Pending';
            button.classList.add('pending');
            button.disabled = true;
            
            addActivityToFeed({
                userAvatar: currentUser?.profilePicture,
                userName: currentUser?.name,
                action: `requested to join`,
                target: circleName,
                targetId: circleId,
                targetType: 'circle',
                timeAgo: 'Just now'
            });
        } else {
            showNotification(data.message || 'Error sending request', 'error');
            button.innerHTML = '➕ Join Circle';
            button.disabled = false;
        }
    } catch (error) {
        console.error('Error joining circle:', error);
        showNotification('Error sending request', 'error');
        button.innerHTML = '➕ Join Circle';
        button.disabled = false;
    }
}

function promptJoinMessage(circleName) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2><i class="fas fa-envelope"></i> Join ${escapeHtml(circleName)}</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 15px;">Tell the moderators why you'd like to join this circle (optional):</p>
                    <textarea id="joinMessageInput" class="modal-textarea" rows="4" 
                              placeholder="I'm passionate about ${circleName.toLowerCase()} and would love to connect with fellow readers..."></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary cancel-join-btn">Cancel</button>
                    <button class="btn-primary send-join-btn">Send Request</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.cancel-join-btn');
        const sendBtn = modal.querySelector('.send-join-btn');
        const textarea = modal.querySelector('#joinMessageInput');
        
        function closeModal() {
            modal.remove();
            document.body.style.overflow = '';
        }
        
        closeBtn.addEventListener('click', () => {
            closeModal();
            resolve(null);
        });
        
        cancelBtn.addEventListener('click', () => {
            closeModal();
            resolve(null);
        });
        
        sendBtn.addEventListener('click', () => {
            const message = textarea.value.trim();
            closeModal();
            resolve(message);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
                resolve(null);
            }
        });
        
        textarea.focus();
    });
}

// ===== CIRCLE CREATION FUNCTIONS =====

function showCreateCircleModal() {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to create a circle', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-plus-circle"></i> Create Reading Circle</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label><i class="fas fa-font"></i> Circle Name *</label>
                    <input type="text" id="circleName" class="modal-input" 
                           placeholder="e.g., Fantasy Book Club" maxlength="50">
                    <small style="color: #a88b76;">This will be used to create a unique URL</small>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-align-left"></i> Description *</label>
                    <textarea id="circleDescription" class="modal-textarea" rows="4" 
                              placeholder="What is this circle about? What kind of discussions will happen here?"></textarea>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Genre *</label>
                    <select id="circleGenre" class="modal-select">
                        <option value="Fantasy">Fantasy</option>
                        <option value="Mystery">Mystery</option>
                        <option value="Romance">Romance</option>
                        <option value="Sci-Fi">Sci-Fi</option>
                        <option value="Historical">Historical</option>
                        <option value="Thriller">Thriller</option>
                        <option value="Literary">Literary</option>
                        <option value="Poetry">Poetry</option>
                        <option value="Non-Fiction">Non-Fiction</option>
                        <option value="General">General</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-smile"></i> Circle Icon</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button type="button" class="icon-selector" data-icon="📚">📚</button>
                        <button type="button" class="icon-selector" data-icon="🐉">🐉</button>
                        <button type="button" class="icon-selector" data-icon="🔍">🔍</button>
                        <button type="button" class="icon-selector" data-icon="🚀">🚀</button>
                        <button type="button" class="icon-selector" data-icon="📜">📜</button>
                        <button type="button" class="icon-selector" data-icon="💕">💕</button>
                        <button type="button" class="icon-selector" data-icon="📝">📝</button>
                        <button type="button" class="icon-selector" data-icon="🏺">🏺</button>
                        <button type="button" class="icon-selector" data-icon="🔪">🔪</button>
                        <button type="button" class="icon-selector" data-icon="🎭">🎭</button>
                    </div>
                    <input type="hidden" id="circleIcon" value="📚">
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-cog"></i> Circle Settings</label>
                    <div style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 15px;">
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
                            <input type="checkbox" id="requireApproval" checked>
                            <span>Require approval for new members</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="allowMemberPosts" checked>
                            <span>Allow members to create posts</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary create-circle-btn">Create Circle</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const iconSelectors = modal.querySelectorAll('.icon-selector');
    const iconInput = modal.querySelector('#circleIcon');
    
    iconSelectors.forEach(selector => {
        selector.addEventListener('click', function() {
            iconSelectors.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            iconInput.value = this.dataset.icon;
        });
    });
    
    if (iconSelectors[0]) iconSelectors[0].classList.add('active');
    
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const createBtn = modal.querySelector('.create-circle-btn');
    
    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    createBtn.addEventListener('click', async () => {
        const name = modal.querySelector('#circleName').value.trim();
        const description = modal.querySelector('#circleDescription').value.trim();
        const genre = modal.querySelector('#circleGenre').value;
        const icon = modal.querySelector('#circleIcon').value;
        const requireApproval = modal.querySelector('#requireApproval').checked;
        const allowMemberPosts = modal.querySelector('#allowMemberPosts').checked;
        
        if (!name || !description) {
            showNotification('Please fill in circle name and description', 'error');
            return;
        }
        
        if (name.length > 50) {
            showNotification('Circle name must be less than 50 characters', 'error');
            return;
        }
        
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        createBtn.disabled = true;
        
        try {
            const token = getAuthToken();
            const response = await fetch('http://localhost:5002/api/discussions/circles/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    description,
                    genre,
                    icon,
                    settings: {
                        requireApproval,
                        allowMemberPosts
                    }
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification(`Circle "${name}" created successfully!`, 'success');
                closeModal();
                
                await loadUserCircles();
                await loadMyCreatedCircles();
                
                addActivityToFeed({
                    userAvatar: currentUser?.profilePicture,
                    userName: currentUser?.name,
                    action: 'created a new circle',
                    target: name,
                    targetId: data.circle.circleId,
                    targetType: 'circle',
                    timeAgo: 'Just now'
                });
                
                setTimeout(() => {
                    const circleSelect = document.getElementById('activeCircle');
                    if (circleSelect) {
                        const option = Array.from(circleSelect.options).find(opt => opt.value === data.circle.circleId);
                        if (option) {
                            circleSelect.value = data.circle.circleId;
                            currentCircle = data.circle.circleId;
                            updateFeedTitle();
                            loadThreads();
                            loadCircleMembers(currentCircle);
                        }
                    }
                }, 500);
            } else {
                showNotification(data.message || 'Error creating circle', 'error');
                createBtn.innerHTML = 'Create Circle';
                createBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error creating circle:', error);
            showNotification('Error creating circle. Please try again.', 'error');
            createBtn.innerHTML = 'Create Circle';
            createBtn.disabled = false;
        }
    });
}

function addMyCreatedCirclesSection() {
    const leftColumn = document.querySelector('.left-column');
    if (!leftColumn) return;
    
    if (document.getElementById('myCreatedCirclesSection')) return;
    
    const section = document.createElement('div');
    section.id = 'myCreatedCirclesSection';
    section.className = 'my-circles-section';
    section.innerHTML = `
        <h3 style="color: #fff; font-size: 16px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-crown" style="color: #ffd700;"></i> Circles I Created
        </h3>
        <div id="myCreatedCirclesList" style="display: flex; flex-direction: column; gap: 10px;">
            <div class="loading-spinner" style="text-align: center; padding: 20px;">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
        </div>
    `;
    
    leftColumn.appendChild(section);
    loadMyCreatedCircles();
}

async function loadMyCreatedCircles() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/discussions/circles/my-circles', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const container = document.getElementById('myCreatedCirclesList');
            
            if (!container) return;
            
            if (data.success && data.circles.length > 0) {
                container.innerHTML = data.circles.map(circle => `
                    <div class="my-circle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 24px;">${circle.icon}</span>
                            <div>
                                <div style="color: #fff; font-weight: 500;">${escapeHtml(circle.name)}</div>
                                <div style="color: #a88b76; font-size: 12px;">${circle.memberCount} members • ${circle.pendingRequestsCount} pending</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="manage-circle-btn" data-circle-id="${circle.circleId}" style="background: rgba(139, 69, 40, 0.3); border: none; border-radius: 6px; padding: 6px 12px; color: #e8d4c0; cursor: pointer;">
                                <i class="fas fa-cog"></i>
                            </button>
                            <button class="view-requests-btn" data-circle-id="${circle.circleId}" style="background: rgba(255, 193, 7, 0.2); border: none; border-radius: 6px; padding: 6px 12px; color: #ffc107; cursor: pointer; position: relative;">
                                <i class="fas fa-envelope"></i>
                                ${circle.pendingRequestsCount > 0 ? `<span style="position: absolute; top: -5px; right: -5px; background: #ff4444; color: white; font-size: 10px; border-radius: 10px; padding: 2px 5px;">${circle.pendingRequestsCount}</span>` : ''}
                            </button>
                        </div>
                    </div>
                `).join('');
                
                container.querySelectorAll('.manage-circle-btn').forEach(btn => {
                    btn.addEventListener('click', () => showCircleManagement(btn.dataset.circleId));
                });

                container.querySelectorAll('.view-requests-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        window.location.href = '../Circle Requests/circle-requests.html';
                    });
                });
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #a88b76;">
                        <i class="fas fa-info-circle"></i>
                        <p>You haven't created any circles yet</p>
                        <button class="btn-primary" onclick="showCreateCircleModal()" style="margin-top: 10px; padding: 8px 16px; font-size: 13px;">
                            <i class="fas fa-plus"></i> Create Your First Circle
                        </button>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading created circles:', error);
    }
}

async function showCircleManagement(circleId) {
    try {
        const token = getAuthToken();
        const response = await fetch(`http://localhost:5002/api/discussions/circles/${circleId}/manage`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load circle management data');
        
        const data = await response.json();
        
        if (data.success) {
            renderCircleManagementModal(data.circle);
        }
    } catch (error) {
        console.error('Error loading circle management:', error);
        showNotification('Error loading circle management', 'error');
    }
}

function renderCircleManagementModal(circle) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h2><i class="fas fa-cog"></i> Manage: ${escapeHtml(circle.name)}</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #fff; font-size: 18px; margin-bottom: 15px;"><i class="fas fa-users"></i> Members (${circle.members.length})</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${circle.members.map(member => `
                            <div class="member-management-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <img src="${member.user.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + member.user.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                    <div>
                                        <div style="color: #fff;">${escapeHtml(member.user.name)}</div>
                                        <div style="color: #a88b76; font-size: 12px;">@${escapeHtml(member.user.username)}</div>
                                        <div style="color: ${member.role === 'admin' ? '#ffd700' : member.role === 'moderator' ? '#4caf50' : '#a88b76'}; font-size: 12px; margin-top: 2px;">
                                            ${member.role === 'admin' ? '👑 Admin' : member.role === 'moderator' ? '⭐ Moderator' : '👤 Member'}
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    ${member.role !== 'admin' ? `
                                        <button class="manage-member-btn" data-user-id="${member.user._id}" data-action="${member.role === 'moderator' ? 'demote' : 'promote'}" style="background: rgba(139, 69, 40, 0.3); border: none; border-radius: 6px; padding: 6px 12px; color: #e8d4c0; cursor: pointer;">
                                            ${member.role === 'moderator' ? '<i class="fas fa-arrow-down"></i> Demote' : '<i class="fas fa-arrow-up"></i> Promote'}
                                        </button>
                                        <button class="remove-member-btn" data-user-id="${member.user._id}" style="background: rgba(255, 68, 68, 0.2); border: none; border-radius: 6px; padding: 6px 12px; color: #ff6b6b; cursor: pointer;">
                                            <i class="fas fa-trash"></i> Remove
                                        </button>
                                    ` : '<span style="color: #ffd700;">Circle Creator</span>'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #fff; font-size: 18px; margin-bottom: 15px;"><i class="fas fa-clock"></i> Pending Requests (${circle.pendingRequests.length})</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${circle.pendingRequests.length > 0 ? circle.pendingRequests.map(request => `
                            <div class="request-item" data-request-id="${request.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <img src="${request.user.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + request.user.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                    <div>
                                        <div style="color: #fff;">${escapeHtml(request.user.name)}</div>
                                        <div style="color: #a88b76; font-size: 12px;">@${escapeHtml(request.user.username)}</div>
                                        ${request.message ? `<div style="color: #c4a891; font-size: 12px; margin-top: 4px;">"${escapeHtml(request.message)}"</div>` : ''}
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="approve-request-btn" data-request-id="${request.id}" data-user-id="${request.user._id}" style="background: rgba(76, 175, 80, 0.2); border: none; border-radius: 6px; padding: 6px 12px; color: #4caf50; cursor: pointer;">
                                        <i class="fas fa-check"></i> Approve
                                    </button>
                                    <button class="decline-request-btn" data-request-id="${request.id}" data-user-id="${request.user._id}" style="background: rgba(255, 68, 68, 0.2); border: none; border-radius: 6px; padding: 6px 12px; color: #ff6b6b; cursor: pointer;">
                                        <i class="fas fa-times"></i> Decline
                                    </button>
                                </div>
                            </div>
                        `).join('') : '<p style="color: #a88b76; text-align: center; padding: 20px;">No pending requests</p>'}
                    </div>
                </div>
                
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #fff; font-size: 18px; margin-bottom: 15px;"><i class="fas fa-sliders-h"></i> Circle Settings</h3>
                    <div style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 15px;">
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
                            <input type="checkbox" id="manageRequireApproval" ${circle.settings.requireApproval ? 'checked' : ''}>
                            <span>Require approval for new members</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="manageAllowMemberPosts" ${circle.settings.allowMemberPosts ? 'checked' : ''}>
                            <span>Allow members to create posts</span>
                        </label>
                    </div>
                    <button id="saveSettingsBtn" class="btn-primary" style="margin-top: 15px; width: 100%;">
                        <i class="fas fa-save"></i> Save Settings
                    </button>
                </div>
                
                <div style="border-top: 1px solid rgba(232,212,192,0.1); padding-top: 20px;">
                    <button id="deleteCircleBtn" class="btn-danger" style="width: 100%; background: rgba(255, 68, 68, 0.2); border: 1px solid #ff4444; border-radius: 10px; padding: 12px; color: #ff6b6b; cursor: pointer;">
                        <i class="fas fa-trash-alt"></i> Delete Circle
                    </button>
                    <p style="color: #a88b76; font-size: 12px; margin-top: 10px; text-align: center;">
                        Warning: This will permanently delete the circle and all its threads. This action cannot be undone.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
        document.body.style.overflow = '';
    });
    
    modal.querySelectorAll('.manage-member-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            const action = btn.dataset.action;
            
            if (confirm(`Are you sure you want to ${action} this member?`)) {
                try {
                    const token = getAuthToken();
                    const url = action === 'promote' 
                        ? `http://localhost:5002/api/discussions/circles/${circle.circleId}/members/${userId}/promote`
                        : `http://localhost:5002/api/discussions/circles/${circle.circleId}/members/${userId}/demote`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification(data.message, 'success');
                        modal.remove();
                        showCircleManagement(circle.circleId);
                    } else {
                        showNotification(data.message, 'error');
                    }
                } catch (error) {
                    console.error('Error managing member:', error);
                    showNotification('Error managing member', 'error');
                }
            }
        });
    });
    
    modal.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            
            if (confirm('Are you sure you want to remove this member from the circle?')) {
                try {
                    const token = getAuthToken();
                    const response = await fetch(`http://localhost:5002/api/discussions/circles/${circle.circleId}/members/${userId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification(data.message, 'success');
                        modal.remove();
                        showCircleManagement(circle.circleId);
                    } else {
                        showNotification(data.message, 'error');
                    }
                } catch (error) {
                    console.error('Error removing member:', error);
                    showNotification('Error removing member', 'error');
                }
            }
        });
    });
    
    modal.querySelectorAll('.approve-request-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const requestId = btn.dataset.requestId;
            
            try {
                const token = getAuthToken();
                const response = await fetch(`http://localhost:5002/api/discussions/circles/${circle.circleId}/requests/${requestId}/approve`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Request approved', 'success');
                    modal.remove();
                    showCircleManagement(circle.circleId);
                    
                    const approvedUser = modal.querySelector(`.request-item[data-request-id="${requestId}"] .request-user-name`);
                    if (approvedUser) {
                        addActivityToFeed({
                            userAvatar: null,
                            userName: approvedUser.textContent,
                            action: `joined`,
                            target: circle.name,
                            targetId: circle.circleId,
                            targetType: 'circle',
                            timeAgo: 'Just now'
                        });
                    }
                } else {
                    showNotification(data.message, 'error');
                }
            } catch (error) {
                console.error('Error approving request:', error);
                showNotification('Error approving request', 'error');
            }
        });
    });
    
    modal.querySelectorAll('.decline-request-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const requestId = btn.dataset.requestId;
            
            try {
                const token = getAuthToken();
                const response = await fetch(`http://localhost:5002/api/discussions/circles/${circle.circleId}/requests/${requestId}/decline`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Request declined', 'success');
                    modal.remove();
                    showCircleManagement(circle.circleId);
                } else {
                    showNotification(data.message, 'error');
                }
            } catch (error) {
                console.error('Error declining request:', error);
                showNotification('Error declining request', 'error');
            }
        });
    });
    
    const saveSettingsBtn = modal.querySelector('#saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const requireApproval = modal.querySelector('#manageRequireApproval').checked;
            const allowMemberPosts = modal.querySelector('#manageAllowMemberPosts').checked;
            
            try {
                const token = getAuthToken();
                const response = await fetch(`http://localhost:5002/api/discussions/circles/${circle.circleId}/settings`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        settings: {
                            requireApproval,
                            allowMemberPosts
                        }
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Settings updated successfully', 'success');
                } else {
                    showNotification(data.message, 'error');
                }
            } catch (error) {
                console.error('Error saving settings:', error);
                showNotification('Error saving settings', 'error');
            }
        });
    }
    
    const deleteBtn = modal.querySelector('#deleteCircleBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await new Promise(resolve => {
                showConfirmModal('Delete Circle', '⚠️ WARNING: This will permanently delete the circle and all its threads. This action cannot be undone. Are you absolutely sure?', () => resolve(true), () => resolve(false));
            });
            if (confirmed) {
                try {
                    const token = getAuthToken();
                    const response = await fetch(`http://localhost:5002/api/discussions/circles/${circle.circleId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification('Circle deleted successfully', 'success');
                        modal.remove();
                        await loadUserCircles();
                        await loadMyCreatedCircles();
                    } else {
                        showNotification(data.message, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting circle:', error);
                    showNotification('Error deleting circle', 'error');
                }
            }
        });
    }
}

// ===== CIRCLE-ONLY THREAD MODAL =====
function showCircleThreadModal() {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to create a circle thread', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }

    // Filter to circles the user can post in
    const postableCircles = userCircles.filter(c => {
        const isPrivileged = c.role === 'admin' || c.role === 'moderator';
        return isPrivileged || c.allowMemberPosts !== false;
    });

    if (postableCircles.length === 0) {
        showNotification('You have no circles you can post in. Join or create a circle first.', 'info');
        showCircleDiscoveryModal();
        return;
    }

    // Pre-select whichever circle is active in the sidebar (if postable), else first postable
    const sidebarCircleId = document.getElementById('activeCircle')?.value;
    const defaultCircle = postableCircles.find(c => c.circleId === sidebarCircleId) || postableCircles[0];
    let circleValue = defaultCircle.circleId;
    let circleName = defaultCircle.name;

    const circleOptions = postableCircles.map(c =>
        `<option value="${escapeHtml(c.circleId)}" ${c.circleId === defaultCircle.circleId ? 'selected' : ''}>${escapeHtml(c.icon || '📚')} ${escapeHtml(c.name)} ${c.role === 'admin' ? '(Admin)' : c.role === 'moderator' ? '(Mod)' : '(Member)'}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-lock"></i> New Circle Thread</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label><i class="fas fa-users"></i> Post to Circle</label>
                    <select id="targetCircleSelect" class="modal-select" style="font-size: 15px;">
                        ${circleOptions}
                    </select>
                </div>
                <div class="circle-context-banner" id="circleContextBanner" style="background: rgba(232, 212, 192, 0.1); border-left: 4px solid #e8d4c0; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-lock"></i>
                    <strong>🔒 CIRCLE-ONLY DISCUSSION</strong> — This thread will ONLY be visible to <span id="circleNameBanner">${escapeHtml(circleName)}</span> members
                </div>
                
                <div class="form-group">
                    <label for="circleThreadType">Thread Type</label>
                    <select id="circleThreadType" class="modal-select">
                        <option value="book">📖 Book Discussion</option>
                        <option value="question">❓ Question/Help</option>
                        <option value="recommendation">📚 Recommendation Request</option>
                        <option value="poll">📊 Circle Poll</option>
                        <option value="event">🎉 Circle Event</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="circleThreadTitle">Title</label>
                    <input type="text" id="circleThreadTitle" class="modal-input" 
                           placeholder="e.g., What did you think of the ending?">
                </div>
                
                <div class="form-group">
                    <label for="circleThreadContent">Content</label>
                    <textarea id="circleThreadContent" class="modal-textarea" rows="6" 
                              placeholder="Share your thoughts with your circle members only..."></textarea>
                </div>
                
                <div id="pollOptions" style="display: none;">
                    <div class="form-group">
                        <label for="pollQuestion">Poll Question</label>
                        <input type="text" id="pollQuestion" class="modal-input" 
                               placeholder="What do you want to ask?">
                    </div>
                    <div class="form-group">
                        <label>Options</label>
                        <div id="pollOptionsList">
                            <input type="text" class="modal-input poll-option-input" 
                                   placeholder="Option 1" style="margin-bottom: 10px;">
                            <input type="text" class="modal-input poll-option-input" 
                                   placeholder="Option 2" style="margin-bottom: 10px;">
                        </div>
                        <button type="button" class="btn-secondary" id="addPollOption">
                            <i class="fas fa-plus"></i> Add Option
                        </button>
                    </div>
                </div>
                
                <div id="eventOptions" style="display: none;">
                    <div class="form-group">
                        <label><i class="fas fa-calendar-day"></i> Select Date</label>
                        <div id="circleEventCalendar" class="calendar-widget"></div>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-clock"></i> Select Time</label>
                        <div id="circleEventTimeSlots" class="time-slots"></div>
                    </div>
                    <div id="circleEventSummary" class="calendar-summary" style="display: none;">
                        <i class="fas fa-calendar-check"></i>
                        <span id="circleEventSummaryText">No date selected</span>
                    </div>
                    <div class="form-group">
                        <label for="circleEventDuration">Duration</label>
                        <select id="circleEventDuration" class="modal-select">
                            <option value="30">30 minutes</option>
                            <option value="60">1 hour</option>
                            <option value="90">1.5 hours</option>
                            <option value="120">2 hours</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="circleEventType">Event Type</label>
                        <select id="circleEventType" class="modal-select">
                            <option value="voice">🎙️ Voice Chat Discussion</option>
                            <option value="text">💬 Text Discussion</option>
                            <option value="video">📹 Video Call</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="circleTags">Tags (Optional)</label>
                    <input type="text" id="circleTags" class="modal-input" 
                           placeholder="e.g., spoiler, theory, recommendation (comma separated)">
                </div>

                <!-- Image Attachments Section -->
                <div class="form-group">
                    <label><i class="fas fa-images"></i> Attach Images (Max 4)</label>
                    <div id="imageUploadContainerCircle" class="image-upload-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;">
                        <label class="image-upload-btn" style="aspect-ratio: 1; border: 2px dashed rgba(232, 212, 192, 0.3); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s; background: rgba(0,0,0,0.1);">
                            <i class="fas fa-plus" style="font-size: 20px; color: #a88b76; margin-bottom: 5px;"></i>
                            <span style="font-size: 11px; color: #a88b76;">Add Image</span>
                            <input type="file" id="circleThreadImageInput" accept="image/*" multiple style="display: none;">
                        </label>
                    </div>
                    <div id="imagePreviewListCircle" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;"></div>
                </div>
            </div>
            <div class="modal-footer">
                <span class="circle-privacy-note">
                    <i class="fas fa-lock"></i> 🔒 Circle Members Only — NOT visible to public
                </span>
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-circle-btn">Post to Circle (Members Only)</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // ── Image Upload Handling (Circle) ───────────────────────────────────────
    const imageInput = modal.querySelector('#circleThreadImageInput');
    const imagePreviewList = modal.querySelector('#imagePreviewListCircle');
    const uploadedFiles = [];
    const censoredIndices = new Set();

    imageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (uploadedFiles.length + files.length > 4) {
            showNotification('You can only attach up to 4 images', 'warning');
            return;
        }

        files.forEach(file => {
            if (uploadedFiles.length < 4) {
                uploadedFiles.push(file);
                renderImagePreviews();
            }
        });
        imageInput.value = ''; // Reset input
    });

    function renderImagePreviews() {
        imagePreviewList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'image-preview-item';
                preview.style = `position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 2px solid ${censoredIndices.has(index) ? '#ff4444' : 'rgba(232, 212, 192, 0.3)'};`;
                preview.innerHTML = `
                    <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; ${censoredIndices.has(index) ? 'filter: blur(8px);' : ''}">
                    <button class="remove-img" data-index="${index}" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 10px;"><i class="fas fa-times"></i></button>
                    <button class="toggle-censor" data-index="${index}" style="position: absolute; bottom: 5px; left: 5px; right: 5px; background: ${censoredIndices.has(index) ? '#ff4444' : 'rgba(0,0,0,0.6)'}; color: #fff; border: none; border-radius: 4px; padding: 3px 0; cursor: pointer; font-size: 9px; font-weight: 600;">
                        <i class="fas ${censoredIndices.has(index) ? 'fa-eye' : 'fa-eye-slash'}"></i> ${censoredIndices.has(index) ? 'Censored' : 'Censor'}
                    </button>
                `;
                
                preview.querySelector('.remove-img').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    uploadedFiles.splice(index, 1);
                    const newCensors = new Set();
                    censoredIndices.forEach(idx => {
                        if (idx < index) newCensors.add(idx);
                        if (idx > index) newCensors.add(idx - 1);
                    });
                    censoredIndices.clear();
                    newCensors.forEach(idx => censoredIndices.add(idx));
                    renderImagePreviews();
                });

                preview.querySelector('.toggle-censor').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (censoredIndices.has(index)) {
                        censoredIndices.delete(index);
                    } else {
                        censoredIndices.add(index);
                    }
                    renderImagePreviews();
                });

                imagePreviewList.appendChild(preview);
            };
            reader.readAsDataURL(file);
        });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Update circleValue/circleName when user picks a different circle
    const targetCircleSelect = modal.querySelector('#targetCircleSelect');
    if (targetCircleSelect) {
        targetCircleSelect.addEventListener('change', function() {
            circleValue = this.value;
            const picked = postableCircles.find(c => c.circleId === this.value);
            circleName = picked ? picked.name : this.options[this.selectedIndex].textContent;
            const banner = modal.querySelector('#circleNameBanner');
            if (banner) banner.textContent = circleName;
        });
    }

    const typeSelect = modal.querySelector('#circleThreadType');
    const pollOptionsDiv = modal.querySelector('#pollOptions');
    const eventOptionsDiv = modal.querySelector('#eventOptions');
    
    let circleEventCal = null;
    let circleEventTimePicker = null;

    typeSelect.addEventListener('change', function() {
        pollOptionsDiv.style.display = this.value === 'poll' ? 'block' : 'none';
        const isEvent = this.value === 'event';
        eventOptionsDiv.style.display = isEvent ? 'block' : 'none';
        if (isEvent && !circleEventCal) {
            const calContainer = modal.querySelector('#circleEventCalendar');
            const timeContainer = modal.querySelector('#circleEventTimeSlots');
            const summaryEl = modal.querySelector('#circleEventSummary');
            const summaryText = modal.querySelector('#circleEventSummaryText');
            window._circleThreadEventDate = null;
            window._circleThreadEventTime = '';
            circleEventCal = initCalendar(calContainer, null, (date) => {
                window._circleThreadEventDate = date;
                if (window._circleThreadEventDate && window._circleThreadEventTime) {
                    const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
                    const ds = window._circleThreadEventDate.toLocaleDateString('en-US', opts);
                    const [h, m] = window._circleThreadEventTime.split(':').map(Number);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const hr = h % 12 || 12;
                    const ts = `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
                    summaryText.textContent = `${ds} at ${ts}`;
                    summaryEl.style.display = 'flex';
                }
            });
            circleEventTimePicker = initTimeSlots(timeContainer, '', (time) => {
                window._circleThreadEventTime = time;
                if (window._circleThreadEventDate && window._circleThreadEventTime) {
                    const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
                    const ds = window._circleThreadEventDate.toLocaleDateString('en-US', opts);
                    const [h, m] = window._circleThreadEventTime.split(':').map(Number);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const hr = h % 12 || 12;
                    const ts = `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
                    summaryText.textContent = `${ds} at ${ts}`;
                    summaryEl.style.display = 'flex';
                }
            });
        }
    });
    
    const addPollBtn = modal.querySelector('#addPollOption');
    if (addPollBtn) {
        addPollBtn.addEventListener('click', function() {
            const pollList = modal.querySelector('#pollOptionsList');
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'modal-input poll-option-input';
            newInput.placeholder = `Option ${pollList.children.length + 1}`;
            newInput.style.marginBottom = '10px';
            pollList.appendChild(newInput);
        });
    }
    
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const postBtn = modal.querySelector('.post-circle-btn');
    
    function closeModal() {
        delete window._circleThreadEventDate;
        delete window._circleThreadEventTime;
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    postBtn.addEventListener('click', async () => {
        const title = modal.querySelector('#circleThreadTitle').value.trim();
        const content = modal.querySelector('#circleThreadContent').value.trim();
        const type = typeSelect.value;
        
        if (!title || !content) {
            showNotification('Please fill in title and content', 'error');
            return;
        }
        
        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        postBtn.disabled = true;
        
        try {
            const token = getAuthToken();
            const formData = new FormData();
            formData.append('title', title);
            formData.append('content', content);
            formData.append('type', type);
            formData.append('circleId', circleValue);
            formData.append('circleName', circleName);
            formData.append('tags', modal.querySelector('#circleTags').value.split(',').map(t => t.trim()).filter(t => t).join(','));
            
            uploadedFiles.forEach(file => {
                formData.append('images', file);
            });
            formData.append('censorIndices', JSON.stringify(Array.from(censoredIndices)));
            if (type === 'poll') {
                const pollQuestion = modal.querySelector('#pollQuestion')?.value.trim();
                const pollOptions = Array.from(modal.querySelectorAll('.poll-option-input'))
                    .map(input => input.value.trim())
                    .filter(val => val);
                
                if (!pollQuestion || pollOptions.length < 2) {
                    showNotification('Please provide a poll question and at least 2 options', 'error');
                    postBtn.innerHTML = 'Post to Circle';
                    postBtn.disabled = false;
                    return;
                }
                
                formData.append('poll', JSON.stringify({ question: pollQuestion, options: pollOptions }));
            } else if (type === 'event') {
                const circleEventDate = window._circleThreadEventDate;
                const circleEventTime = window._circleThreadEventTime;
                const eventDuration = modal.querySelector('#circleEventDuration')?.value;
                const eventType = modal.querySelector('#circleEventType')?.value;
                
                if (!circleEventDate || !circleEventTime) {
                    showNotification('Please select a date and time for the event', 'error');
                    postBtn.innerHTML = 'Post to Circle';
                    postBtn.disabled = false;
                    return;
                }
                const eventDateStr = formatDatetimeLocal(circleEventDate, circleEventTime);
                formData.append('event', JSON.stringify({ date: eventDateStr, duration: parseInt(eventDuration), type: eventType }));
            }
            
            const response = await fetch('http://localhost:5002/api/discussions/circles/threads', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification(`✅ Thread posted to ${circleName}! (Circle members only)`, 'success');
                closeModal();
                currentPage = 1;
                loadThreads();
                
                addActivityToFeed({
                    userAvatar: currentUser?.profilePicture,
                    userName: currentUser?.name,
                    action: `posted in circle`,
                    target: circleName,
                    targetId: circleValue,
                    targetType: 'circle',
                    timeAgo: 'Just now'
                });
            } else {
                if (data.suspended) {
                    showContentWarningBanner(data.message, 'suspended');
                } else if (data.warningIssued) {
                    showContentWarningBanner(data.message, 'warning');
                } else {
                    showNotification(data.message || 'Error posting thread', 'error');
                }
                postBtn.innerHTML = 'Post to Circle';
                postBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error posting circle thread:', error);
            showNotification('Error posting thread. Please try again.', 'error');
            postBtn.innerHTML = 'Post to Circle';
            postBtn.disabled = false;
        }
    });
}

// ===== NEW THREAD MODAL (Public or Private) =====
// Keep old name as alias so any remaining references still work
function showPublicDiscussionModal() { showNewThreadModal('public'); }

function showNewThreadModal(defaultVisibility = 'public') {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to start a discussion', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }

    let isPublic = defaultVisibility !== 'private';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-pen"></i> Start a New Discussion</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">

                <!-- Visibility toggle -->
                <div class="form-group">
                    <label style="margin-bottom:10px; display:block;"><i class="fas fa-eye"></i> Visibility</label>
                    <div style="display:flex; gap:10px;">
                        <button type="button" id="visPublicBtn"
                            style="flex:1; padding:12px; border-radius:10px; border:2px solid #4caf50; background:rgba(76,175,80,0.2); color:#4caf50; cursor:pointer; font-weight:600; font-size:14px; transition:all 0.2s;">
                            <i class="fas fa-globe-americas"></i> Public
                            <div style="font-size:11px; font-weight:400; margin-top:3px; color:#a8d4a9;">Visible to all Litlink members</div>
                        </button>
                        <button type="button" id="visPrivateBtn"
                            style="flex:1; padding:12px; border-radius:10px; border:2px solid rgba(232,212,192,0.2); background:transparent; color:#a88b76; cursor:pointer; font-weight:600; font-size:14px; transition:all 0.2s;">
                            <i class="fas fa-user-lock"></i> Private
                            <div style="font-size:11px; font-weight:400; margin-top:3px;">Only visible to you</div>
                        </button>
                    </div>
                </div>

                <!-- Context banner (updates with toggle) -->
                <div id="visibilityBanner" style="background:rgba(76,175,80,0.1); border-left:4px solid #4caf50; padding:13px 16px; margin-bottom:20px; border-radius:8px; font-size:14px; color:#c4a891;">
                    <i class="fas fa-globe-americas"></i>
                    <strong style="color:#4caf50;">🌍 PUBLIC</strong> — This discussion will be visible to all Litlink members
                </div>

                <div class="form-group">
                    <label for="discussionCategory">Discussion Category</label>
                    <select id="discussionCategory" class="modal-select">
                        <option value="book">📚 Literary Analysis (Book)</option>
                        <option value="news">📰 Book News & Industry</option>
                        <option value="challenge">🎯 Reading Challenge</option>
                        <option value="recommendation">📖 Book Recommendations</option>
                        <option value="question">❓ Question/Help</option>
                        <option value="general">💬 General Discussion</option>
                        <option value="announcement">📢 Community Announcement</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="discussionTitle">Title</label>
                    <input type="text" id="discussionTitle" class="modal-input"
                           placeholder="Give your discussion a clear title">
                </div>

                <div class="form-group">
                    <label for="discussionContent">Content</label>
                    <textarea id="discussionContent" class="modal-textarea" rows="7"
                              placeholder="Share your thoughts, analysis, or questions..."></textarea>
                </div>

                <div class="form-group">
                    <label>Genres (Select up to 3)</label>
                    <div class="genre-selector" id="publicGenreSelector" style="display:flex; flex-wrap:wrap; gap:10px;">
                        <button type="button" class="genre-pill" data-genre="Fantasy">Fantasy</button>
                        <button type="button" class="genre-pill" data-genre="Mystery">Mystery</button>
                        <button type="button" class="genre-pill" data-genre="Romance">Romance</button>
                        <button type="button" class="genre-pill" data-genre="Sci-Fi">Sci-Fi</button>
                        <button type="button" class="genre-pill" data-genre="Historical">Historical</button>
                        <button type="button" class="genre-pill" data-genre="Thriller">Thriller</button>
                        <button type="button" class="genre-pill" data-genre="Literary">Literary</button>
                        <button type="button" class="genre-pill" data-genre="Poetry">Poetry</button>
                    </div>
                </div>

                <div class="form-group">
                    <label for="discussionTags">Tags (Optional)</label>
                    <input type="text" id="discussionTags" class="modal-input"
                           placeholder="e.g., spoiler, analysis, debate (comma separated)">
                </div>

                <!-- Image Attachments Section -->
                <div class="form-group">
                    <label><i class="fas fa-images"></i> Attach Images (Max 4)</label>
                    <div id="imageUploadContainer" class="image-upload-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;">
                        <label class="image-upload-btn" style="aspect-ratio: 1; border: 2px dashed rgba(232, 212, 192, 0.3); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s; background: rgba(0,0,0,0.1);">
                            <i class="fas fa-plus" style="font-size: 20px; color: #a88b76; margin-bottom: 5px;"></i>
                            <span style="font-size: 11px; color: #a88b76;">Add Image</span>
                            <input type="file" id="threadImageInput" accept="image/*" multiple style="display: none;">
                        </label>
                    </div>
                    <div id="imagePreviewList" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;"></div>
                    <p style="font-size: 11px; color: #a88b76; margin-top: 8px;"><i class="fas fa-info-circle"></i> Tip: You can toggle a "censor" blur for each image if it contains spoilers or sensitive content.</p>
                </div>
            </div>
            <div class="modal-footer">
                <span id="footerPrivacyNote" style="font-size:13px; color:#4caf50;">
                    <i class="fas fa-globe"></i> Public — visible to everyone
                </span>
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-discussion-btn">Publish Discussion</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // ── Visibility toggle logic ──────────────────────────────────────────────
    const visPublicBtn  = modal.querySelector('#visPublicBtn');
    const visPrivateBtn = modal.querySelector('#visPrivateBtn');
    const banner        = modal.querySelector('#visibilityBanner');
    const footerNote    = modal.querySelector('#footerPrivacyNote');

    function setVisibility(pub) {
        isPublic = pub;
        if (pub) {
            visPublicBtn.style.borderColor  = '#4caf50';
            visPublicBtn.style.background   = 'rgba(76,175,80,0.2)';
            visPublicBtn.style.color        = '#4caf50';
            visPrivateBtn.style.borderColor = 'rgba(232,212,192,0.2)';
            visPrivateBtn.style.background  = 'transparent';
            visPrivateBtn.style.color       = '#a88b76';
            banner.style.background         = 'rgba(76,175,80,0.1)';
            banner.style.borderLeftColor    = '#4caf50';
            banner.innerHTML = '<i class="fas fa-globe-americas"></i> <strong style="color:#4caf50;">🌍 PUBLIC</strong> — This discussion will be visible to all Litlink members';
            footerNote.style.color = '#4caf50';
            footerNote.innerHTML   = '<i class="fas fa-globe"></i> Public — visible to everyone';
        } else {
            visPrivateBtn.style.borderColor = '#e8a020';
            visPrivateBtn.style.background  = 'rgba(232,160,32,0.15)';
            visPrivateBtn.style.color       = '#e8a020';
            visPublicBtn.style.borderColor  = 'rgba(232,212,192,0.2)';
            visPublicBtn.style.background   = 'transparent';
            visPublicBtn.style.color        = '#a88b76';
            banner.style.background         = 'rgba(232,160,32,0.1)';
            banner.style.borderLeftColor    = '#e8a020';
            banner.innerHTML = '<i class="fas fa-user-lock"></i> <strong style="color:#e8a020;">🔒 PRIVATE</strong> — Only visible to you';
            footerNote.style.color = '#e8a020';
            footerNote.innerHTML   = '<i class="fas fa-user-lock"></i> Private — only you can see this';
        }
    }

    visPublicBtn.addEventListener('click',  () => setVisibility(true));
    visPrivateBtn.addEventListener('click', () => setVisibility(false));
    // ── Image Upload Handling ──────────────────────────────────────────────
    const imageInput = modal.querySelector('#threadImageInput');
    const imagePreviewList = modal.querySelector('#imagePreviewList');
    const uploadedFiles = [];
    const censoredIndices = new Set();

    imageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (uploadedFiles.length + files.length > 4) {
            showNotification('You can only attach up to 4 images', 'warning');
            return;
        }

        files.forEach(file => {
            if (uploadedFiles.length < 4) {
                uploadedFiles.push(file);
                renderImagePreviews();
            }
        });
        imageInput.value = ''; // Reset input
    });

    function renderImagePreviews() {
        imagePreviewList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'image-preview-item';
                preview.style = `position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 2px solid ${censoredIndices.has(index) ? '#ff4444' : 'rgba(232, 212, 192, 0.3)'};`;
                preview.innerHTML = `
                    <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; ${censoredIndices.has(index) ? 'filter: blur(8px);' : ''}">
                    <button class="remove-img" data-index="${index}" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 10px;"><i class="fas fa-times"></i></button>
                    <button class="toggle-censor" data-index="${index}" style="position: absolute; bottom: 5px; left: 5px; right: 5px; background: ${censoredIndices.has(index) ? '#ff4444' : 'rgba(0,0,0,0.6)'}; color: #fff; border: none; border-radius: 4px; padding: 3px 0; cursor: pointer; font-size: 9px; font-weight: 600;">
                        <i class="fas ${censoredIndices.has(index) ? 'fa-eye' : 'fa-eye-slash'}"></i> ${censoredIndices.has(index) ? 'Censored' : 'Censor'}
                    </button>
                `;
                
                preview.querySelector('.remove-img').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    uploadedFiles.splice(index, 1);
                    // Update censored indices
                    const newCensors = new Set();
                    censoredIndices.forEach(idx => {
                        if (idx < index) newCensors.add(idx);
                        if (idx > index) newCensors.add(idx - 1);
                    });
                    censoredIndices.clear();
                    newCensors.forEach(idx => censoredIndices.add(idx));
                    renderImagePreviews();
                });

                preview.querySelector('.toggle-censor').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (censoredIndices.has(index)) {
                        censoredIndices.delete(index);
                    } else {
                        censoredIndices.add(index);
                    }
                    renderImagePreviews();
                });

                imagePreviewList.appendChild(preview);
            };
            reader.readAsDataURL(file);
        });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Apply default on open
    setVisibility(isPublic);
    // ────────────────────────────────────────────────────────────────────────

    const selectedGenres = [];
    modal.querySelectorAll('.genre-pill').forEach(pill => {
        pill.addEventListener('click', function() {
            const genre = this.dataset.genre;
            if (this.classList.contains('active')) {
                this.classList.remove('active');
                const i = selectedGenres.indexOf(genre);
                if (i > -1) selectedGenres.splice(i, 1);
            } else {
                if (selectedGenres.length < 3) {
                    this.classList.add('active');
                    selectedGenres.push(genre);
                } else {
                    showNotification('Maximum 3 genres allowed', 'info');
                }
            }
        });
    });

    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const postBtn   = modal.querySelector('.post-discussion-btn');

    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    postBtn.addEventListener('click', async () => {
        const title    = modal.querySelector('#discussionTitle').value.trim();
        const content  = modal.querySelector('#discussionContent').value.trim();
        const category = modal.querySelector('#discussionCategory').value;

        if (!title || !content) {
            showNotification('Please fill in title and content', 'error');
            return;
        }

        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
        postBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('content', content);
            formData.append('category', category);
            // Map category to type for backend validation
            const type = ['book', 'question', 'recommendation', 'poll', 'event'].includes(category) ? category : 'book';
            formData.append('type', type);
            formData.append('isPublic', isPublic);
            formData.append('genre', selectedGenres[0] || 'General');
            formData.append('tags', modal.querySelector('#discussionTags').value.split(',').map(t => t.trim()).filter(t => t).join(','));
            
            uploadedFiles.forEach(file => {
                formData.append('images', file);
            });
            formData.append('censorIndices', JSON.stringify(Array.from(censoredIndices)));

            const response = await fetch('http://localhost:5002/api/discussions/threads', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                showNotification(
                    isPublic
                        ? '✅ Discussion published to the community! (Public)'
                        : '✅ Private discussion saved — only you can see it.',
                    'success'
                );
                closeModal();
                currentPage = 1;
                loadThreads();

                if (isPublic) {
                    addActivityToFeed({
                        userAvatar: currentUser?.profilePicture,
                        userName:   currentUser?.name,
                        action:     'started a public discussion',
                        target:     title,
                        targetId:   data.thread?._id,
                        targetType: 'thread',
                        timeAgo:    'Just now'
                    });
                }
            } else {
                if (data.suspended) {
                    showContentWarningBanner(data.message, 'suspended');
                } else if (data.warningIssued) {
                    showContentWarningBanner(data.message, 'warning');
                } else {
                    showNotification(data.message || 'Error publishing discussion', 'error');
                }
                postBtn.innerHTML = 'Publish Discussion';
                postBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error publishing discussion:', error);
            showNotification('Error publishing discussion. Please try again.', 'error');
            postBtn.innerHTML = 'Publish Discussion';
            postBtn.disabled = false;
        }
    });
}

async function handleCircleAction(action) {
    const circleSelect = document.getElementById('activeCircle');
    const selectedOption = circleSelect.selectedOptions[0];
    
    if (!selectedOption || !circleSelect.value || circleSelect.value === '') {
        showNotification('Please join a circle first', 'info');
        showCircleDiscoveryModal();
        return;
    }
    
    const circleName = selectedOption.textContent.replace(/[📚🐉🔍🚀📜💕📝🏺🔪]/g, '').trim();
    const circleValue = circleSelect.value;
    
    switch(action) {
        case 'poll':
            showQuickPollModal(circleName, circleValue);
            break;
        case 'event':
            showQuickEventModal(circleName, circleValue);
            break;
        case 'book':
            showBookSuggestionModal(circleName, circleValue);
            break;
        default:
            showNotification('Coming soon!', 'info');
    }
}

function showQuickPollModal(circleName, circleValue) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-poll"></i> Create Quick Poll</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="circle-context-banner" style="background: rgba(232, 212, 192, 0.1); border-left: 4px solid #e8d4c0; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-users"></i> 🔒 Circle-Only Poll — Posting to ${escapeHtml(circleName)}
                </div>
                
                <div class="form-group">
                    <label>Poll Question</label>
                    <input type="text" id="quickPollQuestion" class="modal-input" 
                           placeholder="e.g., Which book should we read next?">
                </div>
                
                <div class="form-group">
                    <label>Options</label>
                    <div id="quickPollOptions">
                        <input type="text" class="modal-input" placeholder="Option 1" style="margin-bottom: 10px;">
                        <input type="text" class="modal-input" placeholder="Option 2" style="margin-bottom: 10px;">
                    </div>
                    <button type="button" class="btn-secondary" id="addQuickPollOption">
                        <i class="fas fa-plus"></i> Add Option
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary create-poll-btn">Create Poll (Circle Only)</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const addOptionBtn = modal.querySelector('#addQuickPollOption');
    if (addOptionBtn) {
        addOptionBtn.addEventListener('click', function() {
            const optionsDiv = modal.querySelector('#quickPollOptions');
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'modal-input';
            newInput.placeholder = `Option ${optionsDiv.children.length + 1}`;
            newInput.style.marginBottom = '10px';
            optionsDiv.appendChild(newInput);
        });
    }
    
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const createBtn = modal.querySelector('.create-poll-btn');
    
    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    createBtn.addEventListener('click', async () => {
        const question = modal.querySelector('#quickPollQuestion').value.trim();
        const options = Array.from(modal.querySelectorAll('#quickPollOptions input'))
            .map(input => input.value.trim())
            .filter(val => val);
        
        if (!question || options.length < 2) {
            showNotification('Please provide a question and at least 2 options', 'error');
            return;
        }
        
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        createBtn.disabled = true;
        
        try {
            const token = getAuthToken();
            const response = await fetch('http://localhost:5002/api/discussions/circles/polls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    circleId: circleValue,
                    circleName: circleName,
                    question,
                    options
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Poll created successfully! (Circle members only)', 'success');
                closeModal();
                loadThreads();
                
                addActivityToFeed({
                    userAvatar: currentUser?.profilePicture,
                    userName: currentUser?.name,
                    action: `created a poll in circle`,
                    target: circleName,
                    targetId: circleValue,
                    targetType: 'circle',
                    timeAgo: 'Just now'
                });
            } else {
                showNotification(data.message || 'Error creating poll', 'error');
                createBtn.innerHTML = 'Create Poll';
                createBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error creating poll:', error);
            showNotification('Error creating poll', 'error');
            createBtn.innerHTML = 'Create Poll';
            createBtn.disabled = false;
        }
    });
}

function updateFeedTitle() {
    if (currentFeed === 'circle') {
        const circleSelect = document.getElementById('activeCircle');
        const selectedOption = circleSelect?.selectedOptions[0];
        if (selectedOption && selectedOption.value) {
            const circleName = selectedOption.textContent.replace(/[📚🐉🔍🚀📜💕📝🏺🔪]/g, '').trim();
            document.getElementById('feedTitle').textContent = circleName;
        } else {
            document.getElementById('feedTitle').textContent = 'Your Circles';
        }
    } else if (currentFeed === 'public') {
        document.getElementById('feedTitle').textContent = 'Public Discussions';
    } else {
        document.getElementById('feedTitle').textContent = 'All Activity';
    }
}

function updateFeedStartButton() {
    const existing = document.getElementById('feedStartDiscussionBar');
    if (existing) existing.remove();

    const container = document.querySelector('.threads-container');
    if (!container) return;

    const bar = document.createElement('div');
    bar.id = 'feedStartDiscussionBar';
    bar.style.cssText = 'display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;';

    if (currentFeed === 'public' || currentFeed === 'all') {
        // Public & All Activity: only Public and Private options
        bar.innerHTML = `
            <button onclick="showNewThreadModal('public')" style="flex:1; min-width:160px; background:linear-gradient(135deg,rgba(76,175,80,0.2),rgba(45,130,50,0.2)); border:2px solid rgba(76,175,80,0.4); border-radius:10px; padding:12px 20px; color:#e8d4c0; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:14px; transition:all 0.3s;">
                <i class="fas fa-globe-americas" style="color:#4caf50; font-size:18px;"></i>
                <div style="text-align:left;">
                    <div style="font-weight:600; color:#fff;">Public Discussion</div>
                    <div style="font-size:11px; color:#a8d4a9;">Visible to all members</div>
                </div>
            </button>
            <button onclick="showNewThreadModal('private')" style="flex:1; min-width:160px; background:linear-gradient(135deg,rgba(232,160,32,0.15),rgba(180,120,20,0.15)); border:2px solid rgba(232,160,32,0.35); border-radius:10px; padding:12px 20px; color:#e8d4c0; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:14px; transition:all 0.3s;">
                <i class="fas fa-user-lock" style="color:#e8a020; font-size:18px;"></i>
                <div style="text-align:left;">
                    <div style="font-weight:600; color:#fff;">Private Discussion</div>
                    <div style="font-size:11px; color:#d4b87a;">Only visible to you</div>
                </div>
            </button>
        `;
    } else if (currentFeed === 'circle') {
        // Circle feed: only Post to Circle
        const canPost = userCircles.some(c => {
            const priv = c.role === 'admin' || c.role === 'moderator';
            return priv || c.allowMemberPosts !== false;
        });
        if (!canPost) return;
        bar.innerHTML = `
            <button onclick="showCircleThreadModal()" style="flex:1; background:linear-gradient(135deg,rgba(139,69,40,0.25),rgba(45,24,16,0.25)); border:2px solid rgba(232,212,192,0.25); border-radius:10px; padding:12px 20px; color:#e8d4c0; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:14px; transition:all 0.3s;">
                <i class="fas fa-lock" style="color:#e8d4c0; font-size:18px;"></i>
                <div style="text-align:left;">
                    <div style="font-weight:600; color:#fff;">Post to a Circle</div>
                    <div style="font-size:11px; color:#a88b76;">Only visible to circle members</div>
                </div>
            </button>
        `;
    }

    container.insertAdjacentElement('beforebegin', bar);
}

async function loadThreads(searchTerm = null, append = false) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        const token = getAuthToken();
        
        if (!token) {
            renderEmptyState();
            isLoading = false;
            return;
        }
        
        const sortSelect = document.querySelector('.sort-select');
        const sort = sortSelect ? sortSelect.value.toLowerCase().replace(' ', '_') : 'latest';
        
        let url;
        if (currentFilter === 'community_picks') {
            url = 'http://localhost:5002/api/discussions/community-picks';
        } else if (currentFilter === 'recent-activity') {
            url = 'http://localhost:5002/api/discussions/recent-activity';
        } else if (currentFeed === 'circle') {
            if (!currentCircle) {
                renderEmptyState();
                isLoading = false;
                return;
            }
            url = `http://localhost:5002/api/discussions/circles/${currentCircle}/threads`;
        } else if (currentFeed === 'public') {
            url = 'http://localhost:5002/api/discussions/public';
        } else {
            url = 'http://localhost:5002/api/discussions/all';
        }
        
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            sort: sort
        });
        
        if (currentGenre !== 'All Genres') {
            params.append('genre', currentGenre);
        }
        
        if (searchTerm) {
            params.append('search', searchTerm);
        }
        
        if (currentFilter === 'my_threads' && currentUser?._id) {
            params.append('userId', currentUser._id);
        }
        
        url += url.includes('?') ? `&${params.toString()}` : `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            renderEmptyState();
            isLoading = false;
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        updateFeedStartButton();
        if (data.success) {
            if (append) {
                appendThreads(data.threads);
            } else {
                renderThreads(data.threads);
            }
            
            hasMoreThreads = data.pagination?.hasMore || false;
            
            const loadMoreBtn = document.querySelector('.load-more');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = hasMoreThreads ? 'flex' : 'none';
            }
        } else {
            renderEmptyState();
        }
    } catch (error) {
        console.error('Error loading threads:', error);
        showNotification('Error loading discussions. Please try again.', 'error');
        renderEmptyState();
    } finally {
        isLoading = false;
    }
}

function renderThreads(threads) {
    const container = document.querySelector('.threads-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!threads || threads.length === 0) {
        renderEmptyState();
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    threads.forEach((thread, index) => {
        const threadCard = createThreadCard(thread);
        if (threadCard) {
            threadCard.style.animation = `fadeIn 0.5s ease ${index * 0.1}s forwards`;
            fragment.appendChild(threadCard);
        }
    });
    
    container.appendChild(fragment);
}

function appendThreads(threads) {
    const container = document.querySelector('.threads-container');
    if (!container) return;
    
    threads.forEach((thread, index) => {
        const threadCard = createThreadCard(thread);
        if (threadCard) {
            threadCard.style.animation = `fadeIn 0.5s ease ${index * 0.1}s forwards`;
            container.appendChild(threadCard);
        }
    });
}

function createThreadCard(thread) {
    try {
        const card = document.createElement('div');
        card.className = `thread-card ${thread.isCircleThread ? 'circle-thread' : 'public-thread'}`;
        card.dataset.threadId = thread._id;
        
        const isCircleThread = thread.isCircleThread || thread.circleId;
        const contextBadge = isCircleThread 
            ? `<div class="thread-context-badge circle-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 15px; background: rgba(232, 212, 192, 0.15); border: 1px solid #e8d4c0; color: #e8d4c0;">
                <i class="fas fa-lock"></i> 🔒 ${escapeHtml(thread.circleName || 'Circle')} · Members Only
               </div>`
            : `<div class="thread-context-badge public-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 15px; background: rgba(168, 228, 192, 0.15); border: 1px solid #a8e4c0; color: #a8e4c0;">
                <i class="fas fa-globe"></i> 🌍 Public Discussion
               </div>`;
        
        const authorName = thread.author?.name || 'Anonymous';
        const authorImage = thread.author?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName)}`;
        const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt)) || 'recently';
        const content = thread.content || 'No content';
        const excerpt = content.length > 150 ? content.substring(0, 150) + '...' : content;
        
        const tagsHtml = thread.tags && thread.tags.length > 0 
            ? thread.tags.map(tag => `<span class="tag" style="background: rgba(139, 69, 40, 0.3); border: 1px solid rgba(232, 212, 192, 0.2); border-radius: 12px; padding: 4px 12px; color: #c4a891; font-size: 12px;"><i class="fas fa-hashtag"></i> ${escapeHtml(tag)}</span>`).join('')
            : '';
        
        let typeSpecificHtml = '';
        if (thread.type === 'poll' && thread.poll) {
            typeSpecificHtml = createPollPreview(thread.poll, thread._id);
        } else if (thread.type === 'event' && thread.event) {
            typeSpecificHtml = createEventPreview(thread.event);
        } else {
            typeSpecificHtml = `<div class="thread-excerpt" style="margin: 20px 0; padding: 20px; background: rgba(0, 0, 0, 0.1); border-radius: 12px; border-left: 3px solid rgba(232, 212, 192, 0.3);"><p style="color: #c4a891; font-size: 15px; line-height: 1.6;">${escapeHtml(excerpt)}</p></div>`;
        }

        // Attachments Rendering
        let attachmentsHtml = '';
        if (thread.attachments && thread.attachments.length > 0) {
            attachmentsHtml = `
                <div class="thread-attachments" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 15px 0;">
                    ${thread.attachments.map((att, idx) => `
                        <div class="attachment-item ${att.isCensored ? 'censored' : ''}" 
                             style="position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 16/9; background: #000;"
                             onclick="handleAttachmentClick(this, '${att.url}', ${att.isCensored})">
                            <img src="${att.url}" 
                                 style="width: 100%; height: 100%; object-fit: cover; transition: all 0.3s; ${att.isCensored ? 'filter: blur(20px);' : ''}"
                                 class="attachment-img">
                            ${att.isCensored ? `
                                <div class="censor-overlay" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); color: #fff; gap: 8px;">
                                    <i class="fas fa-eye-slash" style="font-size: 20px;"></i>
                                    <span style="font-size: 12px; font-weight: 600;">Censored Content</span>
                                    <span style="font-size: 10px; opacity: 0.8;">Click to reveal</span>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        // Check if current user is the author
        const isAuthor = currentUser && thread.author && (String(currentUser._id) === String(thread.author._id) || String(currentUser.id) === String(thread.author._id));
        
        card.innerHTML = `
            ${thread.isCommunityPick ? '<div class="thread-badge community-pick-badge" style="position: absolute; top: -10px; right: 25px; background: linear-gradient(135deg, #ffd700, #ffa500); color: #2d1810; padding: 6px 15px; border-radius: 20px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 10px rgba(255, 215, 0, 0.3); z-index: 5;"><i class="fas fa-star"></i> Community Pick</div>' : ''}
            ${contextBadge}
            <div class="thread-header" style="display: flex; gap: 15px; align-items: flex-start; margin-bottom: 15px;">
                <img src="${escapeHtml(authorImage)}" alt="${escapeHtml(authorName)}" class="avatar-img" style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(232, 212, 192, 0.2); object-fit: cover;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                <div class="thread-info" style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <h3 style="font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 10px; line-height: 1.4; flex: 1;">${escapeHtml(thread.title)}</h3>
                        ${isAuthor ? `
                            <div class="thread-owner-actions" style="display: flex; gap: 8px; margin-left: 10px;">
                                <button class="btn-edit-thread" onclick="editThread('${thread._id}'); event.stopPropagation();" style="background: rgba(139, 69, 40, 0.3); border: 1px solid rgba(232, 212, 192, 0.2); border-radius: 6px; padding: 6px 10px; color: #e8d4c0; cursor: pointer; font-size: 12px; transition: all 0.3s;" title="Edit post">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-delete-thread" onclick="deleteThread('${thread._id}'); event.stopPropagation();" style="background: rgba(139, 40, 40, 0.3); border: 1px solid rgba(232, 100, 100, 0.2); border-radius: 6px; padding: 6px 10px; color: #ff6b6b; cursor: pointer; font-size: 12px; transition: all 0.3s;" title="Delete post">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="thread-meta" style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center;">
                        <span class="author" style="font-size: 13px; display: flex; align-items: center; gap: 5px; color: #e8d4c0; font-weight: 500;"><i class="far fa-user"></i> ${escapeHtml(authorName)}</span>
                        <span class="time" style="font-size: 13px; display: flex; align-items: center; gap: 5px; color: #a88b76;"><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                        ${thread.type ? `<span class="${thread.type}-indicator" style="background: rgba(139, 69, 40, 0.3); border-radius: 12px; padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px;"><i class="fas ${getTypeIcon(thread.type)}"></i> ${thread.type}</span>` : ''}
                        ${tagsHtml}
                    </div>
                </div>
            </div>
            ${typeSpecificHtml}
            ${attachmentsHtml}
            <div class="thread-footer" style="display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid rgba(232, 212, 192, 0.1);">
                <div class="thread-stats" style="display: flex; gap: 25px;">
                    <span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-comment"></i> ${thread.commentCount || 0}</span>
                    <span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-heart"></i> ${thread.likeCount || 0}</span>
                    ${thread.type === 'poll' ? `<span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-vote-yea"></i> ${thread.poll?.totalVotes || 0} votes</span>` : ''}
                </div>
                <div class="thread-actions">
                    <button class="${isCircleThread ? 'btn-circle-reply' : 'btn-join-discussion'}" onclick="viewThread('${thread._id}')" style="background: rgba(139, 69, 40, 0.3); border: 1px solid rgba(232, 212, 192, 0.2); border-radius: 8px; padding: 8px 16px; color: #e8d4c0; cursor: pointer; transition: all 0.3s;">
                        ${isCircleThread ? '🔒 Reply in Circle' : '🌍 Join Discussion'}
                    </button>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                viewThread(thread._id);
            }
        });
        
        // Poll voting click handlers
        if (thread.type === 'poll' && thread.poll) {
            const pollOptions = card.querySelectorAll('.poll-clickable[data-option-index]');
            pollOptions.forEach(opt => {
                opt.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const optionIndex = parseInt(opt.dataset.optionIndex);
                    await handlePollVote(thread._id, optionIndex, card);
                });
            });
        }
        
        return card;
    } catch (error) {
        console.error('Error creating thread card:', error);
        return null;
    }
}

function createPollPreview(poll, threadId) {
    const options = poll.options || [];
    const currentUserId = getAuthUserId();
    const userVotedIndex = options.findIndex(opt => {
        if (Array.isArray(opt.votes)) {
            return opt.votes.some(v => String(v) === String(currentUserId));
        }
        if (Array.isArray(opt.voterIds)) {
            return opt.voterIds.some(v => String(v) === String(currentUserId));
        }
        return opt.userVoted === true;
    });
    const hasVoted = userVotedIndex >= 0;
    const totalVotes = poll.totalVotes || options.reduce((sum, opt) => {
        if (Array.isArray(opt.votes)) return sum + opt.votes.length;
        return sum + (opt.votes || 0);
    }, 0) || 0;
    
    function getOptionVotes(opt) {
        if (Array.isArray(opt.votes)) return opt.votes.length;
        if (typeof opt.votes === 'number') return opt.votes;
        return opt.voteCount || 0;
    }
    
    return `
        <div class="poll-preview" data-poll-thread-id="${threadId || ''}" data-poll-question="${escapeHtml(poll.question)}" style="background: rgba(0, 0, 0, 0.2); border-radius: 12px; padding: 20px; margin: 15px 0;">
            <h4 style="color: #fff; margin-bottom: 15px; font-size: 16px;">${escapeHtml(poll.question)}</h4>
            ${options.map((option, idx) => {
                const voteCount = getOptionVotes(option);
                const pct = option.percentage != null ? option.percentage : (totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0);
                return `
                <div class="poll-option ${hasVoted ? 'poll-voted' : 'poll-clickable'}" data-option-index="${idx}" 
                     style="margin-bottom: 15px; position: relative; ${!hasVoted ? 'cursor: pointer;' : ''}">
                    <span class="poll-label" style="display: block; margin-bottom: 5px; color: #e8d4c0; font-size: 14px;">
                        ${hasVoted && userVotedIndex === idx ? '<i class="fas fa-check-circle" style="color: #4caf50; margin-right: 6px;"></i>' : ''}
                        ${escapeHtml(option.text)}
                    </span>
                    <div class="poll-bar-container" style="position: relative; height: 30px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; overflow: hidden;">
                        <div class="poll-bar" style="height: 100%; background: linear-gradient(90deg, #e8d4c0, #a88b76); border-radius: 6px; transition: width 0.3s ease; width: ${pct}%;"></div>
                        <span class="poll-percentage" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #fff; font-weight: 600; font-size: 12px; z-index: 1;">${pct}% (${voteCount})</span>
                    </div>
                </div>`;
            }).join('')}
            <div class="poll-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; color: #a88b76; font-size: 13px;">
                <span>${totalVotes} votes</span>
                ${!hasVoted && threadId ? '<span style="color: #4caf50; font-size: 12px;"><i class="fas fa-hand-pointer"></i> Click an option to vote</span>' : ''}
            </div>
        </div>
    `;
}

async function handlePollVote(threadId, optionIndex, containerEl) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to vote', 'error');
        return;
    }

    try {
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/poll/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ optionIndex })
        });

        const data = await response.json();

        if (data.success) {
            const pollPreview = containerEl.querySelector('.poll-preview');
            if (pollPreview) {
                const currentUserId = getAuthUserId();
                const hasVoted = true;
                const options = data.results || [];
                const totalVotes = data.totalVotes || 0;

                pollPreview.innerHTML = createPollResultsHtml(pollPreview.dataset.pollQuestion || '', options, totalVotes, currentUserId, optionIndex);
            }
            showNotification('Vote recorded!', 'success');
        } else {
            showNotification(data.message || 'Error voting', 'error');
        }
    } catch (error) {
        console.error('Error voting in poll:', error);
        showNotification('Error voting. Please try again.', 'error');
    }
}

function createPollResultsHtml(question, results, totalVotes, currentUserId, userVotedIndex) {
    return `
        <h4 style="color: #fff; margin-bottom: 15px; font-size: 16px;">${escapeHtml(question)}</h4>
        ${results.map((opt, idx) => {
            const pct = opt.percentage || 0;
            return `
            <div class="poll-option poll-voted" style="margin-bottom: 15px; position: relative;">
                <span class="poll-label" style="display: block; margin-bottom: 5px; color: #e8d4c0; font-size: 14px;">
                    ${idx === userVotedIndex ? '<i class="fas fa-check-circle" style="color: #4caf50; margin-right: 6px;"></i>' : ''}
                    ${escapeHtml(opt.text)}
                </span>
                <div class="poll-bar-container" style="position: relative; height: 30px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; overflow: hidden;">
                    <div class="poll-bar" style="height: 100%; background: linear-gradient(90deg, #e8d4c0, #a88b76); border-radius: 6px; transition: width 0.3s ease; width: ${pct}%;"></div>
                    <span class="poll-percentage" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #fff; font-weight: 600; font-size: 12px; z-index: 1;">${pct}% (${opt.votes || 0})</span>
                </div>
            </div>`;
        }).join('')}
        <div class="poll-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; color: #a88b76; font-size: 13px;">
            <span>${totalVotes} votes</span>
        </div>
    `;
}

function createEventPreview(event) {
    const eventDate = new Date(event.date);
    const formattedDate = eventDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    
    return `
        <div class="event-preview" style="display: flex; gap: 20px; align-items: center; background: rgba(0, 0, 0, 0.2); border-radius: 12px; padding: 20px; margin: 15px 0;">
            <div class="event-date-large" style="min-width: 80px; text-align: center; background: rgba(255, 215, 0, 0.1); border: 2px solid #ffd700; border-radius: 12px; padding: 10px;">
                <span class="event-month" style="display: block; font-size: 14px; color: #ffd700; text-transform: uppercase;">${eventDate.toLocaleString('default', { month: 'short' })}</span>
                <span class="event-day" style="display: block; font-size: 28px; font-weight: 700; color: #ffd700;">${eventDate.getDate()}</span>
            </div>
            <div class="event-details-large" style="flex: 1;">
                <div class="event-meta" style="display: flex; gap: 20px; color: #c4a891; font-size: 13px; margin: 10px 0;">
                    <span><i class="fas fa-clock"></i> ${formattedDate}</span>
                    <span><i class="fas fa-microphone"></i> ${event.type || 'Voice Chat'}</span>
                </div>
            </div>
        </div>
    `;
}

function getTypeIcon(type) {
    const icons = {
        book: 'fa-book',
        question: 'fa-question-circle',
        recommendation: 'fa-bookmark',
        poll: 'fa-chart-bar',
        event: 'fa-calendar-alt'
    };
    return icons[type] || 'fa-comment';
}

function renderEmptyState() {
    const container = document.querySelector('.threads-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 60px 20px; background: rgba(139, 69, 40, 0.15); border: 1px solid rgba(232, 212, 192, 0.1); border-radius: 16px;">
            <i class="fas fa-comments" style="font-size: 48px; color: #a88b76; margin-bottom: 20px;"></i>
            <h3 style="color: #fff; margin-bottom: 10px;">No discussions yet</h3>
            <p style="color: #c4a891;">Be the first to start a discussion!</p>
        </div>
    `;
}

async function viewThread(threadId) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to view this discussion', 'info');
        return;
    }

    // Show loading modal immediately
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'threadDetailModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:750px; max-height:90vh; overflow-y:auto;">
            <div class="modal-header">
                <h2><i class="fas fa-spinner fa-spin"></i> Loading...</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" id="threadDetailBody" style="padding:30px; text-align:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px; color:#e8d4c0;"></i>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.remove();
        document.body.style.overflow = '';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; }
    });

    try {
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !data.thread) {
            modal.querySelector('#threadDetailBody').innerHTML = `<p style="color:#ff6b6b;">Could not load thread. Please try again.</p>`;
            return;
        }

        const thread = data.thread;
        const authorName = thread.author?.name || 'Unknown';
        const authorImage = thread.author?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName)}`;
        const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt));
        const isLiked = thread.likes?.includes(currentUser?._id);

        const commentsHtml = (thread.comments || []).filter(c => !c.isDeleted).map(c => {
            const cName = c.user?.name || 'Reader';
            const cImg = c.user?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cName)}`;
            const repliesHtml = (c.replies || []).filter(r => !r.isDeleted).map(r => {
                const rName = r.user?.name || 'Reader';
                const rImg = r.user?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(rName)}`;
                return `
                    <div style="display:flex;gap:10px;margin-top:12px;padding-left:20px;border-left:2px solid rgba(232,212,192,0.15);">
                        <img src="${escapeHtml(rImg)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                        <div style="flex:1;">
                            <span style="color:#e8d4c0;font-weight:600;font-size:13px;">${escapeHtml(rName)}</span>
                            <span style="color:#a88b76;font-size:12px;margin-left:8px;">${getTimeAgo(new Date(r.createdAt))}</span>
                            <p style="color:#c4a891;margin-top:5px;font-size:14px;line-height:1.5;">${escapeHtml(r.content)}</p>
                        </div>
                    </div>`;
            }).join('');
            return `
                <div class="thread-comment" data-comment-id="${c._id}" style="display:flex;gap:12px;padding:16px 0;border-bottom:1px solid rgba(232,212,192,0.08);">
                    <img src="${escapeHtml(cImg)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                            <span style="color:#e8d4c0;font-weight:600;font-size:14px;">${escapeHtml(cName)}</span>
                            <span style="color:#a88b76;font-size:12px;">${getTimeAgo(new Date(c.createdAt))}</span>
                            <button class="reply-toggle-btn" data-comment-id="${c._id}" style="background:none;border:none;color:#a88b76;font-size:12px;cursor:pointer;margin-left:auto;"><i class="fas fa-reply"></i> Reply</button>
                        </div>
                        <p style="color:#c4a891;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(c.content)}</p>
                        ${repliesHtml}
                        <div class="reply-form" data-comment-id="${c._id}" style="display:none;margin-top:10px;">
                            <div style="display:flex;gap:8px;">
                                <input type="text" class="reply-input modal-input" placeholder="Write a reply..." style="flex:1;padding:8px 12px;font-size:13px;">
                                <button class="submit-reply-btn" data-comment-id="${c._id}" style="background:rgba(139,69,40,0.5);border:1px solid rgba(232,212,192,0.2);border-radius:8px;padding:8px 14px;color:#e8d4c0;cursor:pointer;font-size:13px;">Send</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        const modalContent = modal.querySelector('.modal-content');
        modalContent.querySelector('.modal-header h2').innerHTML = `<i class="fas fa-comments"></i> Discussion`;

        modal.querySelector('#threadDetailBody').innerHTML = `
            <!-- Thread header -->
            <div style="margin-bottom:25px;">
                <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:18px;">
                    <img src="${escapeHtml(authorImage)}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid rgba(232,212,192,0.3);" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                    <div style="flex:1;">
                        <h2 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:8px;line-height:1.4;">${escapeHtml(thread.title)}</h2>
                        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
                            <span style="color:#e8d4c0;font-size:13px;font-weight:500;"><i class="far fa-user"></i> ${escapeHtml(authorName)}</span>
                            <span style="color:#a88b76;font-size:13px;"><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                            ${thread.isCircleThread ? `<span style="background:rgba(139,69,40,0.3);border:1px solid rgba(232,212,192,0.2);border-radius:20px;padding:3px 10px;font-size:12px;color:#e8d4c0;"><i class="fas fa-lock"></i> ${escapeHtml(thread.circle || 'Circle')}</span>` : `<span style="background:rgba(76,175,80,0.15);border:1px solid rgba(76,175,80,0.3);border-radius:20px;padding:3px 10px;font-size:12px;color:#4caf50;"><i class="fas fa-globe"></i> Public</span>`}
                        </div>
                    </div>
                </div>
                <div style="background:rgba(0,0,0,0.15);border-radius:12px;padding:20px;border-left:3px solid rgba(232,212,192,0.2);margin-bottom:18px;">
                    <p style="color:#d4c0ac;font-size:15px;line-height:1.8;white-space:pre-wrap;">${escapeHtml(thread.content)}</p>
                </div>
                ${thread.attachments && thread.attachments.length > 0 ? `
                <div class="thread-attachments" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:15px 0;">
                    ${thread.attachments.map((att, idx) => `
                        <div class="attachment-item ${att.isCensored ? 'censored' : ''}"
                             style="position:relative;border-radius:12px;overflow:hidden;cursor:pointer;aspect-ratio:16/9;background:#000;"
                             onclick="handleAttachmentClick(this,'${att.url}',${att.isCensored})">
                            <img src="${att.url}"
                                 style="width:100%;height:100%;object-fit:cover;transition:all 0.3s;${att.isCensored ? 'filter:blur(20px);' : ''}"
                                 class="attachment-img">
                            ${att.isCensored ? `
                                <div class="censor-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);color:#fff;gap:8px;">
                                    <i class="fas fa-eye-slash" style="font-size:20px;"></i>
                                    <span style="font-size:12px;font-weight:600;">Censored Content</span>
                                    <span style="font-size:10px;opacity:0.8;">Click to reveal</span>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>` : ''}
                ${thread.type === 'poll' && thread.poll ? createPollPreview(thread.poll, thread._id) : ''}
                ${thread.type === 'event' && thread.event ? createEventPreview(thread.event) : ''}
                ${thread.tags && thread.tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${thread.tags.map(t=>`<span style="background:rgba(139,69,40,0.25);border:1px solid rgba(232,212,192,0.15);border-radius:12px;padding:3px 10px;color:#c4a891;font-size:12px;"><i class="fas fa-hashtag"></i> ${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                <div style="display:flex;gap:20px;align-items:center;padding:14px 0;border-top:1px solid rgba(232,212,192,0.1);border-bottom:1px solid rgba(232,212,192,0.1);">
                    <button id="likeThreadBtn" data-thread-id="${thread._id}" style="background:${isLiked ? 'rgba(255,80,80,0.2)' : 'rgba(139,69,40,0.2)'};border:1px solid ${isLiked ? 'rgba(255,80,80,0.4)' : 'rgba(232,212,192,0.2)'};border-radius:8px;padding:8px 16px;color:${isLiked ? '#ff6b6b' : '#e8d4c0'};cursor:pointer;display:flex;align-items:center;gap:6px;font-size:14px;transition:all 0.2s;">
                        <i class="fas fa-heart"></i> <span id="likeCount">${thread.likeCount || 0}</span>
                    </button>
                    <span style="color:#a88b76;font-size:14px;"><i class="fas fa-eye"></i> ${thread.views || 0} views</span>
                    <span style="color:#a88b76;font-size:14px;"><i class="fas fa-comment"></i> ${thread.commentCount || 0} comments</span>
                </div>
            </div>

            <!-- Comments -->
            <div>
                <h3 style="color:#fff;font-size:16px;font-weight:600;margin-bottom:16px;"><i class="fas fa-comments"></i> Comments (${thread.commentCount || 0})</h3>
                <div style="display:flex;gap:10px;margin-bottom:20px;">
                    <img src="${escapeHtml(currentUser?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser?.name||'user')}`)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                    <div style="flex:1;display:flex;gap:8px;">
                        <input type="text" id="newCommentInput" class="modal-input" placeholder="Share your thoughts..." style="flex:1;padding:10px 14px;font-size:14px;">
                        <button id="submitCommentBtn" data-thread-id="${thread._id}" style="background:linear-gradient(135deg,rgba(139,69,40,0.7),rgba(120,60,35,0.7));border:1px solid rgba(232,212,192,0.3);border-radius:8px;padding:10px 18px;color:#fff;cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;">Post</button>
                    </div>
                </div>
                <div id="commentsList">
                    ${commentsHtml || `<div style="text-align:center;padding:30px;color:#a88b76;"><i class="fas fa-comment-slash" style="font-size:28px;margin-bottom:10px;display:block;"></i>No comments yet. Be the first!</div>`}
                </div>
            </div>
        `;

        // Like button
        modal.querySelector('#likeThreadBtn')?.addEventListener('click', async function() {
            const tid = this.dataset.threadId;
            try {
                const res = await fetch(`http://localhost:5002/api/discussions/threads/${tid}/like`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const d = await res.json();
                if (d.success) {
                    const countEl = modal.querySelector('#likeCount');
                    if (countEl) countEl.textContent = d.likeCount;
                    this.style.color = d.liked ? '#ff6b6b' : '#e8d4c0';
                    this.style.borderColor = d.liked ? 'rgba(255,80,80,0.4)' : 'rgba(232,212,192,0.2)';
                    this.style.background = d.liked ? 'rgba(255,80,80,0.2)' : 'rgba(139,69,40,0.2)';
                }
            } catch(e) { showNotification('Error liking thread', 'error'); }
        });

        // Submit comment
        modal.querySelector('#submitCommentBtn')?.addEventListener('click', async function() {
            const input = modal.querySelector('#newCommentInput');
            const content = input?.value.trim();
            if (!content) { showNotification('Please write a comment first', 'info'); return; }
            const tid = this.dataset.threadId;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            this.disabled = true;
            try {
                const res = await fetch(`http://localhost:5002/api/discussions/threads/${tid}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content })
                });
                const d = await res.json();
                if (d.success) {
                    input.value = '';
                    const cName = currentUser?.name || 'You';
                    const cImg = currentUser?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cName)}`;
                    const commentId = d.comment?._id || Date.now();
                    const newCommentHtml = `
                        <div class="thread-comment" data-comment-id="${commentId}" style="display:flex;gap:12px;padding:16px 0;border-bottom:1px solid rgba(232,212,192,0.08);">
                            <img src="${escapeHtml(cImg)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                                    <span style="color:#e8d4c0;font-weight:600;font-size:14px;">${escapeHtml(cName)}</span>
                                    <span style="color:#a88b76;font-size:12px;">Just now</span>
                                    <button class="reply-toggle-btn" data-comment-id="${commentId}" style="background:none;border:none;color:#a88b76;font-size:12px;cursor:pointer;margin-left:auto;"><i class="fas fa-reply"></i> Reply</button>
                                </div>
                                <p style="color:#c4a891;font-size:15px;line-height:1.6;margin:0;">${escapeHtml(content)}</p>
                                <div class="reply-form" data-comment-id="${commentId}" style="display:none;margin-top:10px;">
                                    <div style="display:flex;gap:8px;">
                                        <input type="text" class="reply-input modal-input" placeholder="Write a reply..." style="flex:1;padding:8px 12px;font-size:13px;">
                                        <button class="submit-reply-btn" data-comment-id="${commentId}" style="background:rgba(139,69,40,0.5);border:1px solid rgba(232,212,192,0.2);border-radius:8px;padding:8px 14px;color:#e8d4c0;cursor:pointer;font-size:13px;">Send</button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    const list = modal.querySelector('#commentsList');
                    if (list.querySelector('.fa-comment-slash')) list.innerHTML = '';
                    list.insertAdjacentHTML('afterbegin', newCommentHtml);
                    bindReplyButtons(modal, threadId, token);
                    showNotification('Comment posted!', 'success');
                    if (d.warningIssued && d.warningMessage) {
                        showContentWarningBanner(d.warningMessage, 'warning');
                    }
                } else {
                    if (d.suspended) {
                        showContentWarningBanner(d.message, 'suspended');
                    } else if (d.warningIssued) {
                        showContentWarningBanner(d.message, 'warning');
                    } else {
                        showNotification(d.message || 'Error posting comment', 'error');
                    }
                }
            } catch(e) { showNotification('Error posting comment', 'error'); }
            this.innerHTML = 'Post';
            this.disabled = false;
        });

        // Enter key on comment input
        modal.querySelector('#newCommentInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') modal.querySelector('#submitCommentBtn')?.click();
        });

        bindReplyButtons(modal, threadId, token);

        // Poll voting in detail modal
        modal.querySelectorAll('.poll-clickable[data-option-index]').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pollPreview = opt.closest('.poll-preview');
                const tid = pollPreview?.dataset.pollThreadId;
                const optionIndex = parseInt(opt.dataset.optionIndex);
                if (tid) {
                    await handlePollVote(tid, optionIndex, modal.querySelector('#threadDetailBody'));
                }
            });
        });

    } catch (error) {
        console.error('Error loading thread:', error);
        modal.querySelector('#threadDetailBody').innerHTML = `<p style="color:#ff6b6b;text-align:center;">Error loading thread. Please try again.</p>`;
    }
}

function bindReplyButtons(modal, threadId, token) {
    // Toggle reply forms
    modal.querySelectorAll('.reply-toggle-btn').forEach(btn => {
        btn.onclick = function() {
            const cid = this.dataset.commentId;
            const form = modal.querySelector(`.reply-form[data-comment-id="${cid}"]`);
            if (form) {
                const isVisible = form.style.display !== 'none';
                form.style.display = isVisible ? 'none' : 'flex';
                if (!isVisible) form.querySelector('.reply-input')?.focus();
            }
        };
    });

    // Submit reply buttons
    modal.querySelectorAll('.submit-reply-btn').forEach(btn => {
        btn.onclick = async function() {
            const cid = this.dataset.commentId;
            const form = modal.querySelector(`.reply-form[data-comment-id="${cid}"]`);
            const input = form?.querySelector('.reply-input');
            const content = input?.value.trim();
            if (!content) return;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            this.disabled = true;
            try {
                const res = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content, parentCommentId: cid })
                });
                const d = await res.json();
                if (d.success) {
                    const rName = currentUser?.name || 'You';
                    const rImg = currentUser?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(rName)}`;
                    const replyHtml = `
                        <div style="display:flex;gap:10px;margin-top:12px;padding-left:20px;border-left:2px solid rgba(232,212,192,0.15);">
                            <img src="${escapeHtml(rImg)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                            <div>
                                <span style="color:#e8d4c0;font-weight:600;font-size:13px;">${escapeHtml(rName)}</span>
                                <span style="color:#a88b76;font-size:12px;margin-left:8px;">Just now</span>
                                <p style="color:#c4a891;margin-top:5px;font-size:14px;line-height:1.5;">${escapeHtml(content)}</p>
                            </div>
                        </div>`;
                    form.insertAdjacentHTML('beforebegin', replyHtml);
                    input.value = '';
                    form.style.display = 'none';
                    showNotification('Reply posted!', 'success');
                } else { showNotification(d.message || 'Error posting reply', 'error'); }
            } catch(e) { showNotification('Error posting reply', 'error'); }
            this.innerHTML = 'Send';
            this.disabled = false;
        };
    });
}

async function loadHighlights() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/discussions/highlights', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                updateHighlights(data.highlights);
            }
        } else {
            updateHighlightsEmpty();
        }
    } catch (error) {
        console.error('Error loading highlights:', error);
        updateHighlightsEmpty();
    }
}

function updateHighlights(highlights) {
    const highlightGrid = document.getElementById('highlightsGrid');
    if (!highlightGrid) return;
    
    const hasData = highlights.mostDiscussed || highlights.trendingGenre || highlights.activeUsers > 0;
    
    if (!hasData) {
        updateHighlightsEmpty();
        return;
    }
    
    highlightGrid.innerHTML = `
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-fire"></i>
            </div>
            <div class="card-content">
                <h3>${highlights.mostDiscussed ? highlights.mostDiscussed.title : 'No discussions yet'}</h3>
                <p>${highlights.mostDiscussed ? `Most discussed topic this week with ${highlights.mostDiscussed.comments} comments` : 'Be the first to start a discussion!'}</p>
                <div class="discussion-stats">
                    ${highlights.mostDiscussed ? `
                        <span><i class="fas fa-message"></i> ${highlights.mostDiscussed.comments} comments</span>
                        <span><i class="fas fa-eye"></i> ${formatNumber(highlights.mostDiscussed.views)} views</span>
                    ` : '<span>✨ Start a discussion to see highlights</span>'}
                </div>
            </div>
        </div>
        
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-chart-line"></i>
            </div>
            <div class="card-content">
                <h3>${highlights.trendingGenre ? `Trending: ${highlights.trendingGenre.genre}` : 'No trends yet'}</h3>
                <p>${highlights.trendingGenre ? `${highlights.trendingGenre.threadCount} new threads this week` : 'Join circles to see trending genres!'}</p>
                <div class="discussion-stats">
                    ${highlights.trendingGenre ? `
                        <span><i class="fas fa-book"></i> ${highlights.trendingGenre.threadCount} new threads</span>
                        <span><i class="fas fa-fire"></i> Trending</span>
                    ` : '<span>📚 Join discussions to see trends</span>'}
                </div>
            </div>
        </div>
        
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-users"></i>
            </div>
            <div class="card-content">
                <h3>Community Activity</h3>
                <p>${highlights.activeUsers > 0 ? `${highlights.activeUsers} active readers right now` : 'No active readers at the moment'}</p>
                <div class="discussion-stats">
                    ${highlights.totalThreads > 0 ? `
                        <span><i class="fas fa-comments"></i> ${highlights.totalThreads} threads</span>
                        <span><i class="fas fa-reply"></i> ${highlights.totalComments} replies</span>
                    ` : '<span>✨ Join a circle to start reading!</span>'}
                </div>
            </div>
        </div>
    `;
}

function updateHighlightsEmpty() {
    const highlightGrid = document.getElementById('highlightsGrid');
    if (!highlightGrid) return;
    
    highlightGrid.innerHTML = `
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-plus-circle"></i>
            </div>
            <div class="card-content">
                <h3>Start a Discussion</h3>
                <p>Be the first to share your thoughts with the community!</p>
                <div class="discussion-stats">
                    <button class="btn-primary" onclick="showPublicDiscussionModal()" style="padding: 8px 16px; font-size: 13px;">
                        <i class="fas fa-plus"></i> Start Public Discussion
                    </button>
                </div>
            </div>
        </div>
        
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-users"></i>
            </div>
            <div class="card-content">
                <h3>Join a Circle</h3>
                <p>Connect with readers who share your interests!</p>
                <div class="discussion-stats">
                    <button class="btn-primary" onclick="showCircleDiscoveryModal()" style="padding: 8px 16px; font-size: 13px;">
                        <i class="fas fa-search"></i> Discover Circles
                    </button>
                </div>
            </div>
        </div>
        
        <div class="highlight-card">
            <div class="card-icon">
                <i class="fas fa-rocket"></i>
            </div>
            <div class="card-content">
                <h3>Create Your Own Circle</h3>
                <p>Start your own reading community!</p>
                <div class="discussion-stats">
                    <button class="btn-primary" onclick="showCreateCircleModal()" style="padding: 8px 16px; font-size: 13px;">
                        <i class="fas fa-plus-circle"></i> Create Circle
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function loadGenreStats() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/discussions/stats/genres', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Genre stats loaded:', data.genreStats);
            }
        }
    } catch (error) {
        console.error('Error loading genre stats:', error);
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num;
}

function getTimeAgo(date) {
    if (!date || isNaN(date.getTime())) return 'recently';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── Content warning banner ─────────────────────────────────────────────────
(function() {
    var s = document.createElement('style');
    s.textContent = [
        '@keyframes cwSlideDown {',
        '  from { transform: translateX(-50%) translateY(-20px); opacity: 0; }',
        '  to   { transform: translateX(-50%) translateY(0);     opacity: 1; }',
        '}',
        '@keyframes cwFadeOut {',
        '  to { opacity: 0; transform: translateX(-50%) translateY(-10px); }',
        '}'
    ].join('');
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
        'box-shadow:0 8px 32px rgba(0,0,0,.55)', 'display:flex',
        'align-items:flex-start', 'gap:12px', 'animation:cwSlideDown .25s ease'
    ].join(';');

    banner.innerHTML =
        '<span style="font-size:1.4rem;flex-shrink:0;line-height:1">' + p.icon + '</span>' +
        '<div style="flex:1;color:#f0dcc8;font-size:.9rem;line-height:1.55">' + message + '</div>' +
        '<button onclick="this.parentElement.remove()" style="background:none;border:none;' +
        'color:#a89070;cursor:pointer;font-size:1.1rem;padding:0 0 0 8px;flex-shrink:0">✕</button>';

    document.body.appendChild(banner);

    var dur = type === 'suspended' ? 9000 : 5500;
    setTimeout(function() {
        banner.style.animation = 'cwFadeOut .3s ease forwards';
        setTimeout(function() { banner.remove(); }, 300);
    }, dur);
}
function showNotification(message, type = 'info') {
    // Check global notification preference
    if (localStorage.getItem('notificationsEnabled') === 'false') {
        console.log('🔇 Notification suppressed (global setting OFF):', message);
        return;
    }

    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    
    notification.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(45, 24, 16, 0.95);
        border: 1px solid rgba(232, 212, 192, 0.3);
        color: #fff;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease;
        max-width: 350px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION BELL SYSTEM — inline mark-as-read, no page navigation needed
// ═══════════════════════════════════════════════════════════════════════════

const NOTIF_API = 'http://localhost:5002/api';

function formatNotifTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7)  return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
}

function refreshNotifBadge() {
    // Discussion board intentionally has no notification icon.
}

function handleAttachmentClick(element, url, isCensored) {
    if (isCensored) {
        const img = element.querySelector('.attachment-img');
        const overlay = element.querySelector('.censor-overlay');
        
        if (img.style.filter === 'blur(20px)') {
            img.style.filter = 'none';
            if (overlay) overlay.style.display = 'none';
            element.classList.remove('censored');
        } else {
            showImageLightbox(url);
        }
    } else {
        showImageLightbox(url);
    }
}

function showImageLightbox(url) {
    const existing = document.querySelector('.image-lightbox-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'image-lightbox-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px;';

    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);cursor:default;';
    img.onclick = (e) => e.stopPropagation();

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'position:fixed;top:20px;right:30px;background:none;border:none;color:#fff;font-size:36px;cursor:pointer;z-index:100001;font-family:Arial,sans-serif;line-height:1;';
    closeBtn.onclick = () => overlay.remove();

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    overlay.onclick = () => overlay.remove();

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const origOverflow = document.body.style.overflow;
    const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            document.body.style.overflow = origOverflow;
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });
}


// ═══════════════════════════════════════════════════════════════════════════
// EDIT AND DELETE THREAD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function editThread(threadId) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to edit posts', 'error');
        return;
    }

    try {
        // Fetch thread details
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !data.thread) {
            showNotification('Could not load thread details', 'error');
            return;
        }

        const thread = data.thread;

        // Create edit modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2><i class="fas fa-edit"></i> Edit Post</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="editThreadTitle">Title</label>
                        <input type="text" id="editThreadTitle" class="modal-input" value="${escapeHtml(thread.title)}">
                    </div>
                    <div class="form-group">
                        <label for="editThreadContent">Content</label>
                        <textarea id="editThreadContent" class="modal-textarea" rows="8">${escapeHtml(thread.content)}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="editThreadGenre">Genre</label>
                        <select id="editThreadGenre" class="modal-select">
                            <option value="General" ${thread.genre === 'General' ? 'selected' : ''}>General</option>
                            <option value="Fantasy" ${thread.genre === 'Fantasy' ? 'selected' : ''}>Fantasy</option>
                            <option value="Science Fiction" ${thread.genre === 'Science Fiction' ? 'selected' : ''}>Science Fiction</option>
                            <option value="Mystery" ${thread.genre === 'Mystery' ? 'selected' : ''}>Mystery</option>
                            <option value="Thriller" ${thread.genre === 'Thriller' ? 'selected' : ''}>Thriller</option>
                            <option value="Romance" ${thread.genre === 'Romance' ? 'selected' : ''}>Romance</option>
                            <option value="Horror" ${thread.genre === 'Horror' ? 'selected' : ''}>Horror</option>
                            <option value="Historical Fiction" ${thread.genre === 'Historical Fiction' ? 'selected' : ''}>Historical Fiction</option>
                            <option value="Literary Fiction" ${thread.genre === 'Literary Fiction' ? 'selected' : ''}>Literary Fiction</option>
                            <option value="Contemporary" ${thread.genre === 'Contemporary' ? 'selected' : ''}>Contemporary</option>
                            <option value="Young Adult" ${thread.genre === 'Young Adult' ? 'selected' : ''}>Young Adult</option>
                            <option value="Children's" ${thread.genre === "Children's" ? 'selected' : ''}>Children's</option>
                            <option value="Non-Fiction" ${thread.genre === 'Non-Fiction' ? 'selected' : ''}>Non-Fiction</option>
                            <option value="Biography" ${thread.genre === 'Biography' ? 'selected' : ''}>Biography</option>
                            <option value="Self-Help" ${thread.genre === 'Self-Help' ? 'selected' : ''}>Self-Help</option>
                            <option value="Poetry" ${thread.genre === 'Poetry' ? 'selected' : ''}>Poetry</option>
                            <option value="Classics" ${thread.genre === 'Classics' ? 'selected' : ''}>Classics</option>
                            <option value="Graphic Novel" ${thread.genre === 'Graphic Novel' ? 'selected' : ''}>Graphic Novel</option>
                            <option value="Manga" ${thread.genre === 'Manga' ? 'selected' : ''}>Manga</option>
                            <option value="Dystopian" ${thread.genre === 'Dystopian' ? 'selected' : ''}>Dystopian</option>
                            <option value="Adventure" ${thread.genre === 'Adventure' ? 'selected' : ''}>Adventure</option>
                            <option value="Crime" ${thread.genre === 'Crime' ? 'selected' : ''}>Crime</option>
                            <option value="Paranormal" ${thread.genre === 'Paranormal' ? 'selected' : ''}>Paranormal</option>
                            <option value="Urban Fantasy" ${thread.genre === 'Urban Fantasy' ? 'selected' : ''}>Urban Fantasy</option>
                            <option value="Epic Fantasy" ${thread.genre === 'Epic Fantasy' ? 'selected' : ''}>Epic Fantasy</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editThreadTags">Tags (comma separated)</label>
                        <input type="text" id="editThreadTags" class="modal-input" value="${thread.tags ? thread.tags.join(', ') : ''}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary cancel-btn">Cancel</button>
                    <button class="btn-primary save-btn" id="saveEditBtn">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.cancel-btn');
        const saveBtn = modal.querySelector('#saveEditBtn');

        function closeModal() {
            modal.remove();
            document.body.style.overflow = '';
        }

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        saveBtn.addEventListener('click', async () => {
            const title = document.getElementById('editThreadTitle').value.trim();
            const content = document.getElementById('editThreadContent').value.trim();
            const genre = document.getElementById('editThreadGenre').value;
            const tagsInput = document.getElementById('editThreadTags').value.trim();
            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

            if (!title || !content) {
                showNotification('Title and content are required', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const updateResponse = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ title, content, genre, tags })
                });

                const updateData = await updateResponse.json();

                if (updateData.success) {
                    showNotification('Post updated successfully!', 'success');
                    closeModal();
                    loadThreads(); // Reload threads to show updated content
                } else {
                    showNotification(updateData.message || 'Failed to update post', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                }
            } catch (error) {
                console.error('Error updating thread:', error);
                showNotification('Error updating post', 'error');
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
            }
        });

    } catch (error) {
        console.error('Error loading thread for edit:', error);
        showNotification('Error loading post details', 'error');
    }
}

async function deleteThread(threadId) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to delete posts', 'error');
        return;
    }

    const confirmed = await new Promise(resolve => {
        showConfirmModal('Delete Post', '⚠️ Are you sure you want to delete this post? This action cannot be undone.', () => resolve(true), () => resolve(false));
    });
    if (!confirmed) return;

    try {
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Post deleted successfully', 'success');
            loadThreads(); // Reload threads to remove deleted post
        } else {
            showNotification(data.message || 'Failed to delete post', 'error');
        }
    } catch (error) {
        console.error('Error deleting thread:', error);
        showNotification('Error deleting post', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR AND TIME SLOT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function initCalendar(containerEl, selectedDate, onDateChange) {
    let viewDate = selectedDate || new Date();
    let currentMonth = viewDate.getMonth();
    let currentYear = viewDate.getFullYear();

    function render() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startPad = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        let html = `
            <div class="calendar-header">
                <button class="calendar-nav-btn" data-cal-nav="prev"><i class="fas fa-chevron-left"></i></button>
                <h4>${monthNames[currentMonth]} ${currentYear}</h4>
                <button class="calendar-nav-btn" data-cal-nav="next"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="calendar-grid">
                <span class="calendar-day-header">Sun</span>
                <span class="calendar-day-header">Mon</span>
                <span class="calendar-day-header">Tue</span>
                <span class="calendar-day-header">Wed</span>
                <span class="calendar-day-header">Thu</span>
                <span class="calendar-day-header">Fri</span>
                <span class="calendar-day-header">Sat</span>`;

        for (let i = 0; i < startPad; i++) {
            html += '<div class="calendar-day empty"></div>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(currentYear, currentMonth, d);
            date.setHours(0, 0, 0, 0);
            const isToday = date.getTime() === today.getTime();
            const isSelected = selectedDate && date.getTime() === new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
            const isPast = date.getTime() < today.getTime();
            let cls = 'calendar-day';
            if (isToday) cls += ' today';
            if (isSelected) cls += ' selected';
            if (isPast) cls += ' disabled';
            html += `<div class="${cls}" data-cal-day="${d}">${d}</div>`;
        }
        html += '</div>';
        containerEl.innerHTML = html;

        containerEl.querySelector('[data-cal-nav="prev"]')?.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            render();
        });
        containerEl.querySelector('[data-cal-nav="next"]')?.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            render();
        });
        containerEl.querySelectorAll('.calendar-day:not(.empty):not(.disabled)').forEach(el => {
            el.addEventListener('click', () => {
                const d = parseInt(el.dataset.calDay);
                const newDate = new Date(currentYear, currentMonth, d);
                if (selectedDate) {
                    newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
                }
                selectedDate = newDate;
                containerEl.querySelectorAll('.calendar-day.selected').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                if (onDateChange) onDateChange(selectedDate);
            });
        });
    }
    render();
    return {
        getDate: () => selectedDate,
        setDate: (d) => { selectedDate = d; render(); }
    };
}

function initTimeSlots(containerEl, selectedTimeStr, onTimeChange) {
    let selectedTime = selectedTimeStr || '';

    const slots = {
        'Morning': ['09:00', '10:00', '11:00'],
        'Afternoon': ['12:00', '13:00', '14:00', '15:00', '16:00'],
        'Evening': ['17:00', '18:00', '19:00', '20:00', '21:00']
    };

    function formatDisplay(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
    }

    function render() {
        let html = '';
        for (const [group, times] of Object.entries(slots)) {
            html += `<span class="time-slot-group-label">${group}</span><div class="time-slot-grid">`;
            times.forEach(t => {
                const isSelected = t === selectedTime;
                html += `<div class="time-slot-btn ${isSelected ? 'selected' : ''}" data-time="${t}">${formatDisplay(t)}</div>`;
            });
            html += '</div>';
        }
        containerEl.innerHTML = html;

        containerEl.querySelectorAll('.time-slot-btn').forEach(el => {
            el.addEventListener('click', () => {
                selectedTime = el.dataset.time;
                containerEl.querySelectorAll('.time-slot-btn.selected').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                if (onTimeChange) onTimeChange(selectedTime);
            });
        });
    }
    render();
    return {
        getTime: () => selectedTime,
        setTime: (t) => { selectedTime = t; render(); }
    };
}

function formatDatetimeLocal(date, timeStr) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}T${timeStr || '12:00'}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE EVENT AND SUGGEST BOOK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function showQuickEventModal(circleName, circleValue) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to schedule events', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 550px;">
            <div class="modal-header">
                <h2><i class="fas fa-calendar-alt"></i> Schedule Circle Event</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="circle-context-banner" style="background: rgba(232, 212, 192, 0.1); border-left: 4px solid #e8d4c0; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-users"></i>
                    <strong>Circle:</strong> ${escapeHtml(circleName)}
                </div>
                
                <div class="form-group">
                    <label for="eventTitle">Event Title</label>
                    <input type="text" id="eventTitle" class="modal-input" placeholder="e.g., Book Club Discussion: Pride and Prejudice">
                </div>
                
                <div class="form-group">
                    <label for="eventDescription">Description</label>
                    <textarea id="eventDescription" class="modal-textarea" rows="4" placeholder="Describe what this event is about..."></textarea>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-calendar-day"></i> Select Date</label>
                    <div id="eventCalendarContainer" class="calendar-widget"></div>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-clock"></i> Select Time</label>
                    <div id="eventTimeSlotContainer" class="time-slots"></div>
                </div>
                
                <div id="eventCalendarSummary" class="calendar-summary" style="display: none;">
                    <i class="fas fa-calendar-check"></i>
                    <span id="eventSummaryText">No date selected</span>
                </div>
                
                <div class="form-group">
                    <label for="eventDuration">Duration</label>
                    <select id="eventDuration" class="modal-select">
                        <option value="30">30 minutes</option>
                        <option value="60" selected>1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                        <option value="180">3 hours</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="eventType">Event Type</label>
                    <select id="eventType" class="modal-select">
                        <option value="voice">🎙️ Voice Chat Discussion</option>
                        <option value="text">💬 Text Discussion</option>
                        <option value="video">📹 Video Call</option>
                        <option value="reading">📖 Group Reading Session</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary" id="createEventBtn">
                    <i class="fas fa-calendar-check"></i> Create Event
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const createBtn = modal.querySelector('#createEventBtn');
    const titleInput = modal.querySelector('#eventTitle');
    const descInput = modal.querySelector('#eventDescription');
    const durationSelect = modal.querySelector('#eventDuration');
    const typeSelect = modal.querySelector('#eventType');
    const summaryEl = modal.querySelector('#eventCalendarSummary');
    const summaryText = modal.querySelector('#eventSummaryText');

    let selectedDate = null;
    let selectedTime = '';

    const calendarContainer = modal.querySelector('#eventCalendarContainer');
    const timeSlotContainer = modal.querySelector('#eventTimeSlotContainer');

    const calendar = initCalendar(calendarContainer, null, (date) => {
        selectedDate = date;
        updateSummary();
    });

    const timeSlots = initTimeSlots(timeSlotContainer, '', (time) => {
        selectedTime = time;
        updateSummary();
    });

    function updateSummary() {
        if (selectedDate && selectedTime) {
            const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
            const dateStr = selectedDate.toLocaleDateString('en-US', options);
            const [h, m] = selectedTime.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hour = h % 12 || 12;
            const timeStr = `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
            summaryText.textContent = `${dateStr} at ${timeStr}`;
            summaryEl.style.display = 'flex';
        } else if (selectedDate) {
            summaryText.textContent = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' (select time)';
            summaryEl.style.display = 'flex';
        } else {
            summaryEl.style.display = 'none';
        }
    }

    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    createBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const description = descInput.value.trim();
        const duration = durationSelect.value;
        const eventType = typeSelect.value;

        if (!title || !description || !selectedDate || !selectedTime) {
            showNotification('Please fill in all required fields (title, description, date, and time)', 'error');
            return;
        }
        
        const eventDateStr = formatDatetimeLocal(selectedDate, selectedTime);
        const eventDt = new Date(eventDateStr);
        if (eventDt <= new Date()) {
            showNotification('Event date must be in the future', 'error');
            return;
        }

        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        try {
            const response = await fetch('http://localhost:5002/api/discussions/circles/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    content: description,
                    type: 'event',
                    circleId: circleValue,
                    circleName: circleName,
                    event: {
                        date: eventDateStr,
                        duration: parseInt(duration),
                        type: eventType
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Event scheduled successfully!', 'success');
                closeModal();
                loadThreads();
            } else {
                showNotification(data.message || 'Failed to create event', 'error');
                createBtn.disabled = false;
                createBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Create Event';
            }
        } catch (error) {
            console.error('Error creating event:', error);
            showNotification('Error creating event', 'error');
            createBtn.disabled = false;
            createBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Create Event';
        }
    });
}

function showBookSuggestionModal(circleName, circleValue) {
    const token = getAuthToken();
    if (!token) {
        showNotification('Please log in to suggest books', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 550px;">
            <div class="modal-header">
                <h2><i class="fas fa-book"></i> Suggest a Book</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="circle-context-banner" style="background: rgba(232, 212, 192, 0.1); border-left: 4px solid #e8d4c0; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-users"></i>
                    <strong>Suggesting to:</strong> ${escapeHtml(circleName)}
                </div>
                
                <div class="form-group">
                    <label for="bookTitle">Book Title</label>
                    <input type="text" id="bookTitle" class="modal-input" placeholder="e.g., The Great Gatsby">
                </div>
                
                <div class="form-group">
                    <label for="bookAuthor">Author</label>
                    <input type="text" id="bookAuthor" class="modal-input" placeholder="e.g., F. Scott Fitzgerald">
                </div>
                
                <div class="form-group">
                    <label for="bookGenre">Genre</label>
                    <select id="bookGenre" class="modal-select">
                        <option value="General">General</option>
                        <option value="Fantasy">Fantasy</option>
                        <option value="Science Fiction">Science Fiction</option>
                        <option value="Mystery">Mystery</option>
                        <option value="Thriller">Thriller</option>
                        <option value="Romance">Romance</option>
                        <option value="Horror">Horror</option>
                        <option value="Historical Fiction">Historical Fiction</option>
                        <option value="Literary Fiction">Literary Fiction</option>
                        <option value="Contemporary">Contemporary</option>
                        <option value="Young Adult">Young Adult</option>
                        <option value="Children's">Children's</option>
                        <option value="Non-Fiction">Non-Fiction</option>
                        <option value="Biography">Biography</option>
                        <option value="Self-Help">Self-Help</option>
                        <option value="Poetry">Poetry</option>
                        <option value="Classics">Classics</option>
                        <option value="Graphic Novel">Graphic Novel</option>
                        <option value="Manga">Manga</option>
                        <option value="Dystopian">Dystopian</option>
                        <option value="Adventure">Adventure</option>
                        <option value="Crime">Crime</option>
                        <option value="Paranormal">Paranormal</option>
                        <option value="Urban Fantasy">Urban Fantasy</option>
                        <option value="Epic Fantasy">Epic Fantasy</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="bookReason">Why do you recommend this book?</label>
                    <textarea id="bookReason" class="modal-textarea" rows="5" placeholder="Share why you think this book would be great for the circle..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary" id="suggestBookBtn">
                    <i class="fas fa-paper-plane"></i> Suggest Book
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const suggestBtn = modal.querySelector('#suggestBookBtn');
    const bookTitleInput = modal.querySelector('#bookTitle');
    const bookAuthorInput = modal.querySelector('#bookAuthor');
    const bookGenreSelect = modal.querySelector('#bookGenre');
    const bookReasonInput = modal.querySelector('#bookReason');

    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    suggestBtn.addEventListener('click', async () => {
        const bookTitle = bookTitleInput.value.trim();
        const bookAuthor = bookAuthorInput.value.trim();
        const bookGenre = bookGenreSelect.value;
        const bookReason = bookReasonInput.value.trim();

        if (!bookTitle || !bookAuthor || !bookReason) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }

        suggestBtn.disabled = true;
        suggestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suggesting...';

        try {
            const response = await fetch('http://localhost:5002/api/discussions/circles/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: `📚 Book Suggestion: ${bookTitle}`,
                    content: bookReason,
                    type: 'recommendation',
                    circleId: circleValue,
                    circleName: circleName,
                    genre: bookGenre,
                    bookReferences: [{
                        title: bookTitle,
                        author: bookAuthor
                    }],
                    tags: ['book-suggestion', bookGenre.toLowerCase()]
                })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Book suggestion posted successfully!', 'success');
                closeModal();
                loadThreads();
            } else {
                showNotification(data.message || 'Failed to suggest book', 'error');
                suggestBtn.disabled = false;
                suggestBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Suggest Book';
            }
        } catch (error) {
            console.error('Error suggesting book:', error);
            showNotification('Error suggesting book', 'error');
            suggestBtn.disabled = false;
            suggestBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Suggest Book';
        }
    });
}
