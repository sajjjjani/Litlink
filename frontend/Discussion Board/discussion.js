// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Litlink Community Board loaded!');
    
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found - user not logged in');
        showNotification('Please log in to participate in discussions', 'info');
    }
    
    // Initialize the page
    initializePage();
    setupEventListeners();
    loadThreads();
    loadHighlights();
    loadGenreStats();
    setupWebSocket();
    initializeCommunityFeatures();
    
    // Load real notification count
    loadNotificationCount();
});

// Global variables
let currentUser = null;
let currentPage = 1;
let currentFilter = 'recent';
let currentGenre = 'All Genres';
let currentCircle = 'fantasy';
let currentFeed = 'circle'; // 'circle', 'public', or 'all'
let searchTimeout = null;
let socket = null;
let isLoading = false;
let hasMoreThreads = true;

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
        
        socket.on('new-comment', (data) => {
            if (data.threadId === getCurrentThreadId()) {
                loadThread(data.threadId);
            }
        });
        
        socket.on('circle-activity', (data) => {
            if (data.circleId === currentCircle) {
                showNotification(`🔔 New in ${data.circleName}: ${data.message}`, 'info');
                if (currentFeed === 'circle') {
                    loadThreads();
                }
            }
        });
        
        socket.on('new-circle-thread', (data) => {
            if (data.circleId === currentCircle && currentFeed === 'circle') {
                loadThreads();
            }
        });
        
        socket.on('community-activity', (data) => {
            addActivityToFeed(data.activity);
        });
        
        socket.on('reader-online', (data) => {
            updateActiveReaderCount(data.count);
        });
        
        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
        });
    } catch (error) {
        console.error('Error setting up WebSocket:', error);
    }
}

function addActivityToFeed(activity) {
    const feedContainer = document.querySelector('.feed-scroll');
    if (!feedContainer) return;
    
    const activityElement = document.createElement('div');
    activityElement.className = 'feed-item';
    activityElement.style.animation = 'slideIn 0.3s ease';
    activityElement.innerHTML = `
        <img src="${activity.userAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + activity.user}" class="feed-avatar">
        <div class="feed-content">
            <span class="feed-user">${escapeHtml(activity.user)}</span> ${escapeHtml(activity.action)} 
            <a href="#" class="feed-link">"${escapeHtml(activity.target)}"</a>
            <span class="feed-time">just now</span>
        </div>
    `;
    
    feedContainer.insertBefore(activityElement, feedContainer.firstChild);
    
    // Keep only last 6 activities
    while (feedContainer.children.length > 6) {
        feedContainer.removeChild(feedContainer.lastChild);
    }
}

function updateActiveReaderCount(count) {
    const liveBadge = document.querySelector('.live-badge');
    if (liveBadge) {
        liveBadge.textContent = `🔴 ${count} online`;
    }
}

function setupEventListeners() {
    // Circle selector
    const circleSelect = document.getElementById('activeCircle');
    if (circleSelect) {
        circleSelect.addEventListener('change', function() {
            currentCircle = this.value;
            updateCircleName();
            currentPage = 1;
            loadThreads();
        });
    }
    
    // Create Circle Thread button
    const createCircleBtn = document.getElementById('createCircleThreadBtn');
    if (createCircleBtn) {
        createCircleBtn.addEventListener('click', () => showCircleThreadModal());
    }
    
    // Create Public Discussion button
    const createPublicBtn = document.getElementById('createPublicDiscussionBtn');
    if (createPublicBtn) {
        createPublicBtn.addEventListener('click', () => showPublicDiscussionModal());
    }

    // "Start a New Thread" CTA button (bottom of page)
    const startThreadBtn = document.getElementById('startThreadBtn');
    if (startThreadBtn) {
        startThreadBtn.addEventListener('click', () => showPublicDiscussionModal());
    }
    
    // Feed toggle buttons
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
    
    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            handleCircleAction(action);
        });
    });
    
    // Filter options
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
    
    // Genre tags
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
            
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
            
            currentPage = 1;
            loadThreads();
        });
    });
    
    // Search functionality
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
    
    // Sort select
    const sortSelect = document.querySelector('.sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentPage = 1;
            loadThreads();
        });
    }
    
    // Load more button
    const loadMoreBtn = document.querySelector('.load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            if (!isLoading && hasMoreThreads) {
                currentPage++;
                loadThreads(null, true);
            }
        });
    }
    
    // Notification bell
    const bellBtn = document.querySelector('.notification-btn');
    if (bellBtn) {
        bellBtn.addEventListener('click', function() {
            this.style.transform = 'rotate(15deg)';
            setTimeout(() => {
                this.style.transform = 'rotate(-15deg)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 150);
            }, 150);
            
            loadNotifications();
        });
    }
    
    // View all button
    const viewAllBtn = document.querySelector('.view-all');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', function() {
            document.querySelector('.threads-container').scrollIntoView({ 
                behavior: 'smooth' 
            });
        });
    }
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
    const circleName = circleSelect ? circleSelect.selectedOptions[0].text : 'Fantasy Readers';
    const circleValue = circleSelect ? circleSelect.value : 'fantasy';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-users"></i> New Thread in ${escapeHtml(circleName)}</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="circle-context-banner">
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
                
                <!-- Poll Options -->
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
                
                <!-- Event Options -->
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
                            <option value="hybrid">🔄 Hybrid (Voice + Text)</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="relatedBook">Related Book (Optional)</label>
                    <input type="text" id="relatedBook" class="modal-input" 
                           placeholder="Search for a book...">
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
    
    // Handle thread type changes
    const typeSelect = modal.querySelector('#circleThreadType');
    const pollOptions = modal.querySelector('#pollOptions');
    const eventOptions = modal.querySelector('#eventOptions');
    
    typeSelect.addEventListener('change', function() {
        pollOptions.style.display = this.value === 'poll' ? 'block' : 'none';
        eventOptions.style.display = this.value === 'event' ? 'block' : 'none';
    });
    
    // Add poll option
    const addPollBtn = modal.querySelector('#addPollOption');
    if (addPollBtn) {
        addPollBtn.addEventListener('click', function() {
            const pollList = modal.querySelector('#pollOptionsList');
            const optionCount = pollList.children.length + 1;
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'modal-input poll-option-input';
            newInput.placeholder = `Option ${optionCount}`;
            newInput.style.marginBottom = '10px';
            pollList.appendChild(newInput);
        });
    }
    
    // Close handlers
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
    
    // Post handler
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
                circle: circleValue,
                circleName: circleName,
                tags: modal.querySelector('#circleTags').value.split(',').map(t => t.trim()).filter(t => t)
            };
            
            // Add type-specific data
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
                
                if (socket) {
                    socket.emit('circle-activity', {
                        circleId: circleValue,
                        circleName: circleName,
                        message: `New ${type}: ${title}`
                    });
                }
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
                <div class="public-context-banner">
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
                    <div class="genre-selector" id="publicGenreSelector">
                        <button class="genre-pill" data-genre="Fantasy">Fantasy</button>
                        <button class="genre-pill" data-genre="Mystery">Mystery</button>
                        <button class="genre-pill" data-genre="Romance">Romance</button>
                        <button class="genre-pill" data-genre="Sci-Fi">Sci-Fi</button>
                        <button class="genre-pill" data-genre="Historical">Historical</button>
                        <button class="genre-pill" data-genre="Thriller">Thriller</button>
                        <button class="genre-pill" data-genre="Non-Fiction">Non-Fiction</button>
                        <button class="genre-pill" data-genre="Literary">Literary</button>
                        <button class="genre-pill" data-genre="Poetry">Poetry</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="discussionTags">Tags (Optional)</label>
                    <input type="text" id="discussionTags" class="modal-input" 
                           placeholder="e.g., spoiler, analysis, debate (comma separated)">
                </div>
                
                <div class="form-group">
                    <label for="featuredImage">Featured Image (Optional)</label>
                    <input type="file" id="featuredImage" class="modal-input" accept="image/*">
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
    
    // Genre selection
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
    
    // Close handlers
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
    
    // Post handler
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
                genres: selectedGenres,
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
                loadThreads();
                
                if (socket) {
                    socket.emit('community-activity', {
                        user: currentUser?.name || 'Someone',
                        action: 'started a discussion',
                        target: title,
                        userAvatar: currentUser?.profilePicture
                    });
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

function handleCircleAction(action) {
    const circleSelect = document.getElementById('activeCircle');
    const circleName = circleSelect ? circleSelect.selectedOptions[0].text : 'Fantasy Readers';
    const circleValue = circleSelect ? circleSelect.value : 'fantasy';
    
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
                <div class="circle-context-banner" style="margin-bottom: 20px;">
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
                
                <div class="form-group">
                    <label>Poll Duration</label>
                    <select id="quickPollDuration" class="modal-select">
                        <option value="24">24 hours</option>
                        <option value="48">48 hours</option>
                        <option value="72">3 days</option>
                        <option value="168">1 week</option>
                    </select>
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
    
    // Add poll option
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
    
    // Close handlers
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
        const duration = modal.querySelector('#quickPollDuration').value;
        
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
                    circle: circleValue,
                    question,
                    options,
                    duration
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
    // Similar implementation for quick event creation
    showNotification(`Schedule an event in ${circleName}`, 'info');
}

function showBookSuggestionModal(circleName, circleValue) {
    // Similar implementation for book suggestion
    showNotification(`Suggest a book to ${circleName}`, 'info');
}

function updateCircleName() {
    const circleSelect = document.getElementById('activeCircle');
    if (circleSelect) {
        const circleName = circleSelect.selectedOptions[0].text;
        const feedTitle = document.getElementById('feedTitle');
        if (feedTitle) {
            feedTitle.textContent = circleName;
        }
    }
}

function updateFeedTitle() {
    const titles = {
        circle: document.getElementById('activeCircle')?.selectedOptions[0]?.text || 'Your Circles',
        public: 'Public Discussions',
        all: 'All Activity'
    };
    const feedTitle = document.getElementById('feedTitle');
    if (feedTitle) {
        feedTitle.textContent = titles[currentFeed];
    }
}

async function loadThreads(searchTerm = null, append = false) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        const token = localStorage.getItem('token');
        
        if (!token) {
            renderThreads([]);
            isLoading = false;
            return;
        }
        
        const sortSelect = document.querySelector('.sort-select');
        const sort = sortSelect ? sortSelect.value.toLowerCase().replace(' ', '_') : 'latest_activity';
        
        // Build URL based on current feed
        let url;
        if (currentFeed === 'circle') {
            url = `http://localhost:5002/api/discussions/circles/${currentCircle}/threads`;
        } else if (currentFeed === 'public') {
            url = 'http://localhost:5002/api/discussions/public';
        } else {
            url = 'http://localhost:5002/api/discussions/all';
        }
        
        // Add query parameters
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
        
        console.log('Fetching threads from:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            renderThreads([]);
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
        }
    } catch (error) {
        console.error('Error loading threads:', error);
        showNotification('Error loading discussions. Please try again.', 'error');
    } finally {
        isLoading = false;
    }
}

function renderThreads(threads) {
    const container = document.querySelector('.threads-container');
    if (!container) return;
    
    // Clear container
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    
    if (!threads || threads.length === 0) {
        showEmptyState(container);
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
    const loadMoreBtn = document.querySelector('.load-more');
    
    if (!container) return;
    
    if (loadMoreBtn) {
        loadMoreBtn.remove();
    }
    
    threads.forEach((thread, index) => {
        const threadCard = createThreadCard(thread);
        if (threadCard) {
            threadCard.style.animation = `fadeIn 0.5s ease ${index * 0.1}s forwards`;
            container.appendChild(threadCard);
        }
    });
    
    if (loadMoreBtn) {
        container.appendChild(loadMoreBtn);
    }
}

function createThreadCard(thread) {
    try {
        const card = document.createElement('div');
        card.className = `thread-card ${thread.isCircleThread ? 'circle-thread' : 'public-thread'}`;
        card.dataset.threadId = thread._id;
        
        const isCircleThread = thread.isCircleThread || thread.circle;
        const contextBadge = isCircleThread 
            ? `<div class="thread-context-badge circle-badge">
                <i class="fas fa-users"></i> ${escapeHtml(thread.circleName || 'Circle')} · Members Only
               </div>`
            : `<div class="thread-context-badge public-badge">
                <i class="fas fa-globe"></i> Public Discussion
               </div>`;
        
        const authorName = thread.author?.name || 'Anonymous';
        const authorImage = thread.author?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName)}`;
        const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt)) || 'recently';
        const content = thread.content || 'No content';
        const excerpt = content.length > 150 ? content.substring(0, 150) + '...' : content;
        
        const tagsHtml = thread.tags && thread.tags.length > 0 
            ? thread.tags.map(tag => `<span class="tag"><i class="fas fa-hashtag"></i> ${escapeHtml(tag)}</span>`).join('')
            : '';
        
        // Handle different thread types
        let typeSpecificHtml = '';
        if (thread.type === 'poll' && thread.poll) {
            typeSpecificHtml = createPollPreview(thread.poll);
        } else if (thread.type === 'event' && thread.event) {
            typeSpecificHtml = createEventPreview(thread.event);
        } else {
            typeSpecificHtml = `<div class="thread-excerpt"><p>${escapeHtml(excerpt)}</p></div>`;
        }
        
        card.innerHTML = `
            ${thread.isFeatured ? '<div class="thread-badge"><i class="fas fa-crown"></i> Community Pick</div>' : ''}
            ${contextBadge}
            <div class="thread-header">
                <img src="${escapeHtml(authorImage)}" alt="${escapeHtml(authorName)}" class="avatar-img" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                <div class="thread-info">
                    <h3>${escapeHtml(thread.title)}</h3>
                    <div class="thread-meta">
                        <span class="author"><i class="far fa-user"></i> ${escapeHtml(authorName)}</span>
                        <span class="time"><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                        ${thread.type ? `<span class="${thread.type}-indicator"><i class="fas ${getTypeIcon(thread.type)}"></i> ${thread.type}</span>` : ''}
                        ${tagsHtml}
                    </div>
                </div>
            </div>
            ${typeSpecificHtml}
            <div class="thread-footer">
                <div class="thread-stats">
                    <span class="stat"><i class="fas fa-comment"></i> ${thread.commentCount || 0}</span>
                    <span class="stat"><i class="fas fa-heart"></i> ${thread.likeCount || 0}</span>
                    ${thread.type === 'poll' ? `<span class="stat"><i class="fas fa-vote-yea"></i> ${thread.poll?.votes || 0} votes</span>` : ''}
                    ${thread.type === 'event' ? `<span class="stat"><i class="fas fa-users"></i> ${thread.event?.attendees || 0} attending</span>` : ''}
                </div>
                <div class="thread-actions">
                    <button class="${isCircleThread ? 'btn-circle-reply' : 'btn-join-discussion'}" onclick="viewThread('${thread._id}')">
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
    const totalVotes = poll.votes || 0;
    const options = poll.options || [];
    
    return `
        <div class="poll-preview">
            <h4>${escapeHtml(poll.question)}</h4>
            ${options.map(option => `
                <div class="poll-option">
                    <span class="poll-label">${escapeHtml(option.text)}</span>
                    <div class="poll-bar-container">
                        <div class="poll-bar" style="width: ${option.percentage || 0}%"></div>
                        <span class="poll-percentage">${option.percentage || 0}%</span>
                    </div>
                </div>
            `).join('')}
            <div class="poll-footer">
                <span>${totalVotes} votes</span>
                <button class="btn-vote" onclick="voteInPoll('${poll._id}')">Vote</button>
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
        <div class="event-preview">
            <div class="event-date-large">
                <span class="event-month">${eventDate.toLocaleString('default', { month: 'short' })}</span>
                <span class="event-day">${eventDate.getDate()}</span>
            </div>
            <div class="event-details-large">
                <div class="event-meta">
                    <span><i class="fas fa-clock"></i> ${formattedDate}</span>
                    <span><i class="fas fa-microphone"></i> ${event.type || 'Voice Chat'}</span>
                </div>
                <button class="btn-rsvp" onclick="rsvpToEvent('${event._id}')">RSVP</button>
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
        event: 'fa-calendar-alt',
        literary: 'fa-feather',
        news: 'fa-newspaper',
        challenge: 'fa-trophy'
    };
    return icons[type] || 'fa-comment';
}

function showEmptyState(container) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
        <i class="fas fa-comments" style="font-size: 48px; color: #a88b76; margin-bottom: 20px;"></i>
        <h3 style="color: #fff; margin-bottom: 10px;">No discussions yet</h3>
        <p style="color: #c4a891;">Be the first to start a discussion!</p>
        <button class="btn-primary" onclick="showPublicDiscussionModal()" style="margin-top: 20px;">
            <i class="fas fa-plus"></i> Start a Discussion
        </button>
    `;
    container.appendChild(emptyState);
}

function viewThread(threadId) {
    sessionStorage.setItem('currentThreadId', threadId);
    showThreadDetailModal(threadId);
}

async function showThreadDetailModal(threadId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2><i class="fas fa-comments"></i> Loading Discussion...</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 50px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 40px; color: #e8d4c0;"></i>
                <p style="margin-top: 20px; color: #c4a891;">Loading discussion...</p>
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
    
    await loadThreadDetail(threadId, modal);
}

async function loadThreadDetail(threadId, modal) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            modal.querySelector('.modal-body').innerHTML = `
                <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
                <h3 style="color: #fff; margin-bottom: 10px;">Please Log In</h3>
                <p style="color: #c4a891;">You need to be logged in to view discussions.</p>
                <button class="btn-primary" onclick="window.location.href='../Login/login.html'" style="margin-top: 20px;">
                    <i class="fas fa-sign-in-alt"></i> Go to Login
                </button>
            `;
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load thread');
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderThreadDetail(data.thread, data.isLiked, modal);
        }
    } catch (error) {
        console.error('Error loading thread:', error);
        modal.querySelector('.modal-body').innerHTML = `
            <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
            <h3 style="color: #fff; margin-bottom: 10px;">Error Loading Discussion</h3>
            <p style="color: #c4a891;">${error.message}</p>
            <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
                <i class="fas fa-redo"></i> Try Again
            </button>
        `;
    }
}

function renderThreadDetail(thread, isLiked, modal) {
    const modalBody = modal.querySelector('.modal-body');
    const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt));
    
    const commentsHtml = thread.comments && thread.comments.length > 0 
        ? thread.comments.map(comment => createCommentHtml(comment, thread._id)).join('')
        : '<p style="color: #a88b76; text-align: center;">No comments yet. Be the first to comment!</p>';
    
    modalBody.innerHTML = `
        <div class="thread-detail">
            <div class="thread-detail-header">
                <h2>${escapeHtml(thread.title)}</h2>
                <div class="thread-detail-meta">
                    <img src="${thread.author?.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + thread.author?.name}" alt="${thread.author?.name}" class="avatar-img">
                    <div>
                        <span class="author">${escapeHtml(thread.author?.name || 'Unknown')}</span>
                        <span class="time">${escapeHtml(timeAgo)}</span>
                    </div>
                    ${thread.circle ? `<span class="circle-indicator"><i class="fas fa-users"></i> ${escapeHtml(thread.circle)}</span>` : ''}
                    <span class="genre-tag active" style="margin-left: auto;">${escapeHtml(thread.genre || 'General')}</span>
                </div>
            </div>
            
            <div class="thread-detail-content">
                ${escapeHtml(thread.content).replace(/\n/g, '<br>')}
            </div>
            
            <div class="thread-detail-tags">
                ${thread.tags && thread.tags.length > 0 
                    ? thread.tags.map(tag => `<span class="tag"><i class="fas fa-tag"></i> ${escapeHtml(tag)}</span>`).join('')
                    : ''}
            </div>
            
            <div class="thread-detail-stats">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${thread._id}')">
                    <i class="fas fa-heart"></i> <span>${thread.likeCount || 0}</span>
                </button>
                <span><i class="fas fa-eye"></i> ${formatNumber(thread.views || 0)} views</span>
                <span><i class="fas fa-comment"></i> ${thread.commentCount || 0} comments</span>
                <button class="btn-follow" onclick="toggleFollow('${thread._id}')">
                    <i class="far fa-bell"></i> Follow
                </button>
            </div>
            
            <div class="comments-section">
                <h3>Comments (${thread.commentCount || 0})</h3>
                
                <div class="add-comment">
                    <textarea id="commentContent" placeholder="Share your thoughts..." rows="3"></textarea>
                    <button class="btn-primary" onclick="addComment('${thread._id}')">
                        <i class="fas fa-paper-plane"></i> Post Comment
                    </button>
                </div>
                
                <div class="comments-list">
                    ${commentsHtml}
                </div>
            </div>
        </div>
    `;
    
    const modalHeader = modal.querySelector('.modal-header h2');
    if (modalHeader) {
        modalHeader.innerHTML = `<i class="fas fa-comments"></i> ${escapeHtml(thread.title)}`;
    }
}

function createCommentHtml(comment, threadId) {
    if (comment.isDeleted) {
        return `
            <div class="comment deleted">
                <p><i>This comment has been deleted</i></p>
            </div>
        `;
    }
    
    const timeAgo = getTimeAgo(new Date(comment.createdAt));
    const isLiked = currentUser && comment.likes && comment.likes.includes(currentUser._id);
    
    return `
        <div class="comment" data-comment-id="${comment._id}">
            <div class="comment-header">
                <img src="${comment.user?.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comment.user?.name}" alt="${comment.user?.name}" class="avatar-img small">
                <div>
                    <span class="author">${escapeHtml(comment.user?.name || 'Unknown')}</span>
                    <span class="time">${escapeHtml(timeAgo)}</span>
                </div>
            </div>
            <div class="comment-content">
                ${escapeHtml(comment.content).replace(/\n/g, '<br>')}
            </div>
            <div class="comment-footer">
                <button class="comment-like ${isLiked ? 'liked' : ''}" onclick="toggleCommentLike('${threadId}', '${comment._id}')">
                    <i class="fas fa-heart"></i> <span>${comment.likeCount || 0}</span>
                </button>
                <button class="comment-reply" onclick="showReplyForm('${threadId}', '${comment._id}')">
                    <i class="fas fa-reply"></i> Reply
                </button>
                ${comment.user?._id === currentUser?._id ? `
                    <button class="comment-delete" onclick="deleteComment('${threadId}', '${comment._id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : ''}
            </div>
            
            ${comment.replies && comment.replies.length > 0 ? `
                <div class="replies">
                    ${comment.replies.map(reply => createCommentHtml(reply, threadId)).join('')}
                </div>
            ` : ''}
            
            <div class="reply-form" id="reply-form-${comment._id}" style="display: none;">
                <textarea placeholder="Write your reply..." rows="2"></textarea>
                <button onclick="addReply('${threadId}', '${comment._id}')">Post Reply</button>
            </div>
        </div>
    `;
}

// ====================================
// THREAD ACTIONS
// ====================================

async function toggleLike(threadId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in to like', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const likeBtn = document.querySelector('.like-btn');
            const likeCount = likeBtn.querySelector('span');
            likeCount.textContent = data.likeCount;
            
            if (data.isLiked) {
                likeBtn.classList.add('liked');
            } else {
                likeBtn.classList.remove('liked');
            }
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        showNotification('Error liking thread', 'error');
    }
}

async function toggleFollow(threadId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in to follow', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/threads/${threadId}/follow`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const btn = event.target.closest('.btn-follow');
            if (btn.classList.contains('following')) {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="far fa-bell"></i> Follow';
                showNotification('Unfollowed discussion', 'info');
            } else {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-bell"></i> Following';
                showNotification('You\'ll be notified of new replies', 'success');
            }
        }
    } catch (error) {
        console.error('Error following thread:', error);
        showNotification('Error following thread', 'error');
    }
}

async function addComment(threadId) {
    const content = document.getElementById('commentContent')?.value.trim();
    
    if (!content) {
        showNotification('Please enter a comment', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in to comment', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Comment posted!', 'success');
            document.getElementById('commentContent').value = '';
            const modal = document.querySelector('.modal');
            loadThreadDetail(threadId, modal);
        } else {
            showNotification(data.message || 'Error posting comment', 'error');
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        showNotification('Error posting comment', 'error');
    }
}

async function toggleCommentLike(threadId, commentId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in to like', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const modal = document.querySelector('.modal');
            loadThreadDetail(threadId, modal);
        }
    } catch (error) {
        console.error('Error toggling comment like:', error);
        showNotification('Error liking comment', 'error');
    }
}

async function deleteComment(threadId, commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Comment deleted', 'success');
            const modal = document.querySelector('.modal');
            loadThreadDetail(threadId, modal);
        } else {
            showNotification(data.message || 'Error deleting comment', 'error');
        }
    } catch (error) {
        console.error('Error deleting comment:', error);
        showNotification('Error deleting comment', 'error');
    }
}

function showReplyForm(threadId, commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

async function addReply(threadId, commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    const textarea = form.querySelector('textarea');
    const content = textarea.value.trim();
    
    if (!content) {
        showNotification('Please enter a reply', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please log in to reply', 'error');
            return;
        }
        
        const response = await fetch(`http://localhost:5002/api/discussions/threads/${threadId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                content,
                parentCommentId: commentId 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Reply posted!', 'success');
            textarea.value = '';
            form.style.display = 'none';
            const modal = document.querySelector('.modal');
            loadThreadDetail(threadId, modal);
        } else {
            showNotification(data.message || 'Error posting reply', 'error');
        }
    } catch (error) {
        console.error('Error adding reply:', error);
        showNotification('Error posting reply', 'error');
    }
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
                    badge.textContent = unread;
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
            <div class="modal-body">
                ${notifications && notifications.length > 0 
                    ? notifications.map(n => `
                        <div class="notification-item">
                            <i class="fas ${n.icon || 'fa-info-circle'}"></i>
                            <div>
                                <h4>${escapeHtml(n.title)}</h4>
                                <p>${escapeHtml(n.message)}</p>
                                <small>${n.formattedTime || getTimeAgo(new Date(n.createdAt))}</small>
                            </div>
                        </div>
                    `).join('')
                    : '<p style="color: #a88b76; text-align: center;">No notifications</p>'
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
            
            if (titleEl) titleEl.textContent = highlights.mostDiscussed.title || 'Most Discussed This Week';
            if (descEl) descEl.textContent = highlights.mostDiscussed.description || '';
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
            if (descEl) descEl.textContent = highlights.trendingGenre.description || '';
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
            
            if (descEl) descEl.textContent = highlights.activeUsers.description || '';
            if (statsEl) {
                statsEl.innerHTML = `
                    <span><i class="fas fa-users"></i> ${highlights.activeUsers.count || 0} active users</span>
                    <span><i class="fas fa-bolt"></i> Very Active</span>
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
                console.log('Genre stats:', data.genreStats);
                // Could update UI with genre stats
            }
        }
    } catch (error) {
        console.error('Error loading genre stats:', error);
    }
}

function initializeCommunityFeatures() {
    // Join event buttons

    document.querySelectorAll('.btn-join-event').forEach(btn => {
        btn.addEventListener('click', function() {
            const eventTitle = this.closest('.event-item')?.querySelector('h4')?.textContent || 'event';
            this.textContent = 'Joined ✓';
            this.style.background = 'rgba(76, 175, 80, 0.2)';
            showNotification(`Joined ${eventTitle}!`, 'success');
        });
    });
    
    // RSVP buttons
    document.querySelectorAll('.btn-rsvp').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.textContent = 'RSVPed ✓';
            this.style.background = 'rgba(76, 175, 80, 0.2)';
            showNotification('See you at the event!', 'success');
        });
    });
    
    // Vote buttons
    document.querySelectorAll('.btn-vote').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            showNotification('Vote recorded!', 'success');
        });
    });
}

function getCurrentThreadId() {
    return sessionStorage.getItem('currentThreadId');
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

// Poll and Event functions
async function voteInPoll(pollId) {
    showNotification('Opening poll...', 'info');
}

async function rsvpToEvent(eventId) {
    showNotification('RSVP recorded!', 'success');
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showCircleThreadModal,
        showPublicDiscussionModal,
        handleCircleAction,
        viewThread,
        toggleLike,
        toggleFollow,
        addComment
    };
}