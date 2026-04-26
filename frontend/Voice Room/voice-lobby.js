const API_BASE = 'http://localhost:5002/api';
let socket;
let currentUser = null;
let liveRooms = [];
let upcomingRooms = [];

function loadSocketIO() {
  return new Promise((resolve) => {
    if (typeof io !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => { showToast('Failed to load real-time features', 'error'); resolve(); };
    document.head.appendChild(s);
  });
}

async function init() {
  // ── Tab isolation: sessionStorage is per-tab so each tab keeps its own identity.
  // We ONLY seed from localStorage if this tab has NO token yet.
  // Once a tab has its own sessionStorage token we never overwrite it — this
  // prevents the "account swapping" bug where logging in on Tab 2 would affect Tab 1.
  let token = sessionStorage.getItem('authToken');
  let user  = null;
  try { user = JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { user = null; }

  // Only fall back to localStorage if this tab has never been seeded
  if (!token) {
    token = localStorage.getItem('authToken');
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
    // Seed this tab's session — future reloads of THIS tab won't re-read localStorage
    if (token) sessionStorage.setItem('authToken', token);
    if (user)  sessionStorage.setItem('user', JSON.stringify(user));
  } else if (!user) {
    // Token exists but user object got lost — restore it from localStorage only if
    // the localStorage token matches (same session, not a different user's login)
    const lsToken = localStorage.getItem('authToken');
    if (lsToken === token) {
      try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
      if (user) sessionStorage.setItem('user', JSON.stringify(user));
    }
  }

  if (!token || !user?.id) { window.location.href = '../Homepage/index.html'; return; }
  currentUser = user;
  updateUserUI();
  await loadSocketIO();
  connectSocket(token);
  await loadLiveRooms();
  await loadUpcomingRooms();
  setupEventListeners();
}

function updateUserUI() {
  const avatar = document.querySelector('.nav-avatar');
  if (avatar && currentUser.name) {
    avatar.textContent = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U';
  }
}

function connectSocket(token) {
  try {
    if (typeof io === 'undefined') { showToast('Using offline mode', 'warning'); return; }
    if (socket && socket.connected) return;
    socket = io('http://localhost:5002', {
      path: '/socket.io',
      // ── FIX: websocket FIRST avoids the polling→upgrade disconnect cycle
      // that was causing the rapid connect/disconnect loop in server logs.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    // Re-authenticate on every (re)connect so the server always knows who this socket is.
    // ── FIX: always read from sessionStorage so this tab sends its own token,
    // never another tab's token that was written to localStorage after login.
    socket.on('connect', () => {
      const activeToken = sessionStorage.getItem('authToken') || token;
      socket.emit('authenticate', activeToken);
    });

    socket.on('connect_error', () => {});  // silently ignore — lobby works without real-time
    socket.on('room-created',  (room) => { addRoomToList(room); showToast(`New room: ${room.name}`, 'info'); });
    socket.on('room-ended',    (data) => { removeRoomFromList(data.roomId); });
    socket.on('room-updated',  (data) => updateRoomInList(data));
    socket.on('disconnect',    ()     => console.log('Disconnected from lobby socket'));
    socket.on('reconnect_attempt', (attempt) => console.log('Lobby reconnect attempt:', attempt));
    socket.on('reconnect', (attempt) => console.log('Lobby reconnected after attempts:', attempt));

    // On reconnect, re-authenticate (handled by 'connect' above) then refresh lists
    socket.on('authenticated', () => { loadLiveRooms(); loadUpcomingRooms(); });
  } catch (err) { /* lobby works without real-time */ }
}

/* ===== API ===== */
async function loadLiveRooms() {
  try {
    // Always read from sessionStorage to use this tab's credentials
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    const res  = await fetch(`${API_BASE}/voice-rooms/rooms/live`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success) { liveRooms = data.rooms; renderRooms(data.rooms); }
    else showToast(data.message || 'Failed to load rooms', 'error');
  } catch (err) { showToast('Could not reach server. Is the backend running?', 'error'); renderRooms([]); }
}

async function loadUpcomingRooms() {
  try {
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    const res  = await fetch(`${API_BASE}/voice-rooms/rooms/scheduled`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) { upcomingRooms = data.rooms; renderUpcoming(data.rooms); }
  } catch (err) { renderUpcoming([]); }
}

async function createRoom(roomData) {
  const submitBtn = document.getElementById('modal-submit');
  const btnLabel  = schedType === 'now' ? 'Start Room' : 'Schedule Room';

  // Disable button to prevent double-submit
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }

  try {
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    const backendData = {
      name           : roomData.name,
      genre          : roomData.genre,
      description    : roomData.description || '',
      maxParticipants: 50,
      isPublic       : true,
      scheduledFor   : roomData.scheduledFor || null
    };

    const res = await fetch(`${API_BASE}/voice-rooms/rooms`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body   : JSON.stringify(backendData)
    });

    let data;
    try { data = await res.json(); }
    catch { data = { success: false, message: `Server error (HTTP ${res.status})` }; }

    if (data.success) {
      closeModal();
      if (roomData.scheduledFor) {
        showToast('Room scheduled successfully!', 'success');
        await loadUpcomingRooms();
      } else {
        showToast('Room created! Entering…', 'success');
        goToRoom(data.room._id);
      }
    } else {
      showToast(data.message || 'Failed to create room', 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnLabel; }
    }
  } catch (err) {
    console.error('createRoom error:', err);
    showToast('Failed to create room. Please try again.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnLabel; }
  }
}

/* ===== RENDERING ===== */
function renderRooms(rooms) {
  const list = document.getElementById('rooms-list');
  if (!list) return;
  const live = rooms.filter(r => r.status === 'live');
  document.getElementById('live-count-badge').textContent = live.length + ' live';

  if (live.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:30px 20px;color:var(--text-muted)">
        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" style="margin-bottom:15px;opacity:.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
        </svg>
        <p>No live rooms at the moment</p>
        <p style="font-size:13px;margin-top:8px">Be the first to start a conversation!</p>
      </div>`;
    return;
  }

  list.innerHTML = live.map(room => {
    const genre = room.genre || 'Discussion';
    const hostName = room.hostId?.name || room.hostName || 'Host';
    return `
      <div class="room-card" onclick="goToRoom('${room._id}')">
        <div class="rc-top">
          <div class="rc-live">
            <span class="rc-live-dot pulse-live"></span> Live
          </div>
          <span class="rc-count">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${room.participantCount || 0}
          </span>
        </div>
        <div class="rc-name">${escapeHtml(room.name)}</div>
        <div class="rc-meta">
          <span class="genre-chip">${escapeHtml(genre)}</span>
          <span class="rc-host">by ${escapeHtml(hostName)}</span>
        </div>
      </div>`;
  }).join('');
}

function renderUpcoming(rooms) {
  const list = document.getElementById('upcoming-list');
  if (!list) return;
  if (!rooms || rooms.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No scheduled rooms</div>`;
    return;
  }
  list.innerHTML = rooms.map(room => {
    const genre = room.genre || 'Discussion';
    const hostName = room.hostId?.name || room.hostName || 'Host';
    const scheduledTime = room.scheduledFor ? formatScheduledTime(room.scheduledFor) : 'Soon';
    return `
      <div class="upcoming-card">
        <div class="upc-time">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${escapeHtml(scheduledTime)}
        </div>
        <div class="upc-name">${escapeHtml(room.name)}</div>
        <div class="upc-meta">
          <span class="genre-chip">${escapeHtml(genre)}</span>
          <span>by ${escapeHtml(hostName)}</span>
        </div>
        <button class="upc-remind" onclick="setReminder('${room._id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Set Reminder
        </button>
      </div>`;
  }).join('');
}

function addRoomToList(room)   { if (!room) return; liveRooms.unshift(room); renderRooms(liveRooms); }
function removeRoomFromList(id){ liveRooms = liveRooms.filter(r => r._id !== id); renderRooms(liveRooms); }
function updateRoomInList(u)   { const i = liveRooms.findIndex(r => r._id === u.roomId); if (i !== -1) { liveRooms[i] = { ...liveRooms[i], ...u }; renderRooms(liveRooms); } }

/* ===== NAVIGATION ===== */
function goToRoom(id) { if (!id) return; window.location.href = `room.html?id=${id}`; }

function setReminder(roomId) {
  const reminders = JSON.parse(localStorage.getItem('roomReminders') || '[]');
  if (!reminders.includes(roomId)) { reminders.push(roomId); localStorage.setItem('roomReminders', JSON.stringify(reminders)); showToast("Reminder set!", 'success'); }
  else showToast('Reminder already set', 'info');
}

/* ===== MODAL ===== */
let schedType = 'now';

function openModal() {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-box').classList.remove('hidden');
  setTimeout(() => document.getElementById('m-title')?.focus(), 50);
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-box').classList.add('hidden');
  document.getElementById('m-title').value  = '';
  document.getElementById('m-genre').value  = '';
  document.getElementById('m-desc').value   = '';
  document.getElementById('m-date').value   = '';
  document.getElementById('m-time').value   = '';
  document.getElementById('modal-submit').disabled = true;
  setSchedType('now');
}

function setSchedType(type) {
  schedType = type;
  document.getElementById('sched-now')?.classList.toggle('active', type === 'now');
  document.getElementById('sched-later')?.classList.toggle('active', type === 'later');
  document.getElementById('sched-fields')?.classList.toggle('hidden', type === 'now');
  const submitBtn = document.getElementById('modal-submit');
  if (submitBtn) submitBtn.textContent = type === 'now' ? 'Start Room' : 'Schedule Room';
  // Re-validate so the submit button state reflects the new mode immediately
  validateModal();
}

function validateModal() {
  const title     = document.getElementById('m-title')?.value.trim();
  const genre     = document.getElementById('m-genre')?.value;
  const submitBtn = document.getElementById('modal-submit');
  let ready = !!(title && genre);
  if (ready && schedType === 'later') {
    const date = document.getElementById('m-date')?.value;
    const time = document.getElementById('m-time')?.value;
    ready = !!(date && time);
  }
  if (submitBtn) submitBtn.disabled = !ready;
}

function handleModalSubmit() {
  const title       = document.getElementById('m-title')?.value.trim();
  const genre       = document.getElementById('m-genre')?.value;
  const description = document.getElementById('m-desc')?.value.trim();
  if (!title || !genre) return;

  if (schedType === 'later') {
    const scheduledFor = getScheduledDateTime();
    if (!scheduledFor) {
      showToast('Please pick a date and time for the scheduled room.', 'error');
      return;
    }
    if (new Date(scheduledFor) <= new Date()) {
      showToast('Scheduled time must be in the future.', 'error');
      return;
    }
    createRoom({ name: title, genre, description: description || '', scheduledFor });
  } else {
    createRoom({ name: title, genre, description: description || '', scheduledFor: null });
  }
}

function getScheduledDateTime() {
  const date = document.getElementById('m-date')?.value;
  const time = document.getElementById('m-time')?.value;
  if (date && time) return new Date(`${date}T${time}`).toISOString();
  return null;
}

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
  document.getElementById('sidebar-create-btn')?.addEventListener('click', openModal);
  document.getElementById('empty-create-btn')?.addEventListener('click', openModal);
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('sched-now')?.addEventListener('click', () => setSchedType('now'));
  document.getElementById('sched-later')?.addEventListener('click', () => setSchedType('later'));
  document.getElementById('m-title')?.addEventListener('input', validateModal);
  document.getElementById('m-genre')?.addEventListener('change', validateModal);
  document.getElementById('m-date')?.addEventListener('change', validateModal);
  document.getElementById('m-time')?.addEventListener('change', validateModal);
  document.getElementById('modal-submit')?.addEventListener('click', handleModalSubmit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  document.querySelector('.nav-dashboard')?.addEventListener('click', () => window.location.href = '../Dashboard/dashboard.html');
  document.querySelector('.nav-explore')?.addEventListener('click', () => window.location.href = '../Dashboard/dashexplore.html');
  document.querySelector('.nav-avatar')?.addEventListener('click',  () => window.location.href = '../Profile/profile.html');
}

/* ===== UTILS ===== */
function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function formatScheduledTime(ds) {
  if (!ds) return 'Soon';
  const date = new Date(ds), diff = date - Date.now();
  if (diff < 0) return 'Now';
  if (diff < 3600000) return `In ${Math.round(diff/60000)}m`;
  if (diff < 86400000) return `In ${Math.round(diff/3600000)}h`;
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric'});
}

function showToast(msg, type='info') {
  document.querySelector('.custom-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'custom-toast';
  t.style.cssText = `position:fixed;bottom:20px;right:20px;background:${type==='error'?'#dc2626':type==='success'?'#10b981':type==='warning'?'#f59e0b':'#3b1d14'};color:white;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:9999;font-size:14px;animation:slideIn .3s ease;border-left:4px solid ${type==='error'?'#991b1b':type==='success'?'#059669':type==='warning'?'#d97706':'#d4a574'}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.animation='slideOut .3s ease forwards'; setTimeout(()=>t.remove(),300); }, 3000);
}

const style = document.createElement('style');
style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}`;
document.head.appendChild(style);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.goToRoom    = goToRoom;
window.setReminder = setReminder;