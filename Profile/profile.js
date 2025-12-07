// profile.js - FIXED VERSION (NO DUPLICATE API_BASE)

console.log('✅ Profile page loaded');

// ==================== LOAD PROFILE DATA ====================
async function loadProfileData() {
    console.log('📥 Loading profile data...');
    
    try {
        const userString = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (!userString || !token) {
            alert('Please login first');
            window.location.href = '../Homepage/index.html';
            return;
        }
        
        const user = JSON.parse(userString);
        console.log('👤 User from localStorage:', user);
        
        // 1. FIRST update UI with localStorage data
        updateProfileUI(user);
        
        // Hide loading
        document.getElementById('loadingOverlay').style.display = 'none';
        
        // 2. THEN get COMPLETE data from backend
        try {
            console.log('🔄 Fetching complete user data from backend...');
            const response = await fetch(`http://127.0.0.1:5002/api/auth/user/${user.id}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Backend response:', data);
                
                if (data.success) {
                    // Debug: Check questionnaire data
                    console.log('📋 Questionnaire data received:');
                    console.log('- Favorite genres:', data.user.favoriteGenres);
                    console.log('- Favorite authors:', data.user.favoriteAuthors);
                    console.log('- Favorite books:', data.user.favoriteBooks);
                    
                    // Update UI with COMPLETE data from backend
                    updateProfileUI(data.user);
                    
                    // Update localStorage with complete data
                    localStorage.setItem('user', JSON.stringify(data.user));
                }
            }
        } catch (error) {
            console.log('⚠️ Backend fetch error:', error);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

// ==================== UPDATE PROFILE UI ====================
function updateProfileUI(user) {
    console.log('🎨 Updating UI with user data:', user.name);
    
    // 1. BASIC INFO - ALWAYS SHOW
    document.getElementById('profileName').textContent = user.name || 'User';
    document.getElementById('profileUsername').textContent = '@' + (user.username || user.email?.split('@')[0] || 'username');
    document.getElementById('profileBio').textContent = user.bio || 'No bio yet. Click edit to add one!';
    document.getElementById('profileLocation').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${user.location || 'Not set'}`;
    document.getElementById('profilePronouns').innerHTML = `<i class="fas fa-user"></i> ${user.pronouns || 'Not set'}`;
    
    // 2. PROFILE PICTURE
    const profilePic = document.getElementById('profilePicture');
    if (user.profilePicture && user.profilePicture !== 'https://via.placeholder.com/150') {
        profilePic.src = user.profilePicture;
    } else {
        profilePic.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=E0B973&color=3B1D14&size=150`;
    }
    
    // 3. STATS
    const booksRead = user.booksRead || [];
    const following = user.following || [];
    const followers = user.followers || [];
    const readingGoal = user.readingGoal || 12;
    
    document.getElementById('statBooks').textContent = booksRead.length;
    document.getElementById('statFollowing').textContent = following.length;
    document.getElementById('statFollowers').textContent = followers.length;
    document.getElementById('statGoal').textContent = `${booksRead.length}/${readingGoal}`;
    
    // 4. READING STATS
    document.getElementById('readingHabit').textContent = user.readingHabit || 'Not set';
    document.getElementById('readingGoal').textContent = readingGoal + ' books/year';
    
    // Join date
    if (user.createdAt) {
        try {
            const date = new Date(user.createdAt);
            document.getElementById('memberSince').textContent = date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            document.getElementById('memberSince').textContent = 'Recently';
        }
    }
    
    // 5. QUESTIONNAIRE DATA
    // Favorite genres
    updateTagsSection('favoriteGenres', user.favoriteGenres || []);
    
    // Favorite authors
    updateTagsSection('favoriteAuthors', user.favoriteAuthors || []);
    
    // Favorite books
    updateBooksSection('favoriteBooks', user.favoriteBooks || []);
    
    // Preferences
    updateTagsSection('preferredFormats', user.preferredFormats || [], true);
    updateTagsSection('discussionPreferences', user.discussionPreferences || [], true);
    
    // Email preferences
    document.getElementById('receiveRecommendations').textContent = 
        user.receiveRecommendations ? 'Enabled' : 'Disabled';
}

// Helper function for tags
function updateTagsSection(containerId, items, isPreference = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!items || items.length === 0) {
        if (isPreference) {
            container.innerHTML = '<span class="empty-tag">Not set</span>';
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tags"></i>
                    <p>No ${containerId.replace(/([A-Z])/g, ' $1').toLowerCase()} yet</p>
                </div>`;
        }
        return;
    }
    
    container.innerHTML = '';
    items.forEach(item => {
        if (item && item.trim() !== '') {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.textContent = item;
            container.appendChild(tag);
        }
    });
}

// Helper function for books
function updateBooksSection(containerId, books) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!books || books.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book-open"></i>
                <p>No favorite books yet</p>
            </div>`;
        return;
    }
    
    container.innerHTML = '';
    books.forEach(book => {
        if (book && book.trim() !== '') {
            const bookCard = document.createElement('div');
            bookCard.className = 'book-card';
            bookCard.innerHTML = `
                <div class="book-cover">
                    <i class="fas fa-book"></i>
                </div>
                <div class="book-title">${book}</div>
            `;
            container.appendChild(bookCard);
        }
    });
}

// ==================== EDIT PROFILE FUNCTIONS ====================
function editProfile() {
    console.log('Opening edit modal');
    
    const userString = localStorage.getItem('user');
    if (!userString) {
        alert('Please login');
        return;
    }
    
    const user = JSON.parse(userString);
    
    // Fill form
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editBio').value = user.bio || '';
    document.getElementById('editLocation').value = user.location || '';
    document.getElementById('editPronouns').value = user.pronouns || '';
    document.getElementById('editProfilePicture').value = user.profilePicture || '';
    document.getElementById('editReadingGoal').value = user.readingGoal || 12;
    
    // Show modal
    document.getElementById('editProfileModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editProfileModal').style.display = 'none';
}

function saveProfileChanges(event) {
    event.preventDefault();
    console.log('Saving profile changes...');
    
    const userString = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!userString || !token) {
        alert('Please login');
        return;
    }
    
    const user = JSON.parse(userString);
    
    const updatedData = {
        name: document.getElementById('editName').value.trim(),
        username: document.getElementById('editUsername').value.trim(),
        bio: document.getElementById('editBio').value.trim(),
        location: document.getElementById('editLocation').value.trim(),
        pronouns: document.getElementById('editPronouns').value.trim(),
        profilePicture: document.getElementById('editProfilePicture').value.trim(),
        readingGoal: parseInt(document.getElementById('editReadingGoal').value) || 12
    };
    
    if (!updatedData.name) {
        alert('Please enter your name');
        return;
    }
    
    fetch(`http://127.0.0.1:5002/api/auth/user/${user.id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Update localStorage
            const updatedUser = { ...user, ...data.user };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            // Update UI
            updateProfileUI(updatedUser);
            
            // Close modal
            closeEditModal();
            
            alert('Profile updated!');
        } else {
            alert('Error: ' + (data.message || 'Update failed'));
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Network error');
    });
}

// ==================== EDIT PICTURE ====================
function editProfilePicture() {
    console.log('Editing profile picture');
    
    const userString = localStorage.getItem('user');
    if (!userString) {
        alert('Please login');
        return;
    }
    
    const user = JSON.parse(userString);
    const currentName = user.name || 'User';
    
    const newUrl = prompt('Enter new profile picture URL:', 
        user.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentName)}&background=E0B973&color=3B1D14&size=150`);
    
    if (newUrl === null) return;
    
    const urlToUse = newUrl.trim() || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(currentName)}&background=E0B973&color=3B1D14&size=150`;
    
    // Update UI immediately
    document.getElementById('profilePicture').src = urlToUse;
    
    // Save to backend
    const token = localStorage.getItem('token');
    
    fetch(`http://127.0.0.1:5002/api/auth/user/${user.id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ profilePicture: urlToUse })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            user.profilePicture = urlToUse;
            localStorage.setItem('user', JSON.stringify(user));
            alert('Picture updated!');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Failed to save');
    });
}

// ==================== DELETE ACCOUNT ====================
function showDeleteAccountModal() {
    const userString = localStorage.getItem('user');
    if (userString) {
        const user = JSON.parse(userString);
        if (user.email) {
            document.getElementById('confirmEmail').placeholder = user.email;
        }
    }
    document.getElementById('deleteAccountModal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('deleteAccountModal').style.display = 'none';
}

function deleteAccount() {
    const email = document.getElementById('confirmEmail').value;
    const userString = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!userString || !token) {
        alert('Please login');
        return;
    }
    
    const user = JSON.parse(userString);
    
    if (email !== user.email) {
        alert('Email does not match');
        return;
    }
    
    if (!confirm('Are you sure? This cannot be undone!')) return;
    
    fetch(`http://127.0.0.1:5002/api/auth/user/${user.id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Account deleted');
            localStorage.clear();
            window.location.href = '../Homepage/index.html';
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Network error');
    });
}

// ==================== SHARE PROFILE ====================
function shareProfile() {
    const profileUrl = window.location.href;
    const userString = localStorage.getItem('user');
    let userName = 'User';
    
    if (userString) {
        const user = JSON.parse(userString);
        userName = user.name || 'User';
    }
    
    if (navigator.share) {
        navigator.share({
            title: `${userName}'s Profile`,
            text: `Check out ${userName}'s reading profile!`,
            url: profileUrl
        });
    } else {
        navigator.clipboard.writeText(profileUrl);
        alert('Link copied to clipboard!');
    }
}

// ==================== NAVIGATION ====================
function showSection(section) {
    document.querySelectorAll('.profile-section').forEach(el => {
        el.style.display = 'none';
    });
    
    const target = document.getElementById(section + 'Section');
    if (target) target.style.display = 'block';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = document.querySelector(`.nav-link[data-section="${section}"]`);
    if (activeLink) activeLink.classList.add('active');
}

// ==================== LOGOUT ====================
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = '../Homepage/index.html';
    }
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Profile page initialized');
    
    // Load profile data
    loadProfileData();
    
    // ===== SETUP ALL EVENT LISTENERS =====
    
    // Edit Profile Button
    document.querySelector('.action-btn.edit').addEventListener('click', editProfile);
    
    // Edit Picture Button
    document.querySelector('.edit-pic-btn').addEventListener('click', editProfilePicture);
    
    // Delete Account Button
    document.querySelector('.action-btn.delete').addEventListener('click', showDeleteAccountModal);
    
    // Share Button
    document.querySelector('.action-btn.share').addEventListener('click', shareProfile);
    
    // Logout Buttons
    document.querySelectorAll('.btn-logout, .action-btn.logout').forEach(btn => {
        btn.addEventListener('click', logout);
    });
    
    // Edit Form Submit
    const editForm = document.getElementById('editProfileForm');
    if (editForm) {
        editForm.addEventListener('submit', saveProfileChanges);
    }
    
    // Delete Account Button in modal
    const deleteBtn = document.querySelector('#deleteAccountModal .delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteAccount);
    }
    
    // Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal-overlay');
            if (modal) modal.style.display = 'none';
        });
    });
    
    // Modal close on outside click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    });
    
    // Navigation
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            showSection(this.getAttribute('data-section'));
        });
    });
    
    // Auto-hide loading
    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }, 3000);
});