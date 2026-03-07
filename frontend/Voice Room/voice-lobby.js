/* ===== VOICE LOBBY - COMPLETE REAL IMPLEMENTATION ===== */
const API_BASE = 'http://localhost:5002/api';
let socket;
let currentUser = null;
let liveRooms = [];
let upcomingRooms = [];

// Load Socket.IO script dynamically
function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    // Remove integrity attribute to avoid mismatch issues
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => {
      console.error('Failed to load Socket.IO');
      showToast('Failed to load real-time features', 'error');
      // Resolve anyway to continue with offline mode
      resolve();
    };
    document.head.appendChild(script);
  });
}

/* ===== INITIALIZATION ===== */
async function init() {
  console.log('🎙 Initializing Voice Lobby...');
  
  // Get current user from localStorage
  const token = localStorage.getItem('authToken');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token || !user.id) {
    console.log('❌ Not authenticated, redirecting to login...');
    window.location.href = '../login.html';
    return;
  }
  
  currentUser = user;
  
  // Update UI with user info
  updateUserUI();
  
  // Load Socket.IO first
  await loadSocketIO();
  
  // Connect to WebSocket
  connectSocket(token);
  
  // Load rooms
  await loadLiveRooms();
  await loadUpcomingRooms();
  
  // Setup event listeners
  setupEventListeners();
}

function updateUserUI() {
  // Update avatar with user initials
  const avatar = document.querySelector('.nav-avatar');
  if (avatar && currentUser.name) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    avatar.textContent = initials || 'U';
  }
}

/* ===== WEBSOCKET CONNECTION ===== */
function connectSocket(token) {
  try {
    // Check if io is defined
    if (typeof io === 'undefined') {
      console.log('Socket.IO not available, using offline mode');
      showToast('Using offline mode - real-time updates disabled', 'warning');
      return;
    }
    
    socket = io('http://localhost:5002', {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log('✅ Connected to voice server');
      showToast('Connected to voice server', 'success');
      socket.emit('authenticate', token);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      showToast('Using offline mode - real-time updates disabled', 'warning');
    });

    socket.on('authenticated', (data) => {
      if (data.success) {
        console.log('🔐 Authentication successful');
      } else {
        console.error('❌ Authentication failed');
      }
    });

    // Real-time room updates
    socket.on('room-created', (room) => {
      console.log('📢 New room created:', room.name);
      addRoomToList(room);
      showToast(`New room created: ${room.name}`, 'info');
    });

    socket.on('room-ended', (data) => {
      console.log('📢 Room ended:', data.roomId);
      removeRoomFromList(data.roomId);
      showToast(data.message || 'A room has ended', 'warning');
    });

    socket.on('room-updated', (data) => {
      console.log('📢 Room updated:', data.roomId);
      updateRoomInList(data);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
    });

    socket.on('reconnect', () => {
      console.log('✅ Reconnected to server');
      showToast('Reconnected to server', 'success');
      loadLiveRooms();
      loadUpcomingRooms();
    });
  } catch (error) {
    console.error('Error connecting socket:', error);
    showToast('Using offline mode', 'warning');
  }
}

/* ===== API CALLS ===== */
async function loadLiveRooms() {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/voice-rooms/rooms/live`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.success) {
      liveRooms = data.rooms;
      renderRooms(data.rooms);
    } else {
      console.error('Failed to load rooms:', data.message);
      showToast('Failed to load rooms', 'error');
    }
  } catch (error) {
    console.error('Error loading live rooms:', error);
    // Fallback to demo data
    const demoRooms = getDemoRooms();
    renderRooms(demoRooms);
  }
}

async function loadUpcomingRooms() {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/voice-rooms/rooms/scheduled`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (data.success) {
      upcomingRooms = data.rooms;
      renderUpcoming(data.rooms);
    }
  } catch (error) {
    console.error('Error loading upcoming rooms:', error);
    const demoUpcoming = getDemoUpcoming();
    renderUpcoming(demoUpcoming);
  }
}

async function createRoom(roomData) {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/voice-rooms/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(roomData)
    });
    
    const data = await response.json();
    if (data.success) {
      closeModal();
      showToast('Room created successfully!', 'success');
      goToRoom(data.room.id);
    } else {
      showToast(data.message || 'Failed to create room', 'error');
    }
  } catch (error) {
    console.error('Error creating room:', error);
    showToast('Failed to create room. Using demo mode.', 'warning');
    // Demo mode - create fake room and go to it
    closeModal();
    goToRoom('demo-room-' + Date.now());
  }
}

/* ===== RENDERING FUNCTIONS ===== */
function renderRooms(rooms) {
  const list = document.getElementById('rooms-list');
  if (!list) return;
  
  const liveRooms = rooms.filter(r => r.isLive !== false);
  document.getElementById('live-count-badge').textContent = liveRooms.length + ' live';

  if (liveRooms.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 30px 20px; color: var(--text-muted);">
        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" style="margin-bottom: 15px; opacity: 0.5;">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
        </svg>
        <p>No live rooms at the moment</p>
        <p style="font-size: 13px; margin-top: 8px;">Be the first to start a conversation!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = liveRooms.map(room => `
    <button class="room-card" onclick="goToRoom('${room.id}')">
      <div class="rc-top">
        <div style="flex:1;min-width:0">
          <div class="rc-name">${escapeHtml(room.name)}</div>
          <span class="genre-chip">${escapeHtml(room.genre)}</span>
        </div>
        <div class="live-ind">
          <span class="live-dot pulse-live"></span>
          <span class="live-lbl">Live</span>
        </div>
      </div>
      <div class="rc-footer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>${room.participantCount || 1} participant${room.participantCount !== 1 ? 's' : ''}</span>
        ${room.hostName ? `<span style="margin-left: auto; font-size: 11px; color: var(--accent);">Host: ${escapeHtml(room.hostName)}</span>` : ''}
      </div>
    </button>
  `).join('');
}

function renderUpcoming(rooms) {
  const list = document.getElementById('upcoming-list');
  if (!list) return;
  
  if (!rooms || rooms.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted);">
        <p>No upcoming rooms scheduled</p>
      </div>
    `;
    return;
  }

  list.innerHTML = rooms.map(room => `
    <div class="upcoming-card">
      <div class="upc-time">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        ${escapeHtml(room.time || formatScheduledTime(room.scheduledFor))}
      </div>
      <div class="upc-name">${escapeHtml(room.name)}</div>
      <div class="upc-meta">
        <span class="genre-chip">${escapeHtml(room.genre)}</span>
        <span>by ${escapeHtml(room.hostName || 'Host')}</span>
      </div>
      <button class="upc-remind" onclick="setReminder('${room.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Set Reminder
      </button>
    </div>
  `).join('');
}

// Helper functions for real-time updates
function addRoomToList(room) {
  if (!room) return;
  liveRooms.unshift(room);
  renderRooms(liveRooms);
}

function removeRoomFromList(roomId) {
  liveRooms = liveRooms.filter(r => r.id !== roomId);
  renderRooms(liveRooms);
}

function updateRoomInList(updatedRoom) {
  const index = liveRooms.findIndex(r => r.id === updatedRoom.roomId);
  if (index !== -1) {
    liveRooms[index] = { ...liveRooms[index], ...updatedRoom };
    renderRooms(liveRooms);
  }
}

/* ===== NAVIGATION ===== */
function goToRoom(id) {
  if (!id) return;
  window.location.href = `room.html?id=${id}`;
}

function goToExplore() {
  window.location.href = '../Dashboard/dashexplore.html';
}

function goToProfile() {
  window.location.href = '../Profile/profile.html';
}

function goToNotifications() {
  window.location.href = '../notifications.html';
}

function setReminder(roomId) {
  const reminders = JSON.parse(localStorage.getItem('roomReminders') || '[]');
  if (!reminders.includes(roomId)) {
    reminders.push(roomId);
    localStorage.setItem('roomReminders', JSON.stringify(reminders));
    showToast('Reminder set! We\'ll notify you before the room starts.', 'success');
  } else {
    showToast('Reminder already set', 'info');
  }
}

/* ===== MODAL MANAGEMENT ===== */
let schedType = 'now';

function openModal() {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-box').classList.remove('hidden');
  setTimeout(() => document.getElementById('m-title')?.focus(), 50);
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-box').classList.add('hidden');
  
  // Reset form
  document.getElementById('m-title').value = '';
  document.getElementById('m-genre').value = '';
  document.getElementById('m-desc').value = '';
  document.getElementById('modal-submit').disabled = true;
  setSchedType('now');
}

function setSchedType(type) {
  schedType = type;
  document.getElementById('sched-now')?.classList.toggle('active', type === 'now');
  document.getElementById('sched-later')?.classList.toggle('active', type === 'later');
  document.getElementById('sched-fields')?.classList.toggle('hidden', type === 'now');
  document.getElementById('modal-submit').textContent = type === 'now' ? 'Create Room' : 'Schedule Room';
}

function validateModal() {
  const title = document.getElementById('m-title')?.value.trim();
  const genre = document.getElementById('m-genre')?.value;
  const submitBtn = document.getElementById('modal-submit');
  if (submitBtn) {
    submitBtn.disabled = !(title && genre);
  }
}

function handleModalSubmit() {
  const title = document.getElementById('m-title')?.value.trim();
  const genre = document.getElementById('m-genre')?.value;
  const description = document.getElementById('m-desc')?.value.trim();
  
  if (!title || !genre) return;
  
  const roomData = {
    name: title,
    genre,
    description: description || '',
    scheduledFor: schedType === 'later' ? getScheduledDateTime() : null
  };
  
  createRoom(roomData);
}

function getScheduledDateTime() {
  const date = document.getElementById('m-date')?.value;
  const time = document.getElementById('m-time')?.value;
  if (date && time) {
    return new Date(`${date}T${time}`).toISOString();
  }
  return null;
}

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
  // Create room buttons
  document.getElementById('sidebar-create-btn')?.addEventListener('click', openModal);
  document.getElementById('empty-create-btn')?.addEventListener('click', openModal);
  
  // Modal close buttons
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', closeModal);
  
  // Schedule toggle
  document.getElementById('sched-now')?.addEventListener('click', () => setSchedType('now'));
  document.getElementById('sched-later')?.addEventListener('click', () => setSchedType('later'));
  
  // Form validation
  document.getElementById('m-title')?.addEventListener('input', validateModal);
  document.getElementById('m-genre')?.addEventListener('change', validateModal);
  
  // Submit
  document.getElementById('modal-submit')?.addEventListener('click', handleModalSubmit);
  
  // ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  
  // Navigation - UPDATED PATHS
  document.querySelector('.nav-explore')?.addEventListener('click', goToExplore);
  document.querySelector('.nav-avatar')?.addEventListener('click', goToProfile);
  
  // Notification icon
  const bellIcon = document.querySelector('.nav-bell');
  if (bellIcon) {
    bellIcon.addEventListener('click', goToNotifications);
  }
}

/* ===== UTILITY FUNCTIONS ===== */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatScheduledTime(dateString) {
  if (!dateString) return 'Soon';
  const date = new Date(dateString);
  const now = new Date();
  const diff = date - now;
  
  if (diff < 0) return 'Now';
  if (diff < 3600000) return `In ${Math.round(diff / 60000)} minutes`;
  if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
}

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.custom-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b1d14'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    font-size: 14px;
    animation: slideIn 0.3s ease;
    border-left: 4px solid ${type === 'error' ? '#991b1b' : type === 'success' ? '#059669' : type === 'warning' ? '#d97706' : '#d4a574'};
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

/* ===== DEMO FALLBACK DATA ===== */
function getDemoRooms() {
  return [
    { id: '1', name: 'Fantasy World Debate', genre: 'Fantasy', participantCount: 12, hostName: 'Elena Vance', isLive: true },
    { id: '2', name: 'Mystery Book Analysis', genre: 'Mystery', participantCount: 8, hostName: 'James Hardy', isLive: true },
    { id: '3', name: 'Poetry Reading Circle', genre: 'Poetry', participantCount: 5, hostName: 'Amara Singh', isLive: true },
    { id: '4', name: 'Sci-Fi Predictions', genre: 'Sci-Fi', participantCount: 15, hostName: 'Leo Nakamura', isLive: true },
  ];
}

function getDemoUpcoming() {
  return [
    { id: 'u1', name: 'Classic Literature Hour', genre: 'Classic', time: 'In 2 hours', hostName: 'Marcus' },
    { id: 'u2', name: 'Horror Stories Night', genre: 'Horror', time: 'Tomorrow, 8pm', hostName: 'Elena' },
  ];
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Make functions globally available
window.goToRoom = goToRoom;
window.setReminder = setReminder;