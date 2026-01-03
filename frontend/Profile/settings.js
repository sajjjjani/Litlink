// settings.js

console.log('✅ Settings page loaded');

// API Base URL
const API_BASE_URL = '/api';

// Load user email
document.addEventListener('DOMContentLoaded', function() {
    const userString = localStorage.getItem('user');
    if (userString) {
        const user = JSON.parse(userString);
        const emailEl = document.getElementById('userEmail');
        if (emailEl) {
            emailEl.textContent = user.email || 'Not set';
        }
        
        // Load saved privacy settings
        loadPrivacySettings();
        loadNotificationSettings();
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
    const userString = localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (!user.privacySettings) {
        user.privacySettings = {};
    }
    user.privacySettings[setting] = value;
    localStorage.setItem('user', JSON.stringify(user));
    
    // TODO: Save to backend
    console.log(`Privacy setting updated: ${setting} = ${value}`);
}

// Load Privacy Settings
function loadPrivacySettings() {
    const userString = localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (user.privacySettings) {
        if (user.privacySettings.messagePrivacy) {
            document.getElementById('messagePrivacy').value = user.privacySettings.messagePrivacy;
        }
        if (user.privacySettings.profilePrivacy) {
            document.getElementById('profilePrivacy').value = user.privacySettings.profilePrivacy;
        }
    }
}

// Update Notification Settings
function updateNotificationSetting(setting, enabled) {
    const userString = localStorage.getItem('user');
    if (!userString) return;
    
    const user = JSON.parse(userString);
    if (!user.notificationSettings) {
        user.notificationSettings = {};
    }
    user.notificationSettings[setting] = enabled;
    localStorage.setItem('user', JSON.stringify(user));
    
    // TODO: Save to backend
    console.log(`Notification setting updated: ${setting} = ${enabled}`);
}

// Load Notification Settings
function loadNotificationSettings() {
    const userString = localStorage.getItem('user');
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

// Delete Account (reuse from profile.js)
function showDeleteAccountModal() {
    const userString = localStorage.getItem('user');
    if (userString) {
        const user = JSON.parse(userString);
        if (user.email) {
            document.getElementById('confirmEmail').placeholder = user.email;
        }
    }
    document.getElementById('deleteAccountModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeDeleteModal() {
    document.getElementById('deleteAccountModal').style.display = 'none';
    document.body.style.overflow = '';
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
    
    fetch(`${API_BASE_URL}/auth/user/${user.id}`, {
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

