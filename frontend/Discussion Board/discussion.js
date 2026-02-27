// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Litlink Community Board loaded!');
    
    // Check authentication (don't redirect, just note it)
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found - user not logged in');
    }
    
    // Initialize the page
    initializePage();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load threads
    loadThreads();
    
    // Load community highlights
    loadHighlights();
    
    // Load genre stats
    loadGenreStats();
    
    // Set up real-time updates via WebSocket
    setupWebSocket();
});

// Global variables
let currentUser = null;
let currentPage = 1;
let currentFilter = 'recent';
let currentGenre = 'All Genres';
let searchTimeout = null;
let socket = null;

// Initialize page
async function initializePage() {
    try {
        // Get current user from token
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
            
            // Update UI with user info
            updateUserInfo();
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Update user info in header
function updateUserInfo() {
    if (currentUser) {
        const avatar = document.querySelector('.avatar');
        if (avatar) {
            avatar.innerHTML = `<img src="${currentUser.profilePicture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.name}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
    }
}

// Set up WebSocket connection
function setupWebSocket() {
    const token = localStorage.getItem('token');
    
    // Make sure Socket.IO client is loaded
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
            // Authenticate
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
        
        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
        });
    } catch (error) {
        console.error('Error setting up WebSocket:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
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
            // If clicking "All Genres", deselect others
            if (this.textContent === 'All Genres') {
                genreTags.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentGenre = 'All Genres';
            } else {
                // Toggle active state
                this.classList.toggle('active');
                
                // If any genre is active, deactivate "All Genres"
                const allGenres = document.querySelector('.genre-tag:first-child');
                const activeTags = document.querySelectorAll('.genre-tag.active');
                
                if (activeTags.length > 0) {
                    allGenres.classList.remove('active');
                    // Get the first active genre for filtering
                    currentGenre = activeTags[0].textContent;
                } else {
                    allGenres.classList.add('active');
                    currentGenre = 'All Genres';
                }
            }
            
            // Animate the click
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
            
            // Reload threads with new genre filter
            currentPage = 1;
            loadThreads();
        });
    });
    
    // Search functionality with debounce
    const searchBar = document.querySelector('.search-bar');
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
    
    // Search button
    const searchBtn = document.querySelector('.search-btn');
    searchBtn.addEventListener('click', function() {
        const term = searchBar.value.trim();
        if (term) {
            currentPage = 1;
            loadThreads(term);
        } else {
            searchBar.focus();
        }
    });
    
    // Sort select
    const sortSelect = document.querySelector('.sort-select');
    sortSelect.addEventListener('change', function() {
        currentPage = 1;
        loadThreads();
    });
    
    // Start Thread button
    const startThreadBtn = document.querySelector('.start-thread-btn');
    startThreadBtn.addEventListener('click', function() {
        showThreadModal();
    });
    
    // Load more button
    const loadMoreBtn = document.querySelector('.load-more');
    loadMoreBtn.addEventListener('click', function() {
        currentPage++;
        loadThreads(null, true);
    });
    
    // Notification bell
    const bellBtn = document.querySelector('.notification-btn');
    bellBtn.addEventListener('click', function() {
        // Animate bell
        this.style.transform = 'rotate(15deg)';
        setTimeout(() => {
            this.style.transform = 'rotate(-15deg)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        }, 150);
        
        loadNotifications();
    });
    
    // View all button in highlights
    const viewAllBtn = document.querySelector('.view-all');
    viewAllBtn.addEventListener('click', function() {
        // Scroll to threads
        document.querySelector('.threads-container').scrollIntoView({ 
            behavior: 'smooth' 
        });
    });
}

// Load threads from API
async function loadThreads(searchTerm = null, append = false) {
    try {
        const token = localStorage.getItem('token');
        
        // Don't redirect if no token, just show empty state
        if (!token) {
            console.log('No token found, showing empty state');
            renderThreads([]);
            return;
        }

        const sortSelect = document.querySelector('.sort-select');
        const sort = sortSelect ? sortSelect.value.toLowerCase().replace(' ', '_') : 'latest_activity';
        
        // Build query params
        let url = `http://localhost:5002/api/discussions/threads?page=${currentPage}&limit=10&sort=${sort}`;
        
        if (currentGenre !== 'All Genres') {
            url += `&genre=${encodeURIComponent(currentGenre)}`;
        }
        
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        if (currentFilter === 'my_threads' && currentUser?._id) {
            url += `&userId=${currentUser._id}`;
        } else if (currentFilter === 'community_picks') {
            url += '&featured=true';
        }
        
        console.log('Fetching threads from:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            console.log('Not authenticated, showing empty state');
            renderThreads([]);
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
            
            // Update load more button
            const loadMoreBtn = document.querySelector('.load-more');
            if (loadMoreBtn) {
                if (currentPage >= data.pagination.pages) {
                    loadMoreBtn.style.display = 'none';
                } else {
                    loadMoreBtn.style.display = 'flex';
                }
            }
            
            // Update highlights if provided
            if (data.highlights) {
                updateHighlights(data.highlights);
            }
        }
    } catch (error) {
        console.error('Error loading threads:', error);
        showNotification('Error loading discussions. Please try again.', 'error');
        
        // Show empty state with error message
        const container = document.querySelector('.threads-container');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
                    <h3 style="color: #fff; margin-bottom: 10px;">Failed to Load Discussions</h3>
                    <p style="color: #c4a891;">${error.message}</p>
                    <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            `;
        }
    }
}

// Render threads in the DOM
function renderThreads(threads) {
    const container = document.querySelector('.threads-container');
    
    // Make sure container exists
    if (!container) {
        console.error('Threads container not found');
        return;
    }
    
    // Clear container safely
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    
    if (!threads || threads.length === 0) {
        // Create empty state message
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <i class="fas fa-comments" style="font-size: 48px; color: #a88b76; margin-bottom: 20px;"></i>
            <h3 style="color: #fff; margin-bottom: 10px;">No discussions yet</h3>
            <p style="color: #c4a891;">Be the first to start a discussion!</p>
            <button class="btn-primary" onclick="showThreadModal()" style="margin-top: 20px;">
                <i class="fas fa-plus"></i> Start a Discussion
            </button>
        `;
        container.appendChild(emptyState);
        return;
    }
    
    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    threads.forEach((thread, index) => {
        const threadCard = createThreadCard(thread);
        if (threadCard) {
            threadCard.style.animation = `fadeIn 0.5s ease ${index * 0.1}s forwards`;
            fragment.appendChild(threadCard);
        }
    });
    
    // Add load more button if it exists
    const loadMoreBtn = document.querySelector('.load-more');
    if (loadMoreBtn) {
        // Clone the button to avoid removing it from its original location
        const loadMoreClone = loadMoreBtn.cloneNode(true);
        
        // Re-attach event listener to the cloned button
        loadMoreClone.addEventListener('click', function() {
            currentPage++;
            loadThreads(null, true);
        });
        
        fragment.appendChild(loadMoreClone);
    }
    
    container.appendChild(fragment);
}

// Append more threads (for pagination)
function appendThreads(threads) {
    const container = document.querySelector('.threads-container');
    const loadMoreBtn = document.querySelector('.load-more');
    
    if (!container) return;
    
    // Remove the load more button temporarily if it exists
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
    
    // Add load more button back
    if (loadMoreBtn) {
        container.appendChild(loadMoreBtn);
    }
}

// Create a thread card element
function createThreadCard(thread) {
    try {
        const card = document.createElement('div');
        card.className = `thread-card ${thread.isFeatured ? 'featured' : ''}`;
        card.dataset.threadId = thread._id;
        
        // Safely access properties with defaults
        const title = thread.title || 'Untitled Discussion';
        const authorName = thread.author?.name || 'Anonymous';
        const authorImage = thread.author?.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authorName)}`;
        const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt)) || 'recently';
        const content = thread.content || 'No content';
        const excerpt = content.length > 150 ? content.substring(0, 150) + '...' : content;
        
        // Safely handle tags
        const tagsHtml = thread.tags && thread.tags.length > 0 
            ? thread.tags.map(tag => `<span class="tag"><i class="fas fa-hashtag"></i> ${escapeHtml(tag)}</span>`).join('')
            : '';
        
        card.innerHTML = `
            ${thread.isFeatured ? '<div class="thread-badge"><i class="fas fa-crown"></i> Community Pick</div>' : ''}
            <div class="thread-header">
                <img src="${escapeHtml(authorImage)}" alt="${escapeHtml(authorName)}" class="avatar-img" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                <div class="thread-info">
                    <h3>${escapeHtml(title)}</h3>
                    <div class="thread-meta">
                        <span class="author"><i class="far fa-user"></i> ${escapeHtml(authorName)}</span>
                        <span class="time"><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                        ${tagsHtml}
                    </div>
                </div>
            </div>
            <div class="thread-excerpt">
                <p>${escapeHtml(excerpt)}</p>
            </div>
            <div class="thread-footer">
                <div class="thread-stats">
                    <span class="stat"><i class="fas fa-comment"></i> ${thread.commentCount || 0} replies</span>
                    <span class="stat"><i class="fas fa-eye"></i> ${formatNumber(thread.views || 0)} views</span>
                    <span class="stat"><i class="fas fa-heart"></i> ${thread.likeCount || 0} likes</span>
                </div>
                <button class="join-discussion" onclick="viewThread('${thread._id}')">
                    <i class="fas fa-reply"></i> Join Discussion
                </button>
            </div>
        `;
        
        // Add click event to view thread
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.join-discussion') && !e.target.closest('.thread-badge')) {
                viewThread(thread._id);
            }
        });
        
        return card;
    } catch (error) {
        console.error('Error creating thread card:', error);
        return null;
    }
}

// View a single thread
function viewThread(threadId) {
    // Store thread ID in session storage
    sessionStorage.setItem('currentThreadId', threadId);
    // Navigate to thread view page or show modal
    showThreadDetailModal(threadId);
}

// Load community highlights
async function loadHighlights() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch('http://localhost:5002/api/discussions/threads?page=1&limit=1', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.highlights) {
                updateHighlights(data.highlights);
            }
        }
    } catch (error) {
        console.error('Error loading highlights:', error);
    }
}

// Update highlights section
function updateHighlights(highlights) {
    const highlightCards = document.querySelectorAll('.highlight-card');
    
    if (highlightCards.length >= 3) {
        // Most discussed
        if (highlights.mostDiscussed) {
            const mostDiscussedCard = highlightCards[0];
            const titleEl = mostDiscussedCard.querySelector('h3');
            const descEl = mostDiscussedCard.querySelector('p');
            if (titleEl) titleEl.textContent = highlights.mostDiscussed.title || 'Most Discussed This Week';
            if (descEl) descEl.textContent = `${highlights.mostDiscussed.comments || 0} comments · ${formatNumber(highlights.mostDiscussed.views || 0)} views`;
        }
        
        // Trending genre
        if (highlights.trendingGenre) {
            const trendingCard = highlightCards[1];
            const titleEl = trendingCard.querySelector('h3');
            const descEl = trendingCard.querySelector('p');
            if (titleEl) titleEl.textContent = `Trending: ${highlights.trendingGenre.genre}`;
            if (descEl) descEl.textContent = `${highlights.trendingGenre.threadCount || 0} new discussions`;
        }
        
        // Active users
        const activeCard = highlightCards[2];
        const descEl = activeCard.querySelector('p');
        if (descEl) descEl.textContent = `${highlights.activeUsers || 0} active users right now`;
    }
}

// Load genre stats
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
            }
        }
    } catch (error) {
        console.error('Error loading genre stats:', error);
    }
}

// Load notifications
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
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Show thread detail modal
function showThreadDetailModal(threadId) {
    // Create modal
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
    
    // Close handlers
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
    
    // Load thread details
    loadThreadDetail(threadId, modal);
}

// Load thread details
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

// Render thread detail
function renderThreadDetail(thread, isLiked, modal) {
    const modalBody = modal.querySelector('.modal-body');
    
    // Format time
    const timeAgo = thread.timeAgo || getTimeAgo(new Date(thread.createdAt));
    
    // Create comments HTML
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
    
    // Update modal title
    const modalHeader = modal.querySelector('.modal-header h2');
    if (modalHeader) {
        modalHeader.innerHTML = `<i class="fas fa-comments"></i> ${escapeHtml(thread.title)}`;
    }
}

// Create comment HTML
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
            
            <!-- Replies -->
            ${comment.replies && comment.replies.length > 0 ? `
                <div class="replies">
                    ${comment.replies.map(reply => createCommentHtml(reply, threadId)).join('')}
                </div>
            ` : ''}
            
            <!-- Reply form (hidden by default) -->
            <div class="reply-form" id="reply-form-${comment._id}" style="display: none;">
                <textarea placeholder="Write your reply..." rows="2"></textarea>
                <button onclick="addReply('${threadId}', '${comment._id}')">Post Reply</button>
            </div>
        </div>
    `;
}

// Show thread modal for creating new thread
function showThreadModal() {
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
                <h2><i class="fas fa-plus-circle"></i> Start New Discussion</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="thread-title"><i class="fas fa-heading"></i> Discussion Title</label>
                    <input type="text" id="thread-title" placeholder="What's your discussion about?" class="modal-input">
                </div>
                <div class="form-group">
                    <label for="thread-content"><i class="fas fa-edit"></i> Your Thoughts</label>
                    <textarea id="thread-content" placeholder="Share your insights, questions, or discussion points..." class="modal-textarea" rows="6"></textarea>
                </div>
                <div class="form-group">
                    <label for="thread-genre"><i class="fas fa-book"></i> Genre</label>
                    <select id="thread-genre" class="modal-select">
                        <option value="General">General</option>
                        <option value="Fantasy">Fantasy</option>
                        <option value="Mystery">Mystery</option>
                        <option value="Romance">Romance</option>
                        <option value="Sci-Fi">Sci-Fi</option>
                        <option value="Historical">Historical</option>
                        <option value="Thriller">Thriller</option>
                        <option value="Non-Fiction">Non-Fiction</option>
                        <option value="Literary">Literary</option>
                        <option value="Poetry">Poetry</option>
                    </select>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-tags"></i> Add Tags (Select up to 3)</label>
                    <div class="modal-tags">
                        <button class="tag-btn" data-tag="Fantasy">Fantasy</button>
                        <button class="tag-btn" data-tag="Mystery">Mystery</button>
                        <button class="tag-btn" data-tag="Romance">Romance</button>
                        <button class="tag-btn" data-tag="Sci-Fi">Sci-Fi</button>
                        <button class="tag-btn" data-tag="Historical">Historical</button>
                        <button class="tag-btn" data-tag="Literary">Literary</button>
                        <button class="tag-btn" data-tag="Non-Fiction">Non-Fiction</button>
                        <button class="tag-btn" data-tag="Poetry">Poetry</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-btn">Post Discussion</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Tag selection
    const tagButtons = modal.querySelectorAll('.tag-btn');
    const selectedTags = [];
    
    tagButtons.forEach(tag => {
        tag.addEventListener('click', function() {
            const tagValue = this.dataset.tag;
            
            if (this.classList.contains('active')) {
                this.classList.remove('active');
                const index = selectedTags.indexOf(tagValue);
                if (index > -1) selectedTags.splice(index, 1);
            } else {
                if (selectedTags.length < 3) {
                    this.classList.add('active');
                    selectedTags.push(tagValue);
                } else {
                    showNotification('Maximum 3 tags allowed', 'info');
                }
            }
        });
    });
    
    // Close handlers
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const postBtn = modal.querySelector('.post-btn');
    
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
        const title = modal.querySelector('#thread-title').value.trim();
        const content = modal.querySelector('#thread-content').value.trim();
        const genre = modal.querySelector('#thread-genre').value;
        
        if (!title || !content) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        postBtn.disabled = true;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:5002/api/discussions/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    content,
                    genre,
                    tags: selectedTags
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Discussion posted successfully!', 'success');
                closeModal();
                // Refresh threads
                currentPage = 1;
                loadThreads();
            } else {
                showNotification(data.message || 'Error posting discussion', 'error');
                postBtn.innerHTML = '<i class="fas fa-plus"></i> Post Discussion';
                postBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error posting thread:', error);
            showNotification('Error posting discussion', 'error');
            postBtn.innerHTML = '<i class="fas fa-plus"></i> Post Discussion';
            postBtn.disabled = false;
        }
    });
    
    // Focus on title
    setTimeout(() => {
        modal.querySelector('#thread-title').focus();
    }, 100);
}

// Toggle like on thread
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

// Add comment to thread
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
            // Reload thread to show new comment
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

// Toggle like on comment
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
            // Reload thread to show updated likes
            const modal = document.querySelector('.modal');
            loadThreadDetail(threadId, modal);
        }
    } catch (error) {
        console.error('Error toggling comment like:', error);
        showNotification('Error liking comment', 'error');
    }
}

// Delete comment
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
            // Reload thread
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

// Show reply form
function showReplyForm(threadId, commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

// Add reply to comment
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
            // Reload thread to show new reply
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

// Show notifications modal
function showNotificationsModal(notifications) {
    // Create modal
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
    
    // Close handlers
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

// Helper Functions

// Get current thread ID from URL or session
function getCurrentThreadId() {
    return sessionStorage.getItem('currentThreadId');
}

// Format number (e.g., 1234 -> 1.2k)
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num;
}

// Get time ago string
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

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    
    notification.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
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

// Create ripple effect
function createRippleEffect(element) {
    const ripple = document.createElement('span');
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        transform: scale(0);
        animation: ripple 0.6s linear;
        width: ${size}px;
        height: ${size}px;
        top: ${y}px;
        left: ${x}px;
        pointer-events: none;
    `;
    
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}