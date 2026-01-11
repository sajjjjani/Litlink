
        // ===== CONFIGURATION =====
        const API_BASE_URL = 'http://localhost:5002/api';

        // ===== UTILITY FUNCTIONS =====
        function getPlaceholderImage(text = '', width = 150, height = 200) {
            const safeText = text ? encodeURIComponent(text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')) : 'Book';
            return `https://placehold.co/${width}x${height}/3d2617/f5e6d3?text=${safeText}&font=montserrat`;
        }

        // ===== FIXED HELPER FUNCTIONS =====
        function getToken() {
            const token = localStorage.getItem('litlink_token') || 
                          localStorage.getItem('authToken') || 
                          localStorage.getItem('token');
            
            console.log('🔑 Token check:', token ? 'Found ✓' : 'Not found ✗');
            return token;
        }

        function getUserId() {
            let userId = localStorage.getItem('litlink_userId') || 
                         localStorage.getItem('userId');
            
            if (userId) {
                console.log('🆔 UserId from storage:', userId);
                return userId;
            }
            
            const userStr = localStorage.getItem('litlink_user') || 
                            localStorage.getItem('user');
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    userId = user.id || user._id;
                    if (userId) {
                        console.log('🆔 UserId from user object:', userId);
                        localStorage.setItem('litlink_userId', userId);
                        localStorage.setItem('userId', userId);
                        return userId;
                    }
                } catch (e) {
                    console.error('Error parsing user for ID:', e);
                }
            }
            
            console.error('❌ No userId found!');
            return null;
        }

        function getCurrentUserFromStorage() {
            try {
                let userStr = localStorage.getItem('litlink_user') || 
                              localStorage.getItem('user');
                
                if (!userStr) {
                    console.error('❌ No user found in localStorage!');
                    throw new Error('No user data found');
                }
                
                const user = JSON.parse(userStr);
                
                if (!user.id && user._id) {
                    user.id = user._id;
                    localStorage.setItem('litlink_user', JSON.stringify(user));
                    localStorage.setItem('user', JSON.stringify(user));
                }
                
                if (!user.createdAt) {
                    user.createdAt = new Date().toISOString();
                    localStorage.setItem('litlink_user', JSON.stringify(user));
                    localStorage.setItem('user', JSON.stringify(user));
                }
                
                console.log('✅ Retrieved user from storage:', user.name || user.email);
                console.log('User ID:', user.id || user._id);
                
                return user;
                
            } catch (e) {
                console.error('❌ Error getting user from storage:', e);
                showMessage('Session expired. Please login again.', 'error');
                
                setTimeout(() => {
                    window.location.href = '../Homepage/index.html';
                }, 2000);
                
                return {
                    id: 'error',
                    name: 'Please Login',
                    email: '',
                    bio: '',
                    location: '',
                    pronouns: '',
                    readingHabit: '',
                    readingGoal: 0,
                    favoriteGenres: [],
                    favoriteAuthors: [],
                    favoriteBooks: [],
                    booksRead: [],
                    preferredFormats: [],
                    discussionPreferences: [],
                    receiveRecommendations: true,
                    following: [],
                    followers: [],
                    profilePicture: '',
                    createdAt: new Date().toISOString()
                };
            }
        }

        async function getCurrentUser() {
            try {
                const cachedUser = getCurrentUserFromStorage();
                
                if (cachedUser.id === 'error') {
                    return cachedUser;
                }
                
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    console.error('Missing token or userId');
                    throw new Error('Not authenticated');
                }
                
                console.log('🔄 Fetching fresh user data from API...');
                
                const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success && data.user) {
                    const mergedUser = { ...cachedUser, ...data.user };
                    
                    localStorage.setItem('litlink_user', JSON.stringify(mergedUser));
                    localStorage.setItem('user', JSON.stringify(mergedUser));
                    
                    if (mergedUser.id || mergedUser._id) {
                        const uid = mergedUser.id || mergedUser._id;
                        localStorage.setItem('litlink_userId', uid);
                        localStorage.setItem('userId', uid);
                    }
                    
                    console.log('✅ Updated user from API');
                    return mergedUser;
                } else {
                    throw new Error(data.message || 'Failed to get user');
                }
                
            } catch (error) {
                console.error('Error getting fresh user:', error);
                return getCurrentUserFromStorage();
            }
        }

        function showMessage(message, type = 'info') {
            const existing = document.querySelector('.toast-message');
            if (existing) existing.remove();
            
            const messageEl = document.createElement('div');
            messageEl.className = 'toast-message';
            messageEl.textContent = message;
            messageEl.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f5e6d3'};
                color: ${type === 'info' ? '#2c1810' : 'white'};
                padding: 12px 24px;
                border-radius: 50px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 99999;
                animation: fadeInUp 0.3s ease;
            `;
            
            document.body.appendChild(messageEl);
            
            setTimeout(() => {
                messageEl.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    if (messageEl.parentNode) {
                        messageEl.parentNode.removeChild(messageEl);
                    }
                }, 300);
            }, 3000);
        }

        // ===== PROFILE UI UPDATES =====
        function updateProfileUI(user) {
            console.log('Updating profile UI for:', user.name || user.email);
            
            // Basic info
            document.getElementById('profileName').textContent = user.name || 'Loading...';
            document.getElementById('profileUsername').textContent = '@' + (user.username || user.email?.split('@')[0] || 'user');
            document.getElementById('bioText').textContent = user.bio || 'No bio yet. Click Edit Profile to add one!';
            document.getElementById('locationText').textContent = user.location || 'Not set';
            document.getElementById('pronounsText').textContent = user.pronouns || 'Not set';
            
            // Profile picture
            const profilePic = document.getElementById('profilePicture');
            if (user.profilePicture && user.profilePicture.trim() !== '') {
                profilePic.src = user.profilePicture;
                console.log('✅ Profile picture loaded');
            } else {
                profilePic.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=E0B973&color=3B1D14&size=150`;
                console.log('✅ Using default avatar');
            }
            
            // Stats - FIXED: Use booksRead for book count
            const booksRead = Array.isArray(user.booksRead) ? user.booksRead.length : (user.booksRead || 0);
            const following = Array.isArray(user.following) ? user.following.length : (user.following || 0);
            const followers = Array.isArray(user.followers) ? user.followers.length : (user.followers || 0);
            
            document.getElementById('statBooks').textContent = booksRead;
            document.getElementById('statFollowing').textContent = following;
            document.getElementById('statFollowers').textContent = followers;
            document.getElementById('statGoal').textContent = `${booksRead}/${user.readingGoal || 0}`;
            
            // Reading stats
            document.getElementById('readingHabit').textContent = user.readingHabit || 'Not set';
            document.getElementById('readingGoal').textContent = (user.readingGoal || 0) + ' books/year';
            
            // Join date
            if (user.createdAt) {
                const date = new Date(user.createdAt);
                const memberSinceEl = document.getElementById('memberSince');
                const joinDateEl = document.getElementById('joinDate');
                
                if (memberSinceEl) {
                    memberSinceEl.textContent = date.toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric'
                    });
                }
                
                if (joinDateEl) {
                    joinDateEl.textContent = date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                }
            }
            
            // Update sections
            updateTagsSection('sectionGenres', user.favoriteGenres || [], 'favoriteGenres');
            updateTagsSection('sectionAuthors', user.favoriteAuthors || [], 'favoriteAuthors');
            updateBooksSection(user.favoriteBooks || []);
            updateTagsSection('preferredFormats', user.preferredFormats || [], null, true);
            updateTagsSection('discussionPreferences', user.discussionPreferences || [], null, true);
            
            // Preferences
            const recs = document.getElementById('receiveRecommendations');
            if (recs) {
                recs.textContent = user.receiveRecommendations !== false ? 'Enabled' : 'Disabled';
                recs.style.color = user.receiveRecommendations !== false ? '#10b981' : '#ef4444';
            }
            
            // Update completeness
            updateProfileCompleteness(user);
            
            console.log('✅ Profile UI updated');
        }

        function updateTagsSection(containerId, items, fieldName, isPreference = false) {
            const container = document.getElementById(containerId);
            if (!container) {
                console.error('Container not found:', containerId);
                return;
            }
            
            container.innerHTML = '';
            
            if (items && items.length > 0) {
                const emptyState = container.previousElementSibling;
                if (emptyState && emptyState.classList.contains('empty-state')) {
                    emptyState.style.display = 'none';
                }
                
                items.forEach(item => {
                    if (item && item.trim() !== '') {
                        const tag = document.createElement('div');
                        tag.className = 'tag';
                        
                        const span = document.createElement('span');
                        span.textContent = item;
                        tag.appendChild(span);
                        
                        if (!isPreference) {
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'remove-tag';
                            removeBtn.textContent = '×';
                            removeBtn.onclick = () => window.removeItem(fieldName, item);
                            tag.appendChild(removeBtn);
                        }
                        container.appendChild(tag);
                    }
                });
            } else {
                const emptyState = container.previousElementSibling;
                if (emptyState && emptyState.classList.contains('empty-state')) {
                    emptyState.style.display = 'flex';
                }
            }
            
            if (!isPreference && fieldName) {
                const addBtn = document.createElement('button');
                addBtn.className = 'add-tag-btn';
                addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
                addBtn.onclick = () => window.showAddTag(containerId, fieldName);
                container.appendChild(addBtn);
            } else if (isPreference && (!items || items.length === 0)) {
                const emptyTag = document.createElement('span');
                emptyTag.className = 'empty-tag';
                emptyTag.textContent = 'Not set';
                container.appendChild(emptyTag);
            }
        }

        // UPDATED BOOKS SECTION FUNCTION
        function updateBooksSection(books) {
            const container = document.getElementById('sectionBooks');
            if (!container) {
                console.error('Books container not found');
                return;
            }
            
            container.innerHTML = '';
            
            if (books && books.length > 0) {
                const emptyState = document.getElementById('emptyBooks');
                if (emptyState) emptyState.style.display = 'none';
                
                books.forEach(book => {
                    if (book && book.trim() !== '') {
                        const bookCard = document.createElement('div');
                        bookCard.className = 'book-card';
                        
                        const cover = document.createElement('div');
                        cover.className = 'book-cover';
                        cover.innerHTML = '<i class="fas fa-book"></i>';
                        
                        const title = document.createElement('div');
                        title.className = 'book-title';
                        title.textContent = book;
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-tag';
                        removeBtn.textContent = '×';
                        removeBtn.onclick = () => window.removeItem('favoriteBooks', book);
                        
                        bookCard.appendChild(cover);
                        bookCard.appendChild(title);
                        bookCard.appendChild(removeBtn);
                        container.appendChild(bookCard);
                    }
                });
            } else {
                const emptyState = document.getElementById('emptyBooks');
                if (emptyState) emptyState.style.display = 'flex';
            }
            
            // NEW: Add Book with Cover button
            const addBookBtn = document.createElement('button');
            addBookBtn.className = 'add-tag-btn';
            addBookBtn.style.width = '100%';
            addBookBtn.style.marginTop = '20px';
            addBookBtn.innerHTML = '<i class="fas fa-book"></i> Add Book with Cover';
            addBookBtn.onclick = () => window.openAddBookModal();
            container.appendChild(addBookBtn);
            
            // NEW: Add button to load books with covers
            const loadBooksBtn = document.createElement('button');
            loadBooksBtn.className = 'add-tag-btn';
            loadBooksBtn.style.width = '100%';
            loadBooksBtn.style.marginTop = '10px';
            loadBooksBtn.style.background = 'linear-gradient(135deg, #5c3a28 0%, #3d2417 100%)';
            loadBooksBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Load My Books';
            loadBooksBtn.onclick = () => {
                displayUserBooks();
                showMessage('Loading your books...', 'info');
            };
            container.appendChild(loadBooksBtn);
        }

        function updateProfileCompleteness(user) {
            let completed = 0;
            let total = 10;
            
            if (user.name && user.name.trim()) completed++;
            if (user.bio && user.bio.trim()) completed++;
            if (user.location && user.location.trim()) completed++;
            if (user.pronouns && user.pronouns.trim()) completed++;
            if (user.profilePicture && user.profilePicture.trim()) completed++;
            if (user.favoriteGenres && user.favoriteGenres.length > 0) completed++;
            if (user.favoriteAuthors && user.favoriteAuthors.length > 0) completed++;
            if (user.favoriteBooks && user.favoriteBooks.length > 0) completed++;
            if (user.readingHabit && user.readingHabit.trim()) completed++;
            if (user.readingGoal && user.readingGoal > 0) completed++;
            
            const percentage = Math.round((completed / total) * 100);
            
            const percentageEl = document.getElementById('completenessPercentage');
            const fillEl = document.getElementById('completenessFill');
            
            if (percentageEl) {
                percentageEl.textContent = `${percentage}%`;
                
                if (percentage < 30) {
                    percentageEl.style.color = '#ef4444';
                } else if (percentage < 70) {
                    percentageEl.style.color = '#f59e0b';
                } else if (percentage < 100) {
                    percentageEl.style.color = '#10b981';
                } else {
                    percentageEl.style.color = '#f5e6d3';
                }
            }
            
            if (fillEl) {
                fillEl.style.width = `${percentage}%`;
                
                if (percentage < 30) {
                    fillEl.style.background = '#ef4444';
                } else if (percentage < 70) {
                    fillEl.style.background = '#f59e0b';
                } else if (percentage < 100) {
                    fillEl.style.background = '#10b981';
                } else {
                    fillEl.style.background = '#f5e6d3';
                }
            }
        }

        // ===== BOOK FUNCTIONALITY =====

        // Open modal to add a book
        window.openAddBookModal = async function() {
          try {
            // Create modal if it doesn't exist
            if (!document.getElementById('addBookModal')) {
              createAddBookModal();
            }
            
            const modal = document.getElementById('addBookModal');
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            document.body.style.overflow = 'hidden';
            
            // Clear search results
            document.getElementById('bookSearchResults').innerHTML = '';
            
          } catch (error) {
            console.error('Error opening book modal:', error);
            showMessage('Failed to open book search', 'error');
          }
        };

        // Create the book modal HTML
        function createAddBookModal() {
          const modalHTML = `
            <div class="modal-overlay" id="addBookModal">
              <div class="signup-modal" style="max-width: 700px; max-height: 80vh;">
                <div class="modal-header">
                  <h2><i class="fas fa-book"></i> Add a Book to Your Profile</h2>
                  <button class="close-btn" onclick="closeModal('addBookModal')">&times;</button>
                </div>
                
                <div class="modal-content" style="padding: 20px;">
                  <!-- Search Section -->
                  <div class="form-group">
                    <label for="bookSearchInput">Search for a book:</label>
                    <div class="search-box">
                      <input type="text" id="bookSearchInput" placeholder="Enter book title or author..." 
                             class="search-input" onkeyup="debouncedSearchBooks()">
                      <button class="search-btn" onclick="searchBooks()">
                        <i class="fas fa-search"></i>
                      </button>
                    </div>
                    <small>Search from millions of books using Open Library</small>
                  </div>
                  
                  <!-- Search Results -->
                  <div id="bookSearchResults" class="book-search-results"></div>
                  
                  <!-- Divider -->
                  <div class="divider">
                    <span>OR</span>
                  </div>
                  
                  <!-- Manual Add -->
                  <div class="form-group">
                    <label for="manualBookTitle">Add a book manually:</label>
                    <input type="text" id="manualBookTitle" placeholder="Enter book title" class="book-input">
                    <input type="text" id="manualBookId" placeholder="Open Library ID (optional)" class="book-input">
                    <button class="save-btn" onclick="addBookManually()" style="margin-top: 10px;">
                      <i class="fas fa-plus"></i> Add This Book
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
          
          document.body.insertAdjacentHTML('beforeend', modalHTML);
          
          // Add CSS styles
          const style = document.createElement('style');
          style.textContent = `
            .search-box {
              display: flex;
              gap: 10px;
              margin-bottom: 10px;
            }
            
            .search-input {
              flex: 1;
              padding: 12px 16px;
              border: 2px solid #8b6f47;
              border-radius: 8px;
              background: rgba(139, 111, 71, 0.1);
              color: #2c1810;
              font-size: 16px;
            }
            
            .search-input:focus {
              outline: none;
              border-color: #5c3a28;
              background: rgba(139, 111, 71, 0.15);
            }
            
            .search-btn {
              padding: 12px 20px;
              background: linear-gradient(135deg, #5c3a28 0%, #3d2417 100%);
              color: #f5f0e8;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-size: 16px;
              transition: all 0.3s ease;
            }
            
            .search-btn:hover {
              background: linear-gradient(135deg, #3d2417 0%, #2c1810 100%);
              transform: translateY(-2px);
            }
            
            .book-search-results {
              max-height: 300px;
              overflow-y: auto;
              margin: 20px 0;
              border: 1px solid rgba(139, 111, 71, 0.3);
              border-radius: 8px;
              padding: 10px;
            }
            
            .book-result-item {
              display: flex;
              align-items: center;
              padding: 12px;
              border-bottom: 1px solid rgba(139, 111, 71, 0.2);
              cursor: pointer;
              transition: background 0.2s;
            }
            
            .book-result-item:hover {
              background: rgba(245, 230, 211, 0.3);
            }
            
            .book-result-cover {
              width: 60px;
              height: 90px;
              object-fit: cover;
              border-radius: 4px;
              margin-right: 15px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            
            .book-result-info {
              flex: 1;
            }
            
            .book-result-title {
              font-weight: 600;
              color: #2c1810;
              margin-bottom: 4px;
            }
            
            .book-result-author {
              color: #5c3a28;
              font-size: 14px;
              margin-bottom: 4px;
            }
            
            .book-result-year {
              color: #8b6f47;
              font-size: 13px;
            }
            
            .book-input {
              width: 100%;
              padding: 10px;
              margin: 8px 0;
              border: 2px solid #8b6f47;
              border-radius: 6px;
              background: rgba(139, 111, 71, 0.1);
            }
            
            .divider {
              display: flex;
              align-items: center;
              margin: 20px 0;
              color: #8b6f47;
            }
            
            .divider::before,
            .divider::after {
              content: '';
              flex: 1;
              height: 1px;
              background: rgba(139, 111, 71, 0.3);
            }
            
            .divider span {
              padding: 0 15px;
              font-size: 14px;
            }
            
            .book-card-display {
              display: flex;
              align-items: center;
              background: rgba(245, 230, 211, 0.2);
              padding: 15px;
              border-radius: 10px;
              margin: 10px 0;
            }
            
            .book-card-cover {
              width: 80px;
              height: 120px;
              object-fit: cover;
              border-radius: 6px;
              margin-right: 15px;
              box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
            }
            
            .book-card-info {
              flex: 1;
            }
            
            .book-card-title {
              font-weight: 600;
              color: #2c1810;
              margin-bottom: 5px;
            }
            
            .book-card-author {
              color: #5c3a28;
              font-size: 14px;
              margin-bottom: 10px;
            }
            
            .remove-book-btn {
              background: #ef4444;
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
            }
            
            .remove-book-btn:hover {
              background: #dc2626;
            }
          `;
          
          document.head.appendChild(style);
        }

        // Debounced search function
        let searchTimeout;
        function debouncedSearchBooks() {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(searchBooks, 500);
        }

        // Search books in Open Library - IMPROVED with better error handling
        async function searchBooks() {
          const query = document.getElementById('bookSearchInput').value.trim();
          const resultsContainer = document.getElementById('bookSearchResults');
          
          if (!query || query.length < 2) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #8b6f47; padding: 20px;">Type at least 2 characters to search</p>';
            return;
          }
          
          resultsContainer.innerHTML = '<p style="text-align: center; color: #8b6f47; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Searching...</p>';
          
          try {
            const token = getToken();
            console.log('🔍 Searching for:', query);
            console.log('🔑 Token available:', !!token);
            
            // Try backend API first
            if (token) {
              console.log('Trying backend API...');
              const backendResponse = await fetch(`${API_BASE_URL}/books/search?query=${encodeURIComponent(query)}&limit=8`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              console.log('Backend response status:', backendResponse.status);
              
              if (backendResponse.ok) {
                const data = await backendResponse.json();
                console.log('Backend response data:', data);
                
                if (data.success && data.books && data.books.length > 0) {
                  displaySearchResults(data.books, resultsContainer);
                  return;
                }
              }
            }
            
            // Fallback to direct Open Library API
            console.log('⚠️ Backend failed, trying direct Open Library API...');
            await searchDirectOpenLibrary(query, resultsContainer);
            
          } catch (error) {
            console.error('❌ Search error:', error);
            resultsContainer.innerHTML = `
              <p style="text-align: center; color: #ef4444; padding: 20px;">
                <i class="fas fa-exclamation-triangle"></i><br>
                Search failed: ${error.message}<br>
                <button onclick="searchBooks()" style="margin-top: 10px; padding: 8px 16px; background: #5c3a28; color: #f5e6d3; border: none; border-radius: 6px; cursor: pointer;">
                  Try Again
                </button>
              </p>
            `;
          }
        }

        // Display search results helper - FIXED with safe placeholder URLs
        function displaySearchResults(books, container) {
          container.innerHTML = '';
          
          books.forEach(book => {
            const bookItem = document.createElement('div');
            bookItem.className = 'book-result-item';
            
            const safeTitle = (book.title || 'Unknown').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeId = book.id || `custom-${Date.now()}-${Math.random()}`;
            
            // Use safe placeholder
            const coverUrl = book.cover || getPlaceholderImage(book.title, 60, 90);
            
            bookItem.innerHTML = `
              <img src="${coverUrl}" 
                   alt="${book.title}" 
                   class="book-result-cover" 
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div style="display:none; width:60px; height:90px; background:#3d2617; border-radius:4px; align-items:center; justify-content:center; margin-right:15px;">
                <i class="fas fa-book" style="color:#8b6f47; font-size:24px;"></i>
              </div>
              <div class="book-result-info">
                <div class="book-result-title">${book.title || 'Unknown Title'}</div>
                <div class="book-result-author">${book.authors?.join(', ') || 'Unknown Author'}</div>
                <div class="book-result-year">${book.first_publish_year ? `Published: ${book.first_publish_year}` : ''}</div>
              </div>
              <button class="save-btn small" onclick="event.stopPropagation(); addBookFromSearch('${safeId}', '${safeTitle}')">
                Add
              </button>
            `;
            
            container.appendChild(bookItem);
          });
          
          console.log('✅ Displayed', books.length, 'books');
        }

        // Direct Open Library API fallback - FIXED with safe placeholder URLs
        async function searchDirectOpenLibrary(query, resultsContainer) {
          try {
            console.log('📚 Searching Open Library directly for:', query);
            
            const response = await fetch(
              `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`
            );
            
            if (!response.ok) {
              throw new Error(`Open Library API error: ${response.status}`);
            }
            
            const searchData = await response.json();
            console.log('Open Library response:', searchData);
            
            if (searchData.docs && searchData.docs.length > 0) {
              const books = searchData.docs.slice(0, 8).map(doc => ({
                id: doc.key ? doc.key.replace('/works/', '') : `ol-${Date.now()}-${Math.random()}`,
                title: doc.title || 'Unknown Title',
                authors: doc.author_name || ['Unknown Author'],
                first_publish_year: doc.first_publish_year || null,
                cover: doc.cover_i 
                  ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                  : getPlaceholderImage(doc.title, 150, 200)
              }));
              
              displaySearchResults(books, resultsContainer);
            } else {
              resultsContainer.innerHTML = '<p style="text-align: center; color: #8b6f47; padding: 20px;">No books found. Try a different search term.</p>';
            }
          } catch (directError) {
            console.error('❌ Direct API search error:', directError);
            resultsContainer.innerHTML = `
              <p style="text-align: center; color: #ef4444; padding: 20px;">
                <i class="fas fa-exclamation-triangle"></i><br>
                Search service unavailable<br>
                <small>${directError.message}</small><br>
                <button onclick="searchBooks()" style="margin-top: 10px; padding: 8px 16px; background: #5c3a28; color: #f5e6d3; border: none; border-radius: 6px; cursor: pointer;">
                  Try Again
                </button>
              </p>
            `;
          }
        }

        // IMPROVED: Add book from search results
        async function addBookFromSearch(bookId, bookTitle) {
          try {
            const token = getToken();
            const userId = getUserId();
            
            console.log('📖 Adding book:', bookTitle);
            console.log('Token:', !!token, 'UserId:', userId);
            
            if (!token || !userId) {
              showMessage('Please login first', 'error');
              return;
            }
            
            // Show loading state
            const addButtons = document.querySelectorAll('.save-btn');
            addButtons.forEach(btn => {
              if (btn.textContent === 'Add' && btn.onclick.toString().includes(bookId)) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.disabled = true;
              }
            });
            
            const response = await fetch(`${API_BASE_URL}/users/${userId}/books`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                bookId: bookId,
                bookTitle: bookTitle
              })
            });
            
            console.log('Add book response status:', response.status);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('Add book error response:', errorText);
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Add book response data:', data);
            
            if (data.success && data.book) {
              // Immediately add the book to the display with cover
              const booksContainer = document.getElementById('sectionBooks');
              if (booksContainer) {
                const emptyState = document.getElementById('emptyBooks');
                if (emptyState) emptyState.style.display = 'none';
                
                const bookCard = document.createElement('div');
                bookCard.className = 'book-card-display';
                
                const safeTitle = data.book.title || bookTitle;
                const placeholderUrl = getPlaceholderImage(safeTitle, 150, 200);
                const coverUrl = data.book.cover || placeholderUrl;
                
                console.log('📖 Adding book with cover:', coverUrl);
                
                bookCard.innerHTML = `
                  <img src="${coverUrl}" 
                       alt="${safeTitle}" 
                       class="book-card-cover" 
                       onerror="this.onerror=null; this.src='${placeholderUrl}'; this.style.objectFit='cover';">
                  <div class="book-card-info">
                    <div class="book-card-title">${safeTitle}</div>
                    ${data.book.author ? `<div class="book-card-author">${data.book.author}</div>` : ''}
                    <small>Added: ${new Date(data.book.addedAt || Date.now()).toLocaleDateString()}</small>
                  </div>
                  <button class="remove-book-btn" onclick="removeBookFromProfile('${data.book.id}')">
                    <i class="fas fa-times"></i>
                  </button>
                `;
                
                // Ensure cover loads or falls back properly
                const img = bookCard.querySelector('img');
                img.addEventListener('error', function() {
                  console.log('⚠️ Cover image failed to load, using placeholder');
                  this.src = placeholderUrl;
                  this.style.display = 'block';
                });
                
                img.addEventListener('load', function() {
                  console.log('✅ Cover image loaded successfully');
                });
                
                // Insert before the buttons
                const addBookBtn = booksContainer.querySelector('.add-tag-btn');
                if (addBookBtn) {
                  booksContainer.insertBefore(bookCard, addBookBtn);
                } else {
                  booksContainer.appendChild(bookCard);
                }
                
                // Update stats
                const currentCount = parseInt(document.getElementById('statBooks')?.textContent || '0');
                document.getElementById('statBooks').textContent = currentCount + 1;
              }
              
              showMessage('Book added to your profile!', 'success');
              closeModal('addBookModal');
              
              // Also refresh the full books list after a delay to ensure consistency
              setTimeout(() => {
                displayUserBooks();
              }, 1000);
            } else {
              throw new Error(data.message || 'Failed to add book');
            }
          } catch (error) {
            console.error('❌ Error adding book:', error);
            showMessage(`Failed to add book: ${error.message}`, 'error');
            
            // Reset button state
            const addButtons = document.querySelectorAll('.save-btn');
            addButtons.forEach(btn => {
              if (btn.disabled) {
                btn.innerHTML = 'Add';
                btn.disabled = false;
              }
            });
          }
        }

        // Display user's books in the profile - COMPLETELY FIXED with safe URLs
        async function displayUserBooks() {
          try {
            const token = getToken();
            const userId = getUserId();
            
            if (!token || !userId) {
              console.error('No token or userId');
              return;
            }
            
            const response = await fetch(`${API_BASE_URL}/users/${userId}/books`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
              const booksContainer = document.getElementById('sectionBooks');
              if (!booksContainer) return;
              
              // Clear only the books with covers section (keep the buttons)
              const existingBooks = booksContainer.querySelectorAll('.book-card-display');
              existingBooks.forEach(book => book.remove());
              
              if (data.books.length > 0) {
                const emptyState = document.getElementById('emptyBooks');
                if (emptyState) emptyState.style.display = 'none';
                
                data.books.forEach(book => {
                  const bookCard = document.createElement('div');
                  bookCard.className = 'book-card-display';
                  
                  const safeTitle = book.title || 'Unknown Book';
                  const placeholderUrl = getPlaceholderImage(safeTitle, 150, 200);
                  const coverUrl = book.cover || placeholderUrl;
                  
                  console.log(`📖 Rendering book "${safeTitle}" with cover: ${coverUrl}`);
                  
                  bookCard.innerHTML = `
                    <img src="${coverUrl}" 
                         alt="${safeTitle}" 
                         class="book-card-cover" 
                         onerror="console.error('Cover failed:', this.src); this.onerror=null; this.src='${placeholderUrl}'; this.style.objectFit='cover';">
                    <div class="book-card-info">
                      <div class="book-card-title">${safeTitle}</div>
                      ${book.author ? `<div class="book-card-author">${book.author}</div>` : ''}
                      <small>Added: ${new Date(book.addedAt).toLocaleDateString()}</small>
                    </div>
                    <button class="remove-book-btn" onclick="removeBookFromProfile('${book.id}')">
                      <i class="fas fa-times"></i>
                    </button>
                  `;
                  
                  // Ensure cover loads or falls back properly
                  const img = bookCard.querySelector('img');
                  img.addEventListener('error', function() {
                    this.src = placeholderUrl;
                    this.style.display = 'block';
                  });
                  
                  // Insert before the buttons
                  const addBookBtn = booksContainer.querySelector('.add-tag-btn');
                  if (addBookBtn) {
                    booksContainer.insertBefore(bookCard, addBookBtn);
                  } else {
                    booksContainer.appendChild(bookCard);
                  }
                });
              } else {
                const emptyState = document.getElementById('emptyBooks');
                if (emptyState) emptyState.style.display = 'flex';
              }
              
              // Update the "Books Read" stat
              document.getElementById('statBooks').textContent = data.total;
              
              // Update stats in user object
              const user = getCurrentUserFromStorage();
              user.booksRead = data.books;
              localStorage.setItem('litlink_user', JSON.stringify(user));
              localStorage.setItem('user', JSON.stringify(user));
              
              console.log(`✅ Loaded ${data.total} books with covers`);
              
            } else {
              console.error('Failed to load books:', data.message);
            }
          } catch (error) {
            console.error('Error loading books:', error);
            showMessage('Failed to load books: ' + error.message, 'error');
          }
        }

        // Remove book from profile
        async function removeBookFromProfile(bookId) {
          if (!confirm('Remove this book from your profile?')) return;
          
          try {
            const token = getToken();
            const userId = getUserId();
            
            if (!token || !userId) {
              showMessage('Please login first', 'error');
              return;
            }
            
            const response = await fetch(`${API_BASE_URL}/users/${userId}/books/${encodeURIComponent(bookId)}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            const data = await response.json();
            
            if (data.success) {
              showMessage('Book removed from your profile', 'success');
              displayUserBooks();
            } else {
              showMessage(data.message || 'Failed to remove book', 'error');
            }
          } catch (error) {
            console.error('Error removing book:', error);
            showMessage('Failed to remove book', 'error');
          }
        }

        // ===== GLOBAL FUNCTIONS =====
        window.toggleSettings = function() {
            const settingsMenu = document.getElementById('settingsMenu');
            if (settingsMenu) {
                settingsMenu.classList.toggle('active');
            }
        };

        window.toggleDarkMode = function() {
            const toggle = document.getElementById('darkModeToggle');
            if (toggle.checked) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        };

        window.toggleNotifications = function() {
            const toggle = document.getElementById('notificationsToggle');
            console.log('Notifications:', toggle.checked ? 'Enabled' : 'Disabled');
        };

        window.toggleMobileMenu = function() {
            const navLinks = document.querySelector('.nav-links');
            navLinks.classList.toggle('active');
        };

        window.logout = async function() {
            if (confirm('Are you sure you want to logout?')) {
                // Clear ALL auth data
                localStorage.removeItem('litlink_user');
                localStorage.removeItem('litlink_token');
                localStorage.removeItem('litlink_userId');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('userId');
                
                window.location.href = '../Homepage/index.html';
            }
        };

        window.openEditProfileModal = function() {
            const modal = document.getElementById('editProfileModal');
            if (modal) {
                getCurrentUser().then(user => {
                    document.getElementById('editName').value = user.name || '';
                    document.getElementById('editUsername').value = user.username || '';
                    document.getElementById('editEmail').value = user.email || '';
                    document.getElementById('editPhone').value = user.phone || '';
                    document.getElementById('editLocation').value = user.location || '';
                    document.getElementById('editPronouns').value = user.pronouns || '';
                    document.getElementById('editBio').value = user.bio || '';
                    
                    modal.style.display = 'flex';
                    modal.style.visibility = 'visible';
                    modal.style.opacity = '1';
                    document.body.style.overflow = 'hidden';
                });
            }
        };

        window.openReadingStatsModal = function() {
            const modal = document.getElementById('editReadingStatsModal');
            if (modal) {
                getCurrentUser().then(user => {
                    document.getElementById('editReadingHabit').value = user.readingHabit || '';
                    document.getElementById('editReadingGoal').value = user.readingGoal || 12;
                    modal.style.display = 'flex';
                    modal.style.visibility = 'visible';
                    modal.style.opacity = '1';
                    document.body.style.overflow = 'hidden';
                });
            }
        };

        window.openPreferencesModal = function() {
            const modal = document.getElementById('editPreferencesModal');
            if (modal) {
                getCurrentUser().then(user => {
                    const formats = user.preferredFormats || [];
                    document.querySelectorAll('input[name="format"]').forEach(cb => {
                        cb.checked = formats.includes(cb.value);
                    });
                    
                    const discussions = user.discussionPreferences || [];
                    document.querySelectorAll('input[name="discussion"]').forEach(cb => {
                        cb.checked = discussions.includes(cb.value);
                    });
                    
                    document.getElementById('editRecommendations').value = 
                        user.receiveRecommendations !== false ? 'true' : 'false';
                    
                    modal.style.display = 'flex';
                    modal.style.visibility = 'visible';
                    modal.style.opacity = '1';
                    document.body.style.overflow = 'hidden';
                });
            }
        };

        window.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.opacity = '0';
                setTimeout(() => {
                    modal.style.display = 'none';
                    modal.style.visibility = 'hidden';
                    document.body.style.overflow = 'auto';
                }, 300);
            }
        };

        window.saveProfileChanges = async function(event) {
            event.preventDefault();
            console.log('Saving profile changes...');
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    setTimeout(() => {
                        window.location.href = '../Homepage/index.html';
                    }, 2000);
                    return;
                }
                
                const updateData = {
                    name: document.getElementById('editName').value,
                    username: document.getElementById('editUsername').value,
                    bio: document.getElementById('editBio').value || '',
                    location: document.getElementById('editLocation').value || '',
                    pronouns: document.getElementById('editPronouns').value || ''
                };
                
                const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update local storage
                    const user = getCurrentUserFromStorage();
                    const updatedUser = { ...user, ...updateData };
                    localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    
                    // Update UI
                    updateProfileUI(updatedUser);
                    
                    // Close modal
                    closeModal('editProfileModal');
                    
                    showMessage('Profile updated successfully!', 'success');
                } else {
                    showMessage(data.message || 'Failed to update profile', 'error');
                }
            } catch (error) {
                console.error('Error saving profile:', error);
                showMessage('Network error. Please try again.', 'error');
            }
        };

        window.saveReadingStats = async function(event) {
            event.preventDefault();
            console.log('Saving reading stats...');
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    setTimeout(() => {
                        window.location.href = '../Homepage/index.html';
                    }, 2000);
                    return;
                }
                
                const updateData = {
                    readingHabit: document.getElementById('editReadingHabit').value,
                    readingGoal: parseInt(document.getElementById('editReadingGoal').value) || 12
                };
                
                const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update local storage
                    const user = getCurrentUserFromStorage();
                    const updatedUser = { ...user, ...updateData };
                    localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    
                    // Update UI
                    updateProfileUI(updatedUser);
                    
                    closeModal('editReadingStatsModal');
                    showMessage('Reading stats updated!', 'success');
                } else {
                    showMessage(data.message || 'Failed to update reading stats', 'error');
                }
            } catch (error) {
                console.error('Error saving reading stats:', error);
                showMessage('Network error. Please try again.', 'error');
            }
        };

        window.savePreferences = async function(event) {
            event.preventDefault();
            console.log('Saving preferences...');
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    setTimeout(() => {
                        window.location.href = '../Homepage/index.html';
                    }, 2000);
                    return;
                }
                
                // Get formats
                const preferredFormats = [];
                document.querySelectorAll('input[name="format"]:checked').forEach(cb => {
                    preferredFormats.push(cb.value);
                });
                
                // Get discussions
                const discussionPreferences = [];
                document.querySelectorAll('input[name="discussion"]:checked').forEach(cb => {
                    discussionPreferences.push(cb.value);
                });
                
                // Get recommendations
                const receiveRecommendations = document.getElementById('editRecommendations').value === 'true';
                
                const updateData = {
                    preferredFormats,
                    discussionPreferences,
                    receiveRecommendations
                };
                
                const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update local storage
                    const user = getCurrentUserFromStorage();
                    const updatedUser = { ...user, ...updateData };
                    localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    
                    // Update UI
                    updateProfileUI(updatedUser);
                    
                    closeModal('editPreferencesModal');
                    showMessage('Preferences updated!', 'success');
                } else {
                    showMessage(data.message || 'Failed to update preferences', 'error');
                }
            } catch (error) {
                console.error('Error saving preferences:', error);
                showMessage('Network error. Please try again.', 'error');
            }
        };

        window.showAddTag = function(containerId, fieldName) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            const existingInput = container.querySelector('.tag-input-container');
            if (existingInput) existingInput.remove();
            
            const addBtn = container.querySelector('.add-tag-btn');
            if (addBtn) addBtn.style.display = 'none';
            
            const inputContainer = document.createElement('div');
            inputContainer.className = 'tag-input-container';
            inputContainer.innerHTML = `
                <div class="tag-input-row">
                    <input type="text" class="tag-input" id="tagInput_${fieldName}" 
                           placeholder="Enter ${fieldName.replace('favorite', '').toLowerCase()}...">
                </div>
                <div class="tag-input-buttons">
                    <button type="button" class="tag-input-btn secondary" onclick="cancelAddTag('${containerId}')">
                        Cancel
                    </button>
                    <button type="button" class="tag-input-btn primary" onclick="addNewItem('${containerId}', '${fieldName}')">
                        Add
                    </button>
                </div>
            `;
            
            container.appendChild(inputContainer);
            
            const input = document.getElementById(`tagInput_${fieldName}`);
            if (input) {
                input.focus();
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewItem(containerId, fieldName);
                    }
                });
            }
        };

        window.cancelAddTag = function(containerId) {
            const container = document.getElementById(containerId);
            const inputContainer = container.querySelector('.tag-input-container');
            if (inputContainer) inputContainer.remove();
            
            const addBtn = container.querySelector('.add-tag-btn');
            if (addBtn) addBtn.style.display = 'flex';
        };

        window.addNewItem = async function(containerId, fieldName) {
            const input = document.getElementById(`tagInput_${fieldName}`);
            if (!input) return;
            
            const newItem = input.value.trim();
            if (!newItem) {
                showMessage('Please enter something', 'error');
                return;
            }
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    setTimeout(() => {
                        window.location.href = '../Homepage/index.html';
                    }, 2000);
                    return;
                }
                
                const userResponse = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const userData = await userResponse.json();
                
                if (!userData.success) {
                    throw new Error('Failed to fetch user data');
                }
                
                let items = userData.user[fieldName] || [];
                
                if (items.some(item => item.toLowerCase() === newItem.toLowerCase())) {
                    showMessage('This already exists in your list', 'error');
                    return;
                }
                
                items.push(newItem);
                
                const updateData = { [fieldName]: items };
                
                const updateResponse = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const updateDataResult = await updateResponse.json();
                
                if (updateDataResult.success) {
                    const user = getCurrentUserFromStorage();
                    const updatedUser = { ...user, [fieldName]: items };
                    
                    // Save to ALL storage locations
                    localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    
                    if (fieldName === 'favoriteBooks') {
                        updateBooksSection(items);
                    } else if (fieldName === 'favoriteGenres') {
                        updateTagsSection('sectionGenres', items, fieldName);
                    } else if (fieldName === 'favoriteAuthors') {
                        updateTagsSection('sectionAuthors', items, fieldName);
                    }
                    
                    updateProfileCompleteness(updatedUser);
                    cancelAddTag(containerId);
                    showMessage(`Added "${newItem}" successfully!`, 'success');
                } else {
                    showMessage(updateDataResult.message || 'Failed to save', 'error');
                }
            } catch (error) {
                console.error('Error adding item:', error);
                showMessage('Failed to save. Please try again.', 'error');
            }
        };

        window.removeItem = async function(fieldName, itemValue) {
            if (!confirm(`Remove "${itemValue}"?`)) return;
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    setTimeout(() => {
                        window.location.href = '../Homepage/index.html';
                    }, 2000);
                    return;
                }
                
                const userResponse = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const userData = await userResponse.json();
                
                if (!userData.success) {
                    throw new Error('Failed to fetch user data');
                }
                
                let items = userData.user[fieldName] || [];
                items = items.filter(item => item !== itemValue);
                
                const updateData = { [fieldName]: items };
                
                const updateResponse = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const updateDataResult = await updateResponse.json();
                
                if (updateDataResult.success) {
                    const user = getCurrentUserFromStorage();
                    const updatedUser = { ...user, [fieldName]: items };
                    
                    // Save to ALL storage locations
                    localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    
                    if (fieldName === 'favoriteBooks') {
                        updateBooksSection(items);
                    } else if (fieldName === 'favoriteGenres') {
                        updateTagsSection('sectionGenres', items, fieldName);
                    } else if (fieldName === 'favoriteAuthors') {
                        updateTagsSection('sectionAuthors', items, fieldName);
                    }
                    
                    updateProfileCompleteness(updatedUser);
                    showMessage(`Removed "${itemValue}" successfully!`, 'success');
                } else {
                    showMessage(updateDataResult.message || 'Failed to remove', 'error');
                }
            } catch (error) {
                console.error('Error removing item:', error);
                showMessage('Failed to remove. Please try again.', 'error');
            }
        };

        window.handleProfilePictureUpload = async function(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                showMessage('Please select an image file', 'error');
                return;
            }
            
            try {
                const reader = new FileReader();
                reader.onload = async function(e) {
                    try {
                        const token = getToken();
                        const userId = getUserId();
                        
                        if (!token || !userId) {
                            showMessage('Session expired. Please login again.', 'error');
                            setTimeout(() => {
                                window.location.href = '../Homepage/index.html';
                            }, 2000);
                            return;
                        }
                        
                        const updateData = {
                            profilePicture: e.target.result
                        };
                        
                        const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(updateData)
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            const user = getCurrentUserFromStorage();
                            const updatedUser = { ...user, profilePicture: e.target.result };
                            
                            // Save to ALL storage locations
                            localStorage.setItem('litlink_user', JSON.stringify(updatedUser));
                            localStorage.setItem('user', JSON.stringify(updatedUser));
                            
                            document.getElementById('profilePicture').src = e.target.result;
                            updateProfileCompleteness(updatedUser);
                            showMessage('Profile picture updated!', 'success');
                        } else {
                            showMessage(data.message || 'Failed to update profile picture', 'error');
                        }
                    } catch (error) {
                        console.error('Error saving profile picture:', error);
                        showMessage('Failed to update profile picture', 'error');
                    }
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error reading file:', error);
                showMessage('Error processing image', 'error');
            }
        };

        window.shareProfile = function() {
            getCurrentUser().then(user => {
                const name = user.name || 'User';
                const profileUrl = window.location.href;
                
                if (navigator.share) {
                    navigator.share({
                        title: `${name}'s Profile`,
                        text: `Check out ${name}'s reading profile on Litlink!`,
                        url: profileUrl
                    });
                } else {
                    navigator.clipboard.writeText(profileUrl).then(() => {
                        showMessage('Profile link copied to clipboard!', 'success');
                    });
                }
            });
        };

        window.showDeleteAccountModal = function() {
            getCurrentUser().then(user => {
                document.getElementById('confirmEmail').value = '';
                const modal = document.getElementById('deleteAccountModal');
                modal.style.display = 'flex';
                modal.style.visibility = 'visible';
                modal.style.opacity = '1';
                document.body.style.overflow = 'hidden';
            });
        };

        window.deleteAccount = async function() {
            const email = document.getElementById('confirmEmail').value;
            
            try {
                const token = getToken();
                const userId = getUserId();
                
                if (!token || !userId) {
                    showMessage('Session expired. Please login again.', 'error');
                    return;
                }
                
                const userResponse = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                const userData = await userResponse.json();
                
                if (!userData.success) {
                    showMessage('Failed to verify account', 'error');
                    return;
                }
                
                if (email !== userData.user.email) {
                    showMessage('Email does not match', 'error');
                    return;
                }
                
                if (confirm('Are you sure? This cannot be undone!')) {
                    const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        // Clear ALL storage
                        localStorage.clear();
                        showMessage('Account deleted. Redirecting...', 'success');
                        setTimeout(() => {
                            window.location.href = '../Homepage/index.html';
                        }, 1500);
                    } else {
                        showMessage(data.message || 'Failed to delete account', 'error');
                    }
                }
            } catch (error) {
                console.error('Error deleting account:', error);
                showMessage('Network error. Please try again.', 'error');
            }
        };

        window.toggleSection = function(sectionId) {
            const content = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
            const icon = document.getElementById('toggle' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
            
            if (content && icon) {
                content.classList.toggle('collapsed');
                if (content.classList.contains('collapsed')) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                } else {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            }
        };

        // ===== DEBUG UTILITIES =====
        function debugProfileStorage() {
            console.log('🔍 PROFILE DEBUG localStorage:');
            console.log('Token:', getToken() ? '✓' : '✗');
            console.log('UserId:', getUserId() || 'null');
            
            const user = getCurrentUserFromStorage();
            console.log('User:', user.name || 'null');
            console.log('Profile Picture:', user.profilePicture ? '✓' : '✗');
            console.log('Bio:', user.bio ? '✓' : '✗');
            console.log('Favorite Books:', user.favoriteBooks?.length || 0);
            console.log('Books with Covers:', user.booksRead?.length || 0);
        }

        // ===== INITIALIZATION =====
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Profile page initialized');
            
            // Verify authentication
            const token = getToken();
            const userId = getUserId();
            
            console.log('Auth check - Token:', !!token, 'UserId:', !!userId);
            
            if (!token || !userId) {
                console.error('❌ Not authenticated');
                showMessage('Please login to view your profile', 'error');
                setTimeout(() => {
                    window.location.href = '../Homepage/index.html';
                }, 2000);
                return;
            }
            
            // Load user data
            getCurrentUser().then(user => {
                if (user.id === 'error') {
                    return;
                }
                updateProfileUI(user);
                // Load books with covers
                displayUserBooks();
            }).catch(error => {
                console.error('Error loading user:', error);
                showMessage('Failed to load profile. Please login again.', 'error');
            });
            
            // Close settings when clicking outside
            document.addEventListener('click', function(event) {
                const settingsMenu = document.getElementById('settingsMenu');
                const settingsBtn = document.querySelector('.settings-btn');
                
                if (settingsMenu && settingsBtn && 
                    !settingsMenu.contains(event.target) && 
                    !settingsBtn.contains(event.target)) {
                    settingsMenu.classList.remove('active');
                }
            });
            
            // Close modals when clicking overlay
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        closeModal(modal.id);
                    }
                });
            });
            
            // Close modals when pressing Escape
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    document.querySelectorAll('.modal-overlay').forEach(modal => {
                        if (modal.style.display === 'flex') {
                            closeModal(modal.id);
                        }
                    });
                    
                    // Close settings menu
                    const settingsMenu = document.getElementById('settingsMenu');
                    if (settingsMenu) {
                        settingsMenu.classList.remove('active');
                    }
                }
            });
            
            // Hide loading overlay
            setTimeout(() => {
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
            }, 500);
            
            // Add debug button
            const debugBtn = document.createElement('button');
            debugBtn.textContent = '🔍 Debug Profile';
            debugBtn.style.position = 'fixed';
            debugBtn.style.bottom = '50px';
            debugBtn.style.right = '10px';
            debugBtn.style.zIndex = '9999';
            debugBtn.style.padding = '5px 10px';
            debugBtn.style.background = '#333';
            debugBtn.style.color = 'white';
            debugBtn.style.border = 'none';
            debugBtn.style.borderRadius = '5px';
            debugBtn.style.fontSize = '12px';
            debugBtn.style.cursor = 'pointer';
            debugBtn.onclick = debugProfileStorage;
            document.body.appendChild(debugBtn);
            
            console.log('✅ All functionality loaded');
        });
