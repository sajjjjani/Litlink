/* ===== DATA ===== */
const ROOMS = [
  { id: '1', name: 'Fantasy World Debate',  genre: 'Fantasy',  participants: 12, isLive: true },
  { id: '2', name: 'Mystery Book Analysis', genre: 'Mystery',  participants: 8,  isLive: true },
  { id: '3', name: 'Poetry Reading Circle', genre: 'Poetry',   participants: 5,  isLive: true },
  { id: '4', name: 'Sci-Fi Predictions',    genre: 'Sci-Fi',   participants: 15, isLive: true },
];

const UPCOMING = [
  { id: 'u1', name: 'Classic Literature Hour', genre: 'Classic', time: 'In 2 hours',    host: 'Marcus' },
  { id: 'u2', name: 'Horror Stories Night',    genre: 'Horror',  time: 'Tomorrow, 8pm', host: 'Elena'  },
];

/* ===== SVG HELPERS ===== */
const svg = {
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  bell:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
};

/* ===== RENDER ROOMS ===== */
function renderRooms() {
  const list = document.getElementById('rooms-list');
  const liveRooms = ROOMS.filter(r => r.isLive);
  document.getElementById('live-count-badge').textContent = liveRooms.length + ' live';

  list.innerHTML = liveRooms.map(r => `
    <button class="room-card" data-id="${r.id}" onclick="goToRoom('${r.id}')">
      <div class="rc-top">
        <div style="flex:1;min-width:0">
          <div class="rc-name">${r.name}</div>
          <span class="genre-chip">${r.genre}</span>
        </div>
        <div class="live-ind">
          <span class="live-dot pulse-live"></span>
          <span class="live-lbl">Live</span>
        </div>
      </div>
      <div class="rc-footer">
        ${svg.users}
        <span>${r.participants} participants</span>
      </div>
    </button>
  `).join('');
}

/* ===== RENDER UPCOMING ===== */
function renderUpcoming() {
  document.getElementById('upcoming-list').innerHTML = UPCOMING.map(r => `
    <div class="upcoming-card">
      <div class="upc-time">${svg.clock} ${r.time}</div>
      <div class="upc-name">${r.name}</div>
      <div class="upc-meta">
        <span class="genre-chip">${r.genre}</span>
        <span>by ${r.host}</span>
      </div>
      <button class="upc-remind">${svg.bell} Set Reminder</button>
    </div>
  `).join('');
}

/* ===== NAVIGATE TO ROOM ===== */
function goToRoom(id) {
  window.location.href = `room.html?id=${id}`;
}

/* ===== MODAL ===== */
let schedType = 'now';

function openModal() {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-box').classList.remove('hidden');
  setTimeout(() => document.getElementById('m-title').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-box').classList.add('hidden');
  document.getElementById('m-title').value = '';
  document.getElementById('m-genre').value = '';
  document.getElementById('m-desc').value = '';
  document.getElementById('modal-submit').disabled = true;
  setSchedType('now');
}

function setSchedType(type) {
  schedType = type;
  document.getElementById('sched-now').classList.toggle('active', type === 'now');
  document.getElementById('sched-later').classList.toggle('active', type === 'later');
  document.getElementById('sched-fields').classList.toggle('hidden', type === 'now');
  document.getElementById('modal-submit').textContent = type === 'now' ? 'Create Room' : 'Schedule Room';
}

function validateModal() {
  const ok = document.getElementById('m-title').value.trim() && document.getElementById('m-genre').value;
  document.getElementById('modal-submit').disabled = !ok;
}

document.getElementById('sidebar-create-btn').addEventListener('click', openModal);
document.getElementById('empty-create-btn').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);
document.getElementById('sched-now').addEventListener('click', () => setSchedType('now'));
document.getElementById('sched-later').addEventListener('click', () => setSchedType('later'));
document.getElementById('m-title').addEventListener('input', validateModal);
document.getElementById('m-genre').addEventListener('change', validateModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('modal-submit').addEventListener('click', () => {
  const title = document.getElementById('m-title').value.trim();
  const genre = document.getElementById('m-genre').value;
  if (!title || !genre) return;
  // Add room and navigate
  const newId = 'new-' + Date.now();
  ROOMS.unshift({ id: newId, name: title, genre, participants: 1, isLive: true });
  closeModal();
  renderRooms();
  goToRoom(newId);
});

/* ===== INIT ===== */
renderRooms();
renderUpcoming();