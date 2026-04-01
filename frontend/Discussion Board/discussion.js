// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Litlink Community Board loaded!');
    
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found - user not logged in');
        showNotification('Please log in to participate in discussions', 'info');
    }
    
    await initializePage();
    await loadUserCircles();
    setupEventListeners();
    await loadThreads();
    loadHighlights();
    loadGenreStats();
    setupWebSocket();
    initializeCommunityFeatures();
    loadNotificationCount();
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
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUserInfo();
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
        const token = localStorage.getItem('token');
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
                
                if (data.pendingRequests && data.pendingRequests.length > 0) {
                    showNotification(`You have ${data.pendingRequests.length} pending circle join request(s)`, 'info');
                }
                
                if (data.circles.length > 0) {
                    currentCircle = data.circles[0].circleId;
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
}

function setupWebSocket() {
    const token = localStorage.getItem('token');
    
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
            socket.emit('authenticate', token);
        });
        
        socket.on('connect_error', (error) => {
            console.log('⚠️ WebSocket connection error:', error.message);
        });
        
        socket.on('new-thread', (data) => {
            showNotification('New discussion: ' + data.thread.title, 'info');
            if (currentPage === 1) {
                loadThreads();
            }
        });
        
        socket.on('circle-request-approved', (data) => {
            showNotification(`✅ ${data.message}`, 'success');
            loadUserCircles();
            loadThreads();
        });
        
        socket.on('new-circle-thread', (data) => {
            if (data.circleId === currentCircle && currentFeed === 'circle') {
                loadThreads();
                showNotification(`🔔 New in ${data.circleName}: ${data.message}`, 'info');
            }
        });
        
        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
        });
    } catch (error) {
        console.error('Error setting up WebSocket:', error);
    }
}

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
    
    const createCircleBtn = document.getElementById('createCircleThreadBtn');
    if (createCircleBtn) {
        createCircleBtn.addEventListener('click', () => showCircleThreadModal());
    }
    
    const createPublicBtn = document.getElementById('createPublicDiscussionBtn');
    if (createPublicBtn) {
        createPublicBtn.addEventListener('click', () => showPublicDiscussionModal());
    }

    const startThreadBtn = document.getElementById('startThreadBtn');
    if (startThreadBtn) {
        startThreadBtn.addEventListener('click', () => showPublicDiscussionModal());
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
    
    const bellBtn = document.querySelector('.notification-btn');
    if (bellBtn) {
        bellBtn.addEventListener('click', function() {
            loadNotifications();
        });
    }
}

async function loadCircleMembers(circleId) {
    try {
        const token = localStorage.getItem('token');
        if (!token || !circleId) return;
        
        const response = await fetch(`http://localhost:5002/api/discussions/circles/${circleId}/details`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.circle.isMember) {
                const membersAvatars = document.getElementById('membersAvatars');
                const onlineCount = document.getElementById('onlineCount');
                
                if (membersAvatars && data.circle.members) {
                    const members = data.circle.members.slice(0, 5);
                    if (members.length > 0) {
                        membersAvatars.innerHTML = members.map(m => `
                            <img src="${m.user.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + m.user.name}" 
                                 class="member-avatar" 
                                 alt="${m.user.name}"
                                 title="${m.user.name}">
                        `).join('');
                        
                        if (data.circle.members.length > 5) {
                            membersAvatars.innerHTML += `<span class="more-members">+${data.circle.members.length - 5}</span>`;
                        }
                    } else {
                        membersAvatars.innerHTML = '<span class="empty-members">No members yet</span>';
                    }
                }
                
                if (onlineCount) {
                    onlineCount.textContent = `${data.circle.stats.activeToday || Math.floor(Math.random() * 20) + 5} online`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading circle members:', error);
    }
}

// ===== CIRCLE DISCOVERY FUNCTIONS =====

async function showCircleDiscoveryModal() {
    const token = localStorage.getItem('token');
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
                <div id="circleDiscoveryList">
                    ${renderCirclesList(circles)}
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
    
    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
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
    const token = localStorage.getItem('token');
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

function showCircleThreadModal() {
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Please log in to create a circle thread', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }
    
    const circleSelect = document.getElementById('activeCircle');
    const selectedOption = circleSelect.selectedOptions[0];
    
    if (!selectedOption || !circleSelect.value || circleSelect.value === '') {
        showNotification('Please join a circle first', 'info');
        showCircleDiscoveryModal();
        return;
    }
    
    const circleName = selectedOption.textContent.replace(/[📚🐉🔍🚀📜💕📝🏺🔪]/g, '').trim();
    const circleValue = circleSelect.value;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-users"></i> New Thread in ${escapeHtml(circleName)}</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="circle-context-banner" style="background: rgba(232, 212, 192, 0.1); border-left: 4px solid #e8d4c0; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-lock"></i>
                    This thread will only be visible to ${escapeHtml(circleName)} members
                </div>
                
                <div class="form-group">
                    <label for="circleThreadType">Thread Type</label>
                    <select id="circleThreadType" class="modal-select">
                        <option value="discussion">📖 Book Discussion</option>
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
                              placeholder="Share your thoughts with your circle..."></textarea>
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
                        <label for="eventDate">Event Date & Time</label>
                        <input type="datetime-local" id="eventDate" class="modal-input">
                    </div>
                    <div class="form-group">
                        <label for="eventDuration">Duration</label>
                        <select id="eventDuration" class="modal-select">
                            <option value="30">30 minutes</option>
                            <option value="60">1 hour</option>
                            <option value="90">1.5 hours</option>
                            <option value="120">2 hours</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="eventType">Event Type</label>
                        <select id="eventType" class="modal-select">
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
            </div>
            <div class="modal-footer">
                <span class="circle-privacy-note">
                    <i class="fas fa-lock"></i> Circle Members Only
                </span>
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-circle-btn">Post to Circle</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const typeSelect = modal.querySelector('#circleThreadType');
    const pollOptionsDiv = modal.querySelector('#pollOptions');
    const eventOptionsDiv = modal.querySelector('#eventOptions');
    
    typeSelect.addEventListener('change', function() {
        pollOptionsDiv.style.display = this.value === 'poll' ? 'block' : 'none';
        eventOptionsDiv.style.display = this.value === 'event' ? 'block' : 'none';
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
            const token = localStorage.getItem('token');
            const threadData = {
                title,
                content,
                type,
                circleId: circleValue,
                circleName: circleName,
                tags: modal.querySelector('#circleTags').value.split(',').map(t => t.trim()).filter(t => t)
            };
            
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
                
                threadData.poll = {
                    question: pollQuestion,
                    options: pollOptions
                };
            } else if (type === 'event') {
                const eventDate = modal.querySelector('#eventDate')?.value;
                const eventDuration = modal.querySelector('#eventDuration')?.value;
                const eventType = modal.querySelector('#eventType')?.value;
                
                if (!eventDate) {
                    showNotification('Please select an event date', 'error');
                    postBtn.innerHTML = 'Post to Circle';
                    postBtn.disabled = false;
                    return;
                }
                
                threadData.event = {
                    date: eventDate,
                    duration: eventDuration,
                    type: eventType
                };
            }
            
            const response = await fetch('http://localhost:5002/api/discussions/circles/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(threadData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification(`Thread posted to ${circleName}!`, 'success');
                closeModal();
                currentPage = 1;
                loadThreads();
            } else {
                showNotification(data.message || 'Error posting thread', 'error');
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

function showPublicDiscussionModal() {
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Please log in to start a discussion', 'error');
        setTimeout(() => {
            window.location.href = '../Login/login.html';
        }, 2000);
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-globe"></i> Start Public Discussion</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="public-context-banner" style="background: rgba(76, 175, 80, 0.1); border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
                    <i class="fas fa-globe-americas"></i>
                    This discussion will be visible to ALL Litlink members
                </div>
                
                <div class="form-group">
                    <label for="discussionCategory">Discussion Category</label>
                    <select id="discussionCategory" class="modal-select">
                        <option value="literary">📚 Literary Analysis</option>
                        <option value="news">📰 Book News & Industry</option>
                        <option value="challenge">🎯 Reading Challenge</option>
                        <option value="recommendation">📖 Book Recommendations</option>
                        <option value="general">💬 General Discussion</option>
                        <option value="announcement">📢 Community Announcement</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="discussionTitle">Title</label>
                    <input type="text" id="discussionTitle" class="modal-input" 
                           placeholder="Engaging title for the whole community">
                </div>
                
                <div class="form-group">
                    <label for="discussionContent">Content</label>
                    <textarea id="discussionContent" class="modal-textarea" rows="8" 
                              placeholder="Share your thoughts, analysis, or questions with all readers..."></textarea>
                </div>
                
                <div class="form-group">
                    <label>Genres (Select up to 3)</label>
                    <div class="genre-selector" id="publicGenreSelector" style="display: flex; flex-wrap: wrap; gap: 10px;">
                        <button type="button" class="genre-pill" data-genre="Fantasy" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Fantasy</button>
                        <button type="button" class="genre-pill" data-genre="Mystery" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Mystery</button>
                        <button type="button" class="genre-pill" data-genre="Romance" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Romance</button>
                        <button type="button" class="genre-pill" data-genre="Sci-Fi" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Sci-Fi</button>
                        <button type="button" class="genre-pill" data-genre="Historical" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Historical</button>
                        <button type="button" class="genre-pill" data-genre="Thriller" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Thriller</button>
                        <button type="button" class="genre-pill" data-genre="Literary" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Literary</button>
                        <button type="button" class="genre-pill" data-genre="Poetry" style="background: rgba(139, 69, 40, 0.2); border: 1px solid rgba(232, 212, 192, 0.15); border-radius: 20px; padding: 8px 16px; color: #c4a891; cursor: pointer;">Poetry</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="discussionTags">Tags (Optional)</label>
                    <input type="text" id="discussionTags" class="modal-input" 
                           placeholder="e.g., spoiler, analysis, debate (comma separated)">
                </div>
            </div>
            <div class="modal-footer">
                <span class="public-privacy-note">
                    <i class="fas fa-globe"></i> Public - Everyone can see
                </span>
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-discussion-btn">Publish to Community</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const selectedGenres = [];
    const genrePills = modal.querySelectorAll('.genre-pill');
    genrePills.forEach(pill => {
        pill.addEventListener('click', function() {
            const genre = this.dataset.genre;
            if (this.classList.contains('active')) {
                this.classList.remove('active');
                const index = selectedGenres.indexOf(genre);
                if (index > -1) selectedGenres.splice(index, 1);
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
    const postBtn = modal.querySelector('.post-discussion-btn');
    
    function closeModal() {
        modal.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    postBtn.addEventListener('click', async () => {
        const title = modal.querySelector('#discussionTitle').value.trim();
        const content = modal.querySelector('#discussionContent').value.trim();
        const category = modal.querySelector('#discussionCategory').value;
        
        if (!title || !content) {
            showNotification('Please fill in title and content', 'error');
            return;
        }
        
        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
        postBtn.disabled = true;
        
        try {
            const token = localStorage.getItem('token');
            const discussionData = {
                title,
                content,
                category,
                genre: selectedGenres[0] || 'General',
                tags: modal.querySelector('#discussionTags').value.split(',').map(t => t.trim()).filter(t => t)
            };
            
            const response = await fetch('http://localhost:5002/api/discussions/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(discussionData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Discussion published to community!', 'success');
                closeModal();
                currentPage = 1;
                if (currentFeed === 'public' || currentFeed === 'all') {
                    loadThreads();
                }
            } else {
                showNotification(data.message || 'Error publishing discussion', 'error');
                postBtn.innerHTML = 'Publish to Community';
                postBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error publishing discussion:', error);
            showNotification('Error publishing discussion. Please try again.', 'error');
            postBtn.innerHTML = 'Publish to Community';
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
                    <i class="fas fa-users"></i> Posting to ${escapeHtml(circleName)}
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
                <button class="btn-primary create-poll-btn">Create Poll</button>
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
            const token = localStorage.getItem('token');
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
                showNotification('Poll created successfully!', 'success');
                closeModal();
                loadThreads();
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

function showQuickEventModal(circleName, circleValue) {
    showNotification(`Schedule an event in ${circleName} - Coming soon!`, 'info');
}

function showBookSuggestionModal(circleName, circleValue) {
    showNotification(`Suggest a book to ${circleName} - Coming soon!`, 'info');
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

async function loadThreads(searchTerm = null, append = false) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        const token = localStorage.getItem('token');
        
        if (!token) {
            renderEmptyState();
            isLoading = false;
            return;
        }
        
        const sortSelect = document.querySelector('.sort-select');
        const sort = sortSelect ? sortSelect.value.toLowerCase().replace(' ', '_') : 'latest';
        
        let url;
        if (currentFeed === 'circle') {
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
        } else if (currentFilter === 'community_picks') {
            params.append('featured', 'true');
        }
        
        url += `?${params.toString()}`;
        
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
                <i class="fas fa-users"></i> ${escapeHtml(thread.circleName || 'Circle')} · Members Only
               </div>`
            : `<div class="thread-context-badge public-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 15px; background: rgba(168, 228, 192, 0.15); border: 1px solid #a8e4c0; color: #a8e4c0;">
                <i class="fas fa-globe"></i> Public Discussion
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
            typeSpecificHtml = createPollPreview(thread.poll);
        } else if (thread.type === 'event' && thread.event) {
            typeSpecificHtml = createEventPreview(thread.event);
        } else {
            typeSpecificHtml = `<div class="thread-excerpt" style="margin: 20px 0; padding: 20px; background: rgba(0, 0, 0, 0.1); border-radius: 12px; border-left: 3px solid rgba(232, 212, 192, 0.3);"><p style="color: #c4a891; font-size: 15px; line-height: 1.6;">${escapeHtml(excerpt)}</p></div>`;
        }
        
        card.innerHTML = `
            ${thread.isFeatured ? '<div class="thread-badge" style="position: absolute; top: -10px; right: 25px; background: linear-gradient(135deg, #ffd700, #ffa500); color: #2d1810; padding: 6px 15px; border-radius: 20px; font-size: 12px; font-weight: 600;"><i class="fas fa-crown"></i> Community Pick</div>' : ''}
            ${contextBadge}
            <div class="thread-header" style="display: flex; gap: 15px; align-items: flex-start; margin-bottom: 15px;">
                <img src="${escapeHtml(authorImage)}" alt="${escapeHtml(authorName)}" class="avatar-img" style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(232, 212, 192, 0.2); object-fit: cover;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                <div class="thread-info" style="flex: 1;">
                    <h3 style="font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 10px; line-height: 1.4;">${escapeHtml(thread.title)}</h3>
                    <div class="thread-meta" style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center;">
                        <span class="author" style="font-size: 13px; display: flex; align-items: center; gap: 5px; color: #e8d4c0; font-weight: 500;"><i class="far fa-user"></i> ${escapeHtml(authorName)}</span>
                        <span class="time" style="font-size: 13px; display: flex; align-items: center; gap: 5px; color: #a88b76;"><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                        ${thread.type ? `<span class="${thread.type}-indicator" style="background: rgba(139, 69, 40, 0.3); border-radius: 12px; padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px;"><i class="fas ${getTypeIcon(thread.type)}"></i> ${thread.type}</span>` : ''}
                        ${tagsHtml}
                    </div>
                </div>
            </div>
            ${typeSpecificHtml}
            <div class="thread-footer" style="display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid rgba(232, 212, 192, 0.1);">
                <div class="thread-stats" style="display: flex; gap: 25px;">
                    <span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-comment"></i> ${thread.commentCount || 0}</span>
                    <span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-heart"></i> ${thread.likeCount || 0}</span>
                    ${thread.type === 'poll' ? `<span class="stat" style="color: #a88b76; font-size: 14px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-vote-yea"></i> ${thread.poll?.totalVotes || 0} votes</span>` : ''}
                </div>
                <div class="thread-actions">
                    <button class="${isCircleThread ? 'btn-circle-reply' : 'btn-join-discussion'}" onclick="viewThread('${thread._id}')" style="background: rgba(139, 69, 40, 0.3); border: 1px solid rgba(232, 212, 192, 0.2); border-radius: 8px; padding: 8px 16px; color: #e8d4c0; cursor: pointer; transition: all 0.3s;">
                        ${isCircleThread ? 'Reply in Circle' : 'Join Discussion'}
                    </button>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                viewThread(thread._id);
            }
        });
        
        return card;
    } catch (error) {
        console.error('Error creating thread card:', error);
        return null;
    }
}

function createPollPreview(poll) {
    const totalVotes = poll.totalVotes || poll.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;
    const options = poll.options || [];
    
    return `
        <div class="poll-preview" style="background: rgba(0, 0, 0, 0.2); border-radius: 12px; padding: 20px; margin: 15px 0;">
            <h4 style="color: #fff; margin-bottom: 15px; font-size: 16px;">${escapeHtml(poll.question)}</h4>
            ${options.map(option => `
                <div class="poll-option" style="margin-bottom: 15px; position: relative;">
                    <span class="poll-label" style="display: block; margin-bottom: 5px; color: #e8d4c0; font-size: 14px;">${escapeHtml(option.text)}</span>
                    <div class="poll-bar-container" style="position: relative; height: 30px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; overflow: hidden;">
                        <div class="poll-bar" style="height: 100%; background: linear-gradient(90deg, #e8d4c0, #a88b76); border-radius: 6px; transition: width 0.3s ease; width: ${option.percentage || 0}%;"></div>
                        <span class="poll-percentage" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #fff; font-weight: 600; font-size: 12px; z-index: 1;">${option.percentage || 0}%</span>
                    </div>
                </div>
            `).join('')}
            <div class="poll-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; color: #a88b76; font-size: 13px;">
                <span>${totalVotes} votes</span>
            </div>
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
        discussion: 'fa-book-open',
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
            <button class="btn-primary" onclick="showPublicDiscussionModal()" style="margin-top: 20px; background: linear-gradient(135deg, rgba(139, 69, 40, 0.8), rgba(120, 60, 35, 0.8)); border: 1px solid rgba(232, 212, 192, 0.3); border-radius: 10px; padding: 12px 25px; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer;">
                <i class="fas fa-plus"></i> Start a Discussion
            </button>
        </div>
    `;
}

function viewThread(threadId) {
    sessionStorage.setItem('currentThreadId', threadId);
    window.location.href = `thread-detail.html?id=${threadId}`;
}

async function loadHighlights() {
    try {
        const token = localStorage.getItem('token');
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
        }
    } catch (error) {
        console.error('Error loading highlights:', error);
    }
}

function updateHighlights(highlights) {
    const highlightCards = document.querySelectorAll('.highlight-card');
    
    if (highlightCards.length >= 3) {
        if (highlights.mostDiscussed) {
            const mostDiscussedCard = highlightCards[0];
            const titleEl = mostDiscussedCard.querySelector('h3');
            const descEl = mostDiscussedCard.querySelector('p');
            const statsEl = mostDiscussedCard.querySelector('.discussion-stats');
            
            if (titleEl) titleEl.textContent = 'Most Discussed';
            if (descEl) descEl.textContent = highlights.mostDiscussed.title || 'No recent discussions';
            if (statsEl) {
                statsEl.innerHTML = `
                    <span><i class="fas fa-message"></i> ${highlights.mostDiscussed.comments || 0} comments</span>
                    <span><i class="fas fa-eye"></i> ${formatNumber(highlights.mostDiscussed.views || 0)} views</span>
                `;
            }
        }
        
        if (highlights.trendingGenre) {
            const trendingCard = highlightCards[1];
            const titleEl = trendingCard.querySelector('h3');
            const descEl = trendingCard.querySelector('p');
            const statsEl = trendingCard.querySelector('.discussion-stats');
            
            if (titleEl) titleEl.textContent = `Trending: ${highlights.trendingGenre.genre}`;
            if (descEl) descEl.textContent = `${highlights.trendingGenre.threadCount} new threads this week`;
            if (statsEl) {
                statsEl.innerHTML = `
                    <span><i class="fas fa-book"></i> ${highlights.trendingGenre.threadCount || 0} new threads</span>
                    <span><i class="fas fa-fire"></i> Trending</span>
                `;
            }
        }
        
        if (highlights.activeUsers) {
            const activeCard = highlightCards[2];
            const descEl = activeCard.querySelector('p');
            const statsEl = activeCard.querySelector('.discussion-stats');
            
            if (descEl) descEl.textContent = `${highlights.activeUsers} active readers right now`;
            if (statsEl) {
                statsEl.innerHTML = `
                    <span><i class="fas fa-users"></i> ${highlights.activeUsers || 0} active users</span>
                    <span><i class="fas fa-bolt"></i> Active Now</span>
                `;
            }
        }
    }
}

async function loadGenreStats() {
    try {
        const token = localStorage.getItem('token');
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

function initializeCommunityFeatures() {
    // Placeholder for future features
}

async function loadNotificationCount() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('http://localhost:5002/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const unread = (data.notifications || []).filter(n => !n.isRead).length;
            const notificationBtn = document.querySelector('.notification-btn');
            if (notificationBtn) {
                const existing = notificationBtn.querySelector('.notification-badge');
                if (existing) existing.remove();
                if (unread > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'notification-badge';
                    badge.textContent = unread > 99 ? '99+' : unread;
                    notificationBtn.appendChild(badge);
                }
            }
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
    }
}

async function loadNotifications() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/notifications', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotificationsModal(data.notifications);
            
            const badge = document.querySelector('.notification-badge');
            if (badge) badge.remove();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function showNotificationsModal(notifications) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-bell"></i> Notifications</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                ${notifications && notifications.length > 0 
                    ? notifications.map(n => `
                        <div class="notification-item ${!n.isRead ? 'unread' : ''}" style="padding: 12px; border-bottom: 1px solid rgba(232,212,192,0.1);">
                            <div style="display: flex; gap: 10px;">
                                <i class="fas ${n.icon || 'fa-info-circle'}" style="color: #e8d4c0;"></i>
                                <div style="flex: 1;">
                                    <h4 style="color: #fff; margin-bottom: 5px;">${escapeHtml(n.title)}</h4>
                                    <p style="color: #c4a891; font-size: 14px;">${escapeHtml(n.message)}</p>
                                    <small style="color: #a88b76;">${n.formattedTime || getTimeAgo(new Date(n.createdAt))}</small>
                                </div>
                            </div>
                        </div>
                    `).join('')
                    : '<p style="color: #a88b76; text-align: center; padding: 20px;">No notifications</p>'
                }
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
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });
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

function showNotification(message, type = 'info') {
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