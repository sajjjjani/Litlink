console.log('✅ Settings page loaded');

const SETTINGS_API_BASE_URL = 'http://localhost:5002/api';
const USER_SETTINGS_ENDPOINT = `${SETTINGS_API_BASE_URL}/user-settings/me`;

function getToken() {
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getToken === 'function') {
        return window.LitlinkSessionAuth.getToken();
    }
    return (
        sessionStorage.getItem('litlink_token') ||
        localStorage.getItem('litlink_token') ||
        sessionStorage.getItem('authToken') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('token') ||
        localStorage.getItem('token')
    );
}

function getStoredUser() {
    if (window.LitlinkSessionAuth && typeof window.LitlinkSessionAuth.getUser === 'function') {
        return window.LitlinkSessionAuth.getUser();
    }
    const userString =
        sessionStorage.getItem('litlink_user') ||
        localStorage.getItem('litlink_user') ||
        sessionStorage.getItem('user') ||
        localStorage.getItem('user');
    if (!userString) return null;
    try {
        return JSON.parse(userString);
    } catch {
        return null;
    }
}

let _settingsState = null;
let _settingsLoading = false;
let _settingsSaving = false;
let _lastSaveId = 0;

const NOTIFICATION_IDS = [
    'newDirectMessages', 'unreadAlerts',
    'roomReminders', 'roomStartedAlerts',
    'discussionLikes', 'discussionComments', 'discussionReplies', 'discussionMentions',
    'newFollowers', 'followRequests',
    'circleEventUpdates', 'circleSuggestedBooks', 'circleAnnouncements'
];

function setSettingsControlsDisabled(disabled) {
    ['messagePrivacy', 'profilePrivacy', ...NOTIFICATION_IDS].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !!disabled;
    });
}

function applySettingsToUI(settings) {
    if (!settings) return;
    const privacy = settings.privacy || {};
    const notifications = settings.notifications || {};

    const messagePrivacy = document.getElementById('messagePrivacy');
    if (messagePrivacy && privacy.messagePrivacy) messagePrivacy.value = privacy.messagePrivacy;

    const profilePrivacy = document.getElementById('profilePrivacy');
    if (profilePrivacy && privacy.profilePrivacy) profilePrivacy.value = privacy.profilePrivacy;

    NOTIFICATION_IDS.forEach((key) => {
        const checkbox = document.getElementById(key);
        if (checkbox && typeof notifications[key] === 'boolean') {
            checkbox.checked = notifications[key];
        }
    });
}

async function loadUserSettings() {
    const token = getToken();
    if (!token) return null;
    _settingsLoading = true;
    setSettingsControlsDisabled(true);
    try {
        const response = await fetch(USER_SETTINGS_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load settings');
        }
        _settingsState = data.settings || {};
        applySettingsToUI(_settingsState);
        return _settingsState;
    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Failed to load settings. Please try again.', 'error');
        return null;
    } finally {
        _settingsLoading = false;
        setSettingsControlsDisabled(false);
    }
}

async function saveUserSettings(partialUpdate) {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    const saveId = ++_lastSaveId;
    _settingsSaving = true;
    setSettingsControlsDisabled(true);
    try {
        const response = await fetch(USER_SETTINGS_ENDPOINT, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(partialUpdate || {})
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to save settings');
        }
        if (saveId !== _lastSaveId) return data.settings || _settingsState;
        _settingsState = data.settings || _settingsState;
        applySettingsToUI(_settingsState);
        return _settingsState;
    } finally {
        _settingsSaving = false;
        setSettingsControlsDisabled(false);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const token = getToken();
    const user = getStoredUser();
    if (token && user) {
        loadAccountInfo(token, user);
        loadUserSettings();
        loadBlockedUsers();
    } else {
        window.location.href = '../Homepage/index.html';
    }
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }
});

window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        loadBlockedUsers();
    }
});

async function loadAccountInfo(token, user) {
    const usernameEl = document.getElementById('settingsUsername');
    const emailEl = document.getElementById('settingsEmail');
    const joinDateEl = document.getElementById('settingsJoinDate');
    const lastLoginEl = document.getElementById('settingsLastLogin');
    const statusEl = document.getElementById('settingsAccountStatus');

    function updateStatusUI(status) {
        if (!statusEl) return;
        const badges = { active: 'Active', suspended: 'Suspended', banned: 'Banned', deactivated: 'Deactivated' };
        const label = badges[status] || 'Active';
        statusEl.innerHTML = `<span class="settings-badge ${status}">${label}</span>`;
    }

    try {
        const response = await fetch(`${SETTINGS_API_BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.user) {
            const u = data.user;
            if (emailEl) emailEl.textContent = u.email || 'Not set';
            if (usernameEl) usernameEl.textContent = u.username || u.name || 'Not set';
            if (joinDateEl) {
                joinDateEl.textContent = u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Unknown';
            }
            if (lastLoginEl) {
                lastLoginEl.textContent = u.lastLogin
                    ? new Date(u.lastLogin).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit'
                    })
                    : 'First login';
            }
            updateStatusUI(u.accountStatus || 'active');
        } else {
            throw new Error(data.message || 'Failed to load account info');
        }
    } catch (e) {
        console.warn('Could not fetch account info, using cached:', e);
        if (emailEl) emailEl.textContent = user.email || 'Not set';
        if (usernameEl) usernameEl.textContent = user.username || user.name || 'Not set';
        if (joinDateEl) {
            joinDateEl.textContent = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'Unknown';
        }
        if (lastLoginEl) {
            lastLoginEl.textContent = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit'
                })
                : 'First login';
        }
        updateStatusUI('active');
    }
}

// ===== BLOCKED USERS =====

async function loadBlockedUsers() {
    const token = getToken();
    if (!token) return;
    try {
        let response = await fetch(`${SETTINGS_API_BASE_URL}/users/blocked/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            response = await fetch(`${SETTINGS_API_BASE_URL}/chat/blocked/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        const data = await response.json();
        if (data.success) {
            renderBlockedUsers(data.blockedUsers || []);
        } else {
            renderBlockedUsers([]);
        }
    } catch (error) {
        console.error('Error loading blocked users:', error);
        renderBlockedUsers([]);
    }
}

function renderBlockedUsers(blockedUsers) {
    const container = document.getElementById('blockedUsersList');
    if (!container) return;
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
                            `<img src="${user.profilePicture}" alt="${escapeHtml(userName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\' style=\\'font-size:1.5rem;\\'></i>'">` :
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
    if (!confirm(`Are you sure you want to unblock ${userName}?`)) return;
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    if (!token) return;
    try {
        let response = await fetch(`${SETTINGS_API_BASE_URL}/users/${userId}/unblock`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            response = await fetch(`${SETTINGS_API_BASE_URL}/chat/unblock/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        const data = await response.json();
        if (data.success) {
            showNotification(`${userName} has been unblocked`, 'success');
            loadBlockedUsers();
        } else {
            throw new Error(data.message || 'Failed to unblock user');
        }
    } catch (error) {
        showNotification(error.message || 'Failed to unblock user', 'error');
    }
}

// ===== HELPERS =====

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    if (localStorage.getItem('notificationsEnabled') === 'false') return;
    const existing = document.querySelectorAll('.custom-notification');
    existing.forEach(n => n.remove());
    const notification = document.createElement('div');
    notification.className = `custom-notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ️'}</span>
        <span class="notification-message">${message}</span>
    `;
    notification.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white; padding: 12px 20px; border-radius: 8px;
        z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== CHANGE PASSWORD =====

function changePassword() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

function closePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
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
        showNotification('Please fill in all fields', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }
    if (newPassword.length < 8) {
        showNotification('Password must be at least 8 characters', 'error');
        return;
    }
    const hasLetter = /[A-Za-z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    if (!hasLetter || !hasNumber) {
        showNotification('Password must include at least one letter and one number', 'error');
        return;
    }

    const submitBtn = document.querySelector('#changePasswordForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const token = getToken();
    if (!token) {
        showNotification('Session expired. Please login again.', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    fetch(`${SETTINGS_API_BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    })
    .then(res => res.json().then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
        if (ok && body.success) {
            showNotification('Password updated successfully', 'success');
            closePasswordModal();
        } else {
            showNotification(body.message || 'Failed to update password', 'error');
        }
    })
    .catch(err => {
        console.error('Change password error:', err);
        showNotification('Network error. Please try again.', 'error');
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
    });
}

// ===== PRIVACY SETTINGS =====

function updatePrivacySetting(setting, value) {
    if (_settingsLoading || _settingsSaving) return;
    const previous = _settingsState;
    const select = document.getElementById(setting === 'messagePrivacy' ? 'messagePrivacy' : 'profilePrivacy');
    if (select && select.value !== value) select.value = value;
    saveUserSettings({ privacy: { [setting]: value } })
        .then(() => showNotification('Privacy setting saved', 'success'))
        .catch((error) => {
            _settingsState = previous;
            applySettingsToUI(_settingsState);
            showNotification(error.message || 'Failed to save privacy setting', 'error');
        });
}

function updateNotificationSetting(setting, enabled) {
    if (_settingsLoading || _settingsSaving) return;
    const checkbox = document.getElementById(setting);
    if (checkbox && checkbox.checked !== enabled) checkbox.checked = enabled;
    const previous = _settingsState;
    saveUserSettings({ notifications: { [setting]: !!enabled } })
        .then(() => showNotification('Notification preference saved', 'success'))
        .catch((error) => {
            _settingsState = previous;
            applySettingsToUI(_settingsState);
            showNotification(error.message || 'Failed to save notification preference', 'error');
        });
}

// ===== ACCOUNT ACTIONS =====

function deactivateAccount() {
    if (!confirm('Are you sure you want to deactivate your account? You can reactivate it anytime by logging in.')) return;
    const token = getToken();
    if (!token) {
        showNotification('Session expired. Please login again.', 'error');
        return;
    }
    fetch(`${SETTINGS_API_BASE_URL}/auth/deactivate`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Account deactivated. You will be logged out.', 'success');
            setTimeout(() => {
                localStorage.clear();
                window.location.href = '../Homepage/index.html';
            }, 1500);
        } else {
            showNotification(data.message || 'Failed to deactivate account', 'error');
        }
    })
    .catch(err => {
        console.error('Deactivate account error:', err);
        showNotification('Network error. Please try again.', 'error');
    });
}

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
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        const emailInput = document.getElementById('confirmEmail');
        if (emailInput) emailInput.value = '';
    }
}

function deleteAccount() {
    const email = document.getElementById('confirmEmail').value;
    const userString = localStorage.getItem('litlink_user') || localStorage.getItem('user');
    const token = localStorage.getItem('litlink_token') || localStorage.getItem('authToken');
    if (!userString || !token) {
        window.SystemModal.warning('Not Logged In', 'Please login');
        return;
    }
    const user = JSON.parse(userString);
    if (email !== user.email) {
        window.SystemModal.warning('Email Mismatch', 'Email does not match');
        return;
    }
    window.SystemModal.confirm(
        'Delete Account',
        'Are you sure? This cannot be undone!',
        () => {
            fetch(`${SETTINGS_API_BASE_URL}/auth/user/${user.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    window.SystemModal.success('Account Deleted', 'Account deleted');
                    localStorage.clear();
                    window.location.href = '../Homepage/index.html';
                } else {
                    window.SystemModal.error('Error', 'Error: ' + data.message);
                }
            })
            .catch(err => {
                console.error('Error:', err);
                window.SystemModal.error('Network Error', 'Network error');
            });
        }
    );
}

function toggleSettings() {
    const menu = document.getElementById('settingsMenu');
    if (menu) menu.classList.toggle('active');
}

function toggleNotifications() {
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) {
        localStorage.setItem('notificationsEnabled', toggle.checked);
        showNotification(`Notifications ${toggle.checked ? 'enabled' : 'disabled'}`, toggle.checked ? 'success' : 'info');
    }
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) navLinks.classList.toggle('active');
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

window.changePassword = changePassword;
window.closePasswordModal = closePasswordModal;
window.updatePrivacySetting = updatePrivacySetting;
window.updateNotificationSetting = updateNotificationSetting;
window.deactivateAccount = deactivateAccount;
window.showDeleteAccountModal = showDeleteAccountModal;
window.closeDeleteModal = closeDeleteModal;
window.deleteAccount = deleteAccount;
window.unblockUser = unblockUser;
window.toggleSettings = toggleSettings;
window.toggleNotifications = toggleNotifications;
window.toggleMobileMenu = toggleMobileMenu;
window.logout = logout;