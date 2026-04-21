console.log('✅ Settings page loaded');

// API Base URL - declared once
const SETTINGS_API_BASE_URL = 'http://localhost:5002/api';

// Load user email and blocked users
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    
    if (token && userString) {
        const user = JSON.parse(userString);
        const emailEl = document.getElementById('userEmail');
        if (emailEl) {
            emailEl.textContent = user.email || 'Not set';
        }
        
        // Load saved privacy settings
        loadPrivacySettings();
        loadNotificationSettings();
        
        // Load blocked users
        loadBlockedUsers();
    } else {
        window.location.href = '../Homepage/index.html';
    }
    
    // Setup form handlers
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }
    
    const changeEmailForm = document.getElementById('changeEmailForm');
    if (changeEmailForm) {
        changeEmailForm.addEventListener('submit', handleChangeEmail);
    }
});

// ===== BLOCKED USERS FUNCTIONS =====

async function loadBlockedUsers() {
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    if (!token) {
        console.log('No token found');
        return;
    }
    
    console.log('Loading blocked users...');
    
    try {
        // Try both possible endpoints
        let response = await fetch(`${SETTINGS_API_BASE_URL}/users/blocked/list`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // If first endpoint fails, try chat blocked list
        if (!response.ok) {
            response = await fetch(`${SETTINGS_API_BASE_URL}/chat/blocked/list`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        
        const data = await response.json();
        console.log('Blocked users response:', data);
        
        if (data.success) {
            renderBlockedUsers(data.blockedUsers || []);
        } else {
            console.error('Failed to load blocked users:', data.message);
            renderBlockedUsers([]);
        }
    } catch (error) {
        console.error('Error loading blocked users:', error);
        renderBlockedUsers([]);
        showNotification('Failed to load blocked users', 'error');
    }
}

function renderBlockedUsers(blockedUsers) {
    const container = document.getElementById('blockedUsersList');
    if (!container) return;
    
    console.log('Rendering blocked users:', blockedUsers);
    
    if (!blockedUsers || blockedUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-blocked">
                <i class="fas fa-user-slash"></i>
                <p>No blocked users</p>
                <small>Users you block will appear here</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = blockedUsers.map(user => {
        const userName = user.name || user.userName || 'Unknown User';
        const userId = user._id || user.id;
        const userGenres = user.favoriteGenres || user.genres || [];
        
        return `
            <div class="blocked-user-item" data-user-id="${userId}">
                <div class="blocked-user-info">
                    <div class="blocked-user-avatar">
                        ${user.profilePicture && user.profilePicture !== '📚' && user.profilePicture !== 'null' ? 
                            `<img src="${user.profilePicture}" alt="${escapeHtml(userName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='<i class=\'fas fa-user\' style=\'font-size:1.5rem;\'></i>'">` :
                            `<i class="fas fa-user" style="font-size:1.5rem;"></i>`
                        }
                    </div>
                    <div class="blocked-user-details">
                        <h4>${escapeHtml(userName)}</h4>
                        <p>@${escapeHtml(user.username || userName.toLowerCase().replace(/\s/g, ''))}</p>
                        ${userGenres && userGenres.length > 0 ? 
                            `<p style="font-size:0.75rem; margin-top:4px;">📚 ${escapeHtml(userGenres.slice(0, 2).join(', '))}</p>` : ''
                        }
                    </div>
                </div>
                <button class="unblock-btn" onclick="unblockUser('${userId}', '${escapeHtml(userName)}')">
                    <i class="fas fa-user-check"></i> Unblock
                </button>
            </div>
        `;
    }).join('');
}

async function unblockUser(userId, userName) {
    if (!confirm(`Are you sure you want to unblock ${userName}? They will be able to message you again.`)) {
        return;
    }
    
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    if (!token) return;
    
    try {
        // Try both possible unblock endpoints
        let response = await fetch(`${SETTINGS_API_BASE_URL}/users/${userId}/unblock`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // If first endpoint fails, try chat unblock
        if (!response.ok) {
            response = await fetch(`${SETTINGS_API_BASE_URL}/chat/unblock/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${userName} has been unblocked`, 'success');
            loadBlockedUsers(); // Refresh the list
        } else {
            throw new Error(data.message || 'Failed to unblock user');
        }
    } catch (error) {
        console.error('Error unblocking user:', error);
        showNotification(error.message || 'Failed to unblock user', 'error');
    }
}

// ===== HELPER FUNCTIONS =====

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.custom-notification');
    existing.forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `custom-notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ️'}</span>
        <span class="notification-message">${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Edit Email
function editEmail() {
    const modal = document.getElementById('changeEmailModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeEmailModal() {
    const modal = document.getElementById('changeEmailModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        const form = document.getElementById('changeEmailForm');
        if (form) form.reset();
    }
}

function handleChangeEmail(event) {
    event.preventDefault();
    
    const newEmail = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('emailPassword').value;
    
    if (!newEmail || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    // TODO: Implement email change API call
    alert('Email change feature coming soon!');
    closeEmailModal();
}

// Change Password
function changePassword() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        const form = document.getElementById('changePasswordForm');
        if (form) form.reset();
    }
}

function handleChangePassword(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in all fields');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
        return;
    }
    
    if (newPassword.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }
    
    // TODO: Implement password change API call
    alert('Password change feature coming soon!');
    closePasswordModal();
}

// Update Privacy Settings
function updatePrivacySetting(setting, value) {
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (!user.privacySettings) {
        user.privacySettings = {};
    }
    user.privacySettings[setting] = value;
    localStorage.setItem('litlink_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
    
    console.log(`Privacy setting updated: ${setting} = ${value}`);
    showNotification('Privacy setting saved', 'success');
}

// Load Privacy Settings
function loadPrivacySettings() {
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (user.privacySettings) {
        if (user.privacySettings.messagePrivacy) {
            const select = document.getElementById('messagePrivacy');
            if (select) select.value = user.privacySettings.messagePrivacy;
        }
        if (user.privacySettings.profilePrivacy) {
            const select = document.getElementById('profilePrivacy');
            if (select) select.value = user.privacySettings.profilePrivacy;
        }
    }
}

// Update Notification Settings
function updateNotificationSetting(setting, enabled) {
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (!user.notificationSettings) {
        user.notificationSettings = {};
    }
    user.notificationSettings[setting] = enabled;
    localStorage.setItem('litlink_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
    
    console.log(`Notification setting updated: ${setting} = ${enabled}`);
    showNotification('Notification preference saved', 'success');
}

// Load Notification Settings
function loadNotificationSettings() {
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (user.notificationSettings) {
        Object.keys(user.notificationSettings).forEach(key => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                checkbox.checked = user.notificationSettings[key];
            }
        });
    }
}

// Deactivate Account
function deactivateAccount() {
    if (!confirm('Are you sure you want to deactivate your account? You can reactivate it anytime by logging in.')) {
        return;
    }
    
    // TODO: Implement deactivate account API call
    alert('Account deactivation feature coming soon!');
}

// Delete Account
function showDeleteAccountModal() {
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    if (userString) {
        const user = JSON.parse(userString);
        const emailInput = document.getElementById('confirmEmail');
        if (emailInput && user.email) {
            emailInput.placeholder = user.email;
        }
    }
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        const emailInput = document.getElementById('confirmEmail');
        if (emailInput) emailInput.value = '';
    }
}

function deleteAccount() {
    const email = document.getElementById('confirmEmail').value;
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    
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
    
    fetch(`${SETTINGS_API_BASE_URL}/auth/user/${user.id}`, {
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

function logout() {
    localStorage.removeItem('litlink_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('litlink_user');
    localStorage.removeItem('user');
    localStorage.removeItem('litlink_userId');
    localStorage.removeItem('userId');
    window.location.href = '../Homepage/index.html';
}

// Make functions globally available
window.editEmail = editEmail;
window.changePassword = changePassword;
window.closeEmailModal = closeEmailModal;
window.closePasswordModal = closePasswordModal;
window.updatePrivacySetting = updatePrivacySetting;
window.updateNotificationSetting = updateNotificationSetting;
window.deactivateAccount = deactivateAccount;
window.showDeleteAccountModal = showDeleteAccountModal;
window.closeDeleteModal = closeDeleteModal;
window.deleteAccount = deleteAccount;
window.unblockUser = unblockUser;
window.logout = logout;