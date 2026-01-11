// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Litlink Community Board loaded!');
    
    // Filter options
    const filterOptions = document.querySelectorAll('.filter-option');
    filterOptions.forEach(option => {
        option.addEventListener('click', function() {
            filterOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const filterText = this.querySelector('span').textContent;
            showNotification(`Filter changed to: ${filterText}`);
        });
    });
    
    // Genre tags
    const genreTags = document.querySelectorAll('.genre-tag');
    genreTags.forEach(tag => {
        tag.addEventListener('click', function() {
            // If clicking "All Genres", deselect others
            if (this.textContent === 'All Genres') {
                genreTags.forEach(t => {
                    t.classList.remove('active');
                    t.style.transform = '';
                });
                this.classList.add('active');
            } else {
                // Toggle active state
                this.classList.toggle('active');
                
                // If no tags are active, activate "All Genres"
                const activeTags = document.querySelectorAll('.genre-tag.active');
                const allGenres = document.querySelector('.genre-tag');
                
                if (activeTags.length === 0) {
                    allGenres.classList.add('active');
                } else {
                    allGenres.classList.remove('active');
                }
            }
            
            // Animate the click
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
    
    // Search functionality with debounce
    let searchTimeout;
    const searchBar = document.querySelector('.search-bar');
    searchBar.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = e.target.value.trim();
            if (searchTerm.length >= 2) {
                filterThreadsBySearch(searchTerm);
            } else if (searchTerm.length === 0) {
                resetThreadFilters();
            }
        }, 500);
    });
    
    // Search button
    const searchBtn = document.querySelector('.search-btn');
    searchBtn.addEventListener('click', function() {
        const term = searchBar.value.trim();
        if (term) {
            showNotification(`Searching for: "${term}"`);
        } else {
            searchBar.focus();
        }
    });
    
    // Highlight cards
    const highlightCards = document.querySelectorAll('.highlight-card');
    highlightCards.forEach(card => {
        card.addEventListener('click', function() {
            const title = this.querySelector('h3').textContent;
            createRippleEffect(this);
            setTimeout(() => {
                showNotification(`Opening: ${title}`);
            }, 300);
        });
    });
    
    // Thread cards
    const threadCards = document.querySelectorAll('.thread-card');
    threadCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on the join button
            if (e.target.closest('.join-discussion')) return;
            if (e.target.closest('.thread-badge')) return;
            
            const title = this.querySelector('h3').textContent;
            createRippleEffect(this);
            setTimeout(() => {
                showNotification(`Opening discussion: "${title}"`);
            }, 300);
        });
    });
    
    // Join discussion buttons
    const joinButtons = document.querySelectorAll('.join-discussion');
    joinButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const threadTitle = this.closest('.thread-card').querySelector('h3').textContent;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining...';
            this.disabled = true;
            
            setTimeout(() => {
                showNotification(`Joined discussion: "${threadTitle}"`, 'success');
                this.innerHTML = '<i class="fas fa-check"></i> Joined!';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-reply"></i> Join Discussion';
                    this.disabled = false;
                }, 2000);
            }, 1000);
        });
    });
    
    // Start Thread button
    const startThreadBtn = document.querySelector('.start-thread-btn');
    startThreadBtn.addEventListener('click', function() {
        showThreadModal();
    });
    
    // Load more button
    const loadMoreBtn = document.querySelector('.load-more');
    loadMoreBtn.addEventListener('click', function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        this.disabled = true;
        
        setTimeout(() => {
            // Simulate loading more threads
            const threadsContainer = document.querySelector('.threads-container');
            const newThread = createSampleThread();
            threadsContainer.insertBefore(newThread, this);
            
            showNotification('Loaded more discussions!', 'success');
            this.innerHTML = '<i class="fas fa-sync-alt"></i> Load More Discussions';
            this.disabled = false;
        }, 1500);
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
        
        showNotification('You have 3 new notifications', 'info');
    });
    
    // View all button in highlights
    const viewAllBtn = document.querySelector('.view-all');
    viewAllBtn.addEventListener('click', function() {
        showNotification('Opening all community highlights');
    });
    
    // Sort select
    const sortSelect = document.querySelector('.sort-select');
    sortSelect.addEventListener('change', function() {
        showNotification(`Sorted by: ${this.value}`);
    });
    
    // Add hover effect to thread cards
    threadCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
    
    // Initialize animations
    setTimeout(() => {
        document.querySelectorAll('.highlight-card, .thread-card').forEach((el, index) => {
            el.style.opacity = '1';
        });
    }, 100);
    
    console.log('All event listeners initialized!');
});

// Filter threads by search term
function filterThreadsBySearch(searchTerm) {
    const threads = document.querySelectorAll('.thread-card');
    let visibleCount = 0;
    
    threads.forEach(thread => {
        const title = thread.querySelector('h3').textContent.toLowerCase();
        const excerpt = thread.querySelector('.thread-excerpt p').textContent.toLowerCase();
        const tags = Array.from(thread.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());
        
        const matches = title.includes(searchTerm.toLowerCase()) ||
                       excerpt.includes(searchTerm.toLowerCase()) ||
                       tags.some(tag => tag.includes(searchTerm.toLowerCase()));
        
        if (matches) {
            thread.style.display = 'block';
            thread.style.animation = 'fadeIn 0.4s ease';
            visibleCount++;
        } else {
            thread.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                thread.style.display = 'none';
            }, 300);
        }
    });
    
    if (visibleCount === 0 && searchTerm.length >= 2) {
        showNotification(`No results found for "${searchTerm}"`, 'info');
    }
}

// Reset thread filters
function resetThreadFilters() {
    const threads = document.querySelectorAll('.thread-card');
    threads.forEach((thread, index) => {
        thread.style.display = 'block';
        thread.style.animation = `fadeIn 0.4s ease ${index * 0.1}s`;
    });
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
    
    // Add ripple animation style if not already added
    if (!document.querySelector('#ripple-style')) {
        const style = document.createElement('style');
        style.id = 'ripple-style';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateY(20px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
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
    
    // Add styles
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
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
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
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => {
            notification.remove();
            style.remove();
        }, 300);
    }, 3000);
}

// Show thread modal
function showThreadModal() {
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
                    <label><i class="fas fa-tags"></i> Add Tags (Select up to 3)</label>
                    <div class="modal-tags">
                        <button class="tag-btn">Fantasy</button>
                        <button class="tag-btn">Mystery</button>
                        <button class="tag-btn">Romance</button>
                        <button class="tag-btn">Sci-Fi</button>
                        <button class="tag-btn">Historical</button>
                        <button class="tag-btn">Literary</button>
                        <button class="tag-btn">Non-Fiction</button>
                        <button class="tag-btn">Poetry</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary cancel-btn">Cancel</button>
                <button class="btn-primary post-btn">Post Discussion</button>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Modal functionality
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const postBtn = modal.querySelector('.post-btn');
    const tagButtons = modal.querySelectorAll('.tag-btn');
    let selectedTags = [];
    
    // Tag selection
    tagButtons.forEach(tag => {
        tag.addEventListener('click', function() {
            const tagText = this.textContent;
            if (this.classList.contains('active')) {
                this.classList.remove('active');
                selectedTags = selectedTags.filter(t => t !== tagText);
            } else {
                if (selectedTags.length < 3) {
                    this.classList.add('active');
                    selectedTags.push(tagText);
                } else {
                    showNotification('Maximum 3 tags allowed', 'info');
                }
            }
        });
    });
    
    // Close handlers
    function closeModal() {
        modal.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Post handler
    postBtn.addEventListener('click', () => {
        const title = modal.querySelector('#thread-title').value.trim();
        const content = modal.querySelector('#thread-content').value.trim();
        
        if (!title || !content) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        if (selectedTags.length === 0) {
            showNotification('Please add at least one tag', 'error');
            return;
        }
        
        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        postBtn.disabled = true;
        
        setTimeout(() => {
            showNotification('Discussion posted successfully!', 'success');
            closeModal();
        }, 1500);
    });
    
    // Focus on title
    setTimeout(() => {
        modal.querySelector('#thread-title').focus();
    }, 100);
}

// Create sample thread for load more
function createSampleThread() {
    const authors = ['Alex R', 'Jordan M', 'Taylor S', 'Casey B', 'Riley J'];
    const tags = ['Book Club', 'Analysis', 'Recommendations', 'Debate', 'New Release'];
    const topics = [
        'The evolution of the anti-hero in modern literature',
        'Books that changed your perspective on life',
        'Underrated authors everyone should read',
        'The impact of social media on reading habits',
        'Translations vs. original language works'
    ];
    
    const author = authors[Math.floor(Math.random() * authors.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const tag1 = tags[Math.floor(Math.random() * tags.length)];
    const tag2 = tags[Math.floor(Math.random() * tags.length)];
    const replies = Math.floor(Math.random() * 50) + 10;
    const views = Math.floor(Math.random() * 500) + 300;
    const likes = Math.floor(Math.random() * 100) + 30;
    
    const thread = document.createElement('div');
    thread.className = 'thread-card';
    thread.innerHTML = `
        <div class="thread-header">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${author}" alt="${author}" class="avatar-img">
            <div class="thread-info">
                <h3>${topic}</h3>
                <div class="thread-meta">
                    <span class="author"><i class="far fa-user"></i> ${author}</span>
                    <span class="time"><i class="far fa-clock"></i> Just now</span>
                    <span class="tag"><i class="fas fa-hashtag"></i> ${tag1}</span>
                    <span class="tag"><i class="fas fa-hashtag"></i> ${tag2}</span>
                </div>
            </div>
        </div>
        <div class="thread-excerpt">
            <p>Starting a new discussion about ${topic.toLowerCase()}. What are your thoughts? Share your experiences, recommendations, or insights!</p>
        </div>
        <div class="thread-footer">
            <div class="thread-stats">
                <span class="stat"><i class="fas fa-comment"></i> ${replies} replies</span>
                <span class="stat"><i class="fas fa-eye"></i> ${views} views</span>
                <span class="stat"><i class="fas fa-heart"></i> ${likes} likes</span>
            </div>
            <button class="join-discussion"><i class="fas fa-reply"></i> Join Discussion</button>
        </div>
    `;
    
    thread.style.opacity = '0';
    thread.style.animation = 'fadeIn 0.5s ease forwards';
    
    // Add event listeners
    setTimeout(() => {
        const joinBtn = thread.querySelector('.join-discussion');
        joinBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining...';
            this.disabled = true;
            
            setTimeout(() => {
                showNotification(`Joined discussion: "${topic}"`, 'success');
                this.innerHTML = '<i class="fas fa-check"></i> Joined!';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-reply"></i> Join Discussion';
                    this.disabled = false;
                }, 2000);
            }, 1000);
        });
        
        thread.addEventListener('click', function(e) {
            if (e.target.closest('.join-discussion')) return;
            createRippleEffect(this);
            setTimeout(() => {
                showNotification(`Opening discussion: "${topic}"`);
            }, 300);
        });
    }, 100);
    
    return thread;
}