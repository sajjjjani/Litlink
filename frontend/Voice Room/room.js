/* ===== ROOM DATA ===== */
const ROOM_DATA = {
  '1': { name: 'Fantasy World Debate',  genre: 'Fantasy',  host: 'Elena Vance',   hostInitials: 'EV' },
  '2': { name: 'Mystery Book Analysis', genre: 'Mystery',  host: 'James Hardy',   hostInitials: 'JH' },
  '3': { name: 'Poetry Reading Circle', genre: 'Poetry',   host: 'Amara Singh',   hostInitials: 'AS' },
  '4': { name: 'Sci-Fi Predictions',    genre: 'Sci-Fi',   host: 'Leo Nakamura',  hostInitials: 'LN' },
};

const PARTICIPANTS = [
  { id: 'p1', name: 'Elena Vance',   initials: 'EV', isHost: true,  isMuted: false, isSpeaking: false, handRaised: false, color: '#7A4030' },
  { id: 'p2', name: 'Marcus Chen',   initials: 'MC', isHost: false, isMuted: true,  isSpeaking: false, handRaised: false, color: '#5A3025' },
  { id: 'p3', name: 'Sarah Jenkins', initials: 'SJ', isHost: false, isMuted: false, isSpeaking: true,  handRaised: false, color: '#6B3828', featured: true },
  { id: 'p4', name: 'David Kim',     initials: 'DK', isHost: false, isMuted: false, isSpeaking: false, handRaised: false, color: '#5E3020' },
  { id: 'p5', name: 'Aisha Patel',   initials: 'AP', isHost: false, isMuted: true,  isSpeaking: false, handRaised: true,  color: '#4F2A1A' },
  { id: 'p6', name: 'Noah Williams', initials: 'NW', isHost: false, isMuted: false, isSpeaking: false, handRaised: false, color: '#623018' },
  { id: 'p7', name: 'Priya Sharma',  initials: 'PS', isHost: false, isMuted: false, isSpeaking: false, handRaised: false, color: '#5A2E18' },
  { id: 'p8', name: 'Liam Torres',   initials: 'LT', isHost: false, isMuted: true,  isSpeaking: false, handRaised: false, color: '#4A2615' },
];

const CHAT_MESSAGES = [
  { id: 'm1', name: 'James Wilson', initials: 'JW', color: '#A8D5BA', message: 'Agreed! The world-building is incredible',           time: '2m ago'   },
  { id: 'm2', name: 'Priya Sharma', initials: 'PS', color: '#B4C7E8', message: 'Can you explain that point about the magic system?', time: '1m ago'   },
  { id: 'm3', name: 'Olivia Brown', initials: 'OB', color: '#D4B4E8', message: 'I think the author intended it as a metaphor',       time: '1m ago'   },
  { id: 'm4', name: 'Chen Wei',     initials: 'CW', color: '#B4E8D4', message: 'The character development in book 2 was much better',time: '45s ago'  },
  { id: 'm5', name: 'Alex Kim',     initials: 'AK', color: '#E8C4B4', message: 'Great point about the foreshadowing!',               time: '30s ago'  },
  { id: 'm6', name: 'Emma Davis',   initials: 'ED', color: '#B4D4E8', message: '👏 Love this discussion',                            time: 'Just now' },
];

const QUICK_REACTIONS = ['Agreed!', 'Great point!', '👏', '🔥', '💡'];

/* ===== STATE ===== */
let isMicOn    = false;
let isHandUp   = false;
let roomId     = '1';
let roomInfo   = {};

/* ===== INIT ===== */
function init() {
  const params = new URLSearchParams(window.location.search);
  roomId   = params.get('id') || '1';
  roomInfo = ROOM_DATA[roomId] || ROOM_DATA['1'];

  // Update header
  document.getElementById('hdr-name').textContent  = roomInfo.name;
  document.getElementById('hdr-genre').textContent = roomInfo.genre;
  document.getElementById('hdr-count').textContent = PARTICIPANTS.length + ' participants';
  document.title = `Litlink — ${roomInfo.name}`;

  renderStage();
  renderSidebar();
  renderChatMessages();
  renderChatReactions();
  bindControls();
}

/* ===== SVG ICONS ===== */
const ICON = {
  micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  micOn:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  crown:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  hand:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  muted:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/></svg>`,
};

/* ===== STAGE ===== */
function renderStage() {
  const featured   = PARTICIPANTS.find(p => p.featured) || PARTICIPANTS[0];
  const gridPeople = PARTICIPANTS.filter(p => !p.featured);

  document.getElementById('stage-content').innerHTML = `
    <!-- Featured Speaker -->
    <div class="featured-speaker">
      <div class="featured-ring-wrap">
        <div class="featured-ring ${featured.isSpeaking ? 'speaking' : ''}"></div>
        <div class="featured-avatar">${featured.initials}</div>
      </div>
      <div class="featured-name">${featured.name}</div>
      <div class="featured-status">${featured.isSpeaking ? 'Speaking' : (featured.isMuted ? 'Muted' : 'Listening')}</div>
    </div>

    <!-- Grid -->
    <div class="participants-grid">
      ${gridPeople.map((p, i) => `
        <div class="participant-card" style="animation-delay:${i * 0.06}s">
          <div class="pc-avatar-wrap">
            <div class="pc-avatar ${p.isSpeaking ? 'speaking' : ''}" style="background:${p.color}">
              ${p.initials}
            </div>
            ${p.isHost   ? `<div class="pc-crown">${ICON.crown}</div>` : ''}
            ${p.handRaised ? `<div class="pc-hand">${ICON.hand}</div>` : ''}
            ${p.isMuted
              ? `<div class="pc-mic muted">${ICON.muted}</div>`
              : `<div class="pc-mic active">${ICON.micOn}</div>`
            }
          </div>
          <div class="pc-name">${p.name}</div>
          <div class="pc-status">${p.isSpeaking ? 'Speaking' : (p.isMuted ? 'Muted' : 'Listening')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ===== SIDEBAR ===== */
function renderSidebar() {
  const host = PARTICIPANTS.find(p => p.isHost) || PARTICIPANTS[0];

  document.getElementById('rsb-body').innerHTML = `
    <!-- About -->
    <div class="rsb-section">
      <div class="rsb-label">About</div>
      <p class="rsb-about">Welcome to <strong>${roomInfo.name}</strong>. A place to discuss all things <strong>${roomInfo.genre}</strong>. Be respectful and wait your turn to speak.</p>
    </div>

    <!-- Host -->
    <div class="rsb-section">
      <div class="rsb-label">Host</div>
      <div class="rsb-host-row">
        <div class="rsb-host-av">${host.initials}</div>
        <div>
          <div class="rsb-host-name">${host.name}</div>
          <div class="rsb-host-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Room Creator
          </div>
        </div>
      </div>
    </div>

    <!-- Participants -->
    <div class="rsb-section">
      <div class="rsb-label">Participants ( <span style="color:var(--sidebar-text)">${PARTICIPANTS.length}</span> )</div>
      <div class="rsb-p-list">
        ${PARTICIPANTS.map(p => `
          <div class="rsb-p-row">
            <div class="rsb-p-av ${p.isSpeaking ? 'speaking' : ''}">${p.initials}</div>
            <span class="rsb-p-name">${p.name}</span>
            ${p.isHost
              ? `<svg class="rsb-p-icon crown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
              : p.isMuted
              ? `<svg class="rsb-p-icon muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`
              : ''
            }
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ===== CHAT ===== */
function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = CHAT_MESSAGES.map((m, i) => `
    <div class="chat-msg" style="animation-delay:${i * 0.04}s">
      <div class="chat-msg-av" style="background:linear-gradient(135deg,${m.color},${m.color}cc)">${m.initials}</div>
      <div class="chat-msg-body">
        <div class="chat-msg-meta">
          <span class="chat-msg-name">${m.name}</span>
          <span class="chat-msg-time">${m.time}</span>
        </div>
        <p class="chat-msg-text">${m.message}</p>
      </div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function renderChatReactions() {
  document.getElementById('chat-reactions').innerHTML = QUICK_REACTIONS.map(r =>
    `<button class="react-btn" onclick="sendReaction('${r}')">${r}</button>`
  ).join('');
}

function sendReaction(text) {
  sendMessage(text);
}

function sendMessage(text) {
  if (!text.trim()) return;
  CHAT_MESSAGES.push({
    id: 'u-' + Date.now(), name: 'You', initials: 'JD',
    color: '#C9A27B', message: text.trim(), time: 'Just now'
  });
  renderChatMessages();
}

/* ===== CONTROLS ===== */
function bindControls() {
  // Mic
  document.getElementById('ctrl-mic').addEventListener('click', () => {
    isMicOn = !isMicOn;
    const btn = document.getElementById('ctrl-mic');
    btn.className = `ctrl-btn ${isMicOn ? 'ctrl-mic-active' : 'ctrl-mic-neutral'}`;
    btn.setAttribute('aria-pressed', isMicOn);
    document.getElementById('mic-off-svg').style.display = isMicOn ? 'none'  : 'block';
    document.getElementById('mic-on-svg').style.display  = isMicOn ? 'block' : 'none';
  });

  // Hand
  document.getElementById('ctrl-hand').addEventListener('click', () => {
    isHandUp = !isHandUp;
    const btn = document.getElementById('ctrl-hand');
    btn.className = `ctrl-btn ${isHandUp ? 'ctrl-hand-on' : 'ctrl-hand-off'}`;
    btn.setAttribute('aria-pressed', isHandUp);
  });

  // Leave
  document.getElementById('ctrl-leave').addEventListener('click', () => {
    window.location.href = 'voice-rooms.html';
  });

  // Open Chat
  document.getElementById('open-chat-btn').addEventListener('click', () => {
    document.getElementById('info-panel').style.display  = 'none';
    document.getElementById('chat-panel').classList.remove('hidden');
  });

  // Back from Chat
  document.getElementById('chat-back-btn').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.add('hidden');
    document.getElementById('info-panel').style.display = 'flex';
  });

  // Chat input
  const chatInput = document.getElementById('chat-input');
  const chatSend  = document.getElementById('chat-send');

  chatInput.addEventListener('input', () => {
    chatSend.disabled = !chatInput.value.trim();
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && chatInput.value.trim()) {
      e.preventDefault();
      sendMessage(chatInput.value);
      chatInput.value = '';
      chatSend.disabled = true;
    }
  });
  chatSend.addEventListener('click', () => {
    if (chatInput.value.trim()) {
      sendMessage(chatInput.value);
      chatInput.value = '';
      chatSend.disabled = true;
    }
  });
}

/* ===== SPEAKING SIMULATION ===== */
// Rotate who is "featured/speaking" every few seconds for demo effect
let speakingTimer = 0;
function simulateSpeaking() {
  speakingTimer++;
  if (speakingTimer % 5 === 0) {
    const speakers = PARTICIPANTS.filter(p => !p.isHost && !p.isMuted);
    if (speakers.length > 0) {
      PARTICIPANTS.forEach(p => { p.isSpeaking = false; p.featured = false; });
      const next = speakers[Math.floor(Math.random() * speakers.length)];
      next.isSpeaking = true;
      next.featured   = true;
      renderStage();
      renderSidebar();
    }
  }
}
setInterval(simulateSpeaking, 1000);

/* ===== START ===== */
init();