const API_BASE = 'http://localhost:5002/api';

let socket;
let roomId;
let currentUser      = null;
let roomData         = null;
let participants     = [];
let peerConnections  = {};
let localStream      = null;
let isMicOn          = false;
let isHandUp         = false;
let audioContext     = null;
let analyser         = null;
let speakingInterval = null;

// ── Rotating Speaker State (mirrors server) ───────────────────
let roomMode         = 'free';   // 'free' | 'rotating'
let rotatingState    = null;
let isInQueue        = false;
let isCurrentSpeaker = false;
let topicPrompt      = null;

// ═════════════════════════════════════════════════════════════
// SCRIPT LOADERS
// ═════════════════════════════════════════════════════════════
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

function loadSimplePeer() {
  return new Promise((resolve) => {
    if (typeof SimplePeer !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/simple-peer@9.11.1/simplepeer.min.js';
    s.onload = resolve;
    s.onerror = () => { showToast('Voice chat features limited', 'warning'); resolve(); };
    document.head.appendChild(s);
  });
}

// ═════════════════════════════════════════════════════════════
// HOST HELPERS
// ═════════════════════════════════════════════════════════════
function isCurrentUserHost() {
  if (!roomData || !currentUser) return false;
  const hostId = roomData.hostId?._id
    ? roomData.hostId._id.toString()
    : roomData.hostId?.toString();
  return hostId === currentUser.id?.toString();
}

function addHostControls() {
  const controls = document.getElementById('room-controls');
  if (!controls) return;
  document.getElementById('ctrl-end-room')?.remove();

  if (isCurrentUserHost()) {
    const endBtn = document.createElement('button');
    endBtn.id        = 'ctrl-end-room';
    endBtn.className = 'ctrl-btn ctrl-end-room';
    endBtn.setAttribute('aria-label', 'End Room');
    endBtn.title     = 'End Room for everyone';
    endBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    endBtn.addEventListener('click', confirmEndRoom);
    const leaveBtn = document.getElementById('ctrl-leave');
    leaveBtn ? controls.insertBefore(endBtn, leaveBtn) : controls.appendChild(endBtn);
  }

  addRotatingModeToggle();
}

// ═════════════════════════════════════════════════════════════
// INITIALIZATION
// ═════════════════════════════════════════════════════════════
async function init() {
  const params = new URLSearchParams(window.location.search);
  roomId = params.get('id');

  if (!roomId || roomId === 'undefined' || roomId === 'null') {
    document.getElementById('stage-content').innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <p style="color:var(--text-muted);margin-bottom:20px">Invalid room ID.</p>
        <button onclick="window.location.href='voice-rooms.html'"
          style="padding:10px 20px;background:var(--accent);border:none;border-radius:8px;color:var(--bg-primary);cursor:pointer">
          Return to Lobby
        </button>
      </div>`;
    setTimeout(() => window.location.href = 'voice-rooms.html', 3000);
    return;
  }

  // ── Tab isolation: sessionStorage is per-tab so each tab keeps its own identity.
  // We ONLY seed from localStorage if this tab has NO token yet.
  // Once a tab has its own sessionStorage token we never overwrite it.
  let token = sessionStorage.getItem('authToken');
  let user  = null;
  try { user = JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { user = null; }

  if (!token) {
    token = localStorage.getItem('authToken');
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
    if (token) sessionStorage.setItem('authToken', token);
    if (user)  sessionStorage.setItem('user', JSON.stringify(user));
  } else if (!user) {
    const lsToken = localStorage.getItem('authToken');
    if (lsToken === token) {
      try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
      if (user) sessionStorage.setItem('user', JSON.stringify(user));
    }
  }

  if (!token || !user?.id) { window.location.href = '../Homepage/index.html'; return; }

  currentUser = user;
  await loadSocketIO();
  await loadSimplePeer();
  await loadRoomDetails();
  connectToRoom(token);
  setupEventListeners();
  renderChatReactions();
}

// ═════════════════════════════════════════════════════════════
// ROOM DETAILS (REST)
// ═════════════════════════════════════════════════════════════
async function loadRoomDetails() {
  try {
    // Always read from sessionStorage so we use this tab's credentials
    const token    = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/voice-rooms/rooms/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.success) {
      roomData     = data.room;
      participants = data.room.participants || [];
      updateRoomUI(roomData);
      renderParticipants();
    } else throw new Error(data.message || 'Failed to load room');
  } catch (err) {
    console.error('loadRoomDetails:', err);
    showToast('Failed to load room details', 'error');
    document.getElementById('stage-content').innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <p style="color:var(--text-muted);margin-bottom:20px">Could not load room.</p>
        <button onclick="window.location.href='voice-rooms.html'"
          style="padding:10px 20px;background:var(--accent);border:none;border-radius:8px;color:var(--bg-primary);cursor:pointer">
          Return to Lobby
        </button>
      </div>`;
  }
}

function updateRoomUI(room) {
  let genre = room.genre || 'Discussion';
  let description = room.description || '';
  if (!room.genre) {
    const m = description.match(/^\[(.*?)\]/);
    if (m) genre = m[1];
  }
  document.getElementById('hdr-name').textContent  = room.name || 'Voice Room';
  document.getElementById('hdr-genre').textContent = genre;
  document.getElementById('hdr-count').textContent =
    (room.participantCount || participants.length) + ' participants';
  document.title = `Litlink — ${room.name || 'Voice Room'}`;

  const hostId = room.hostId?._id
    ? room.hostId._id.toString()
    : room.hostId?.toString();
  if (hostId === currentUser.id?.toString()) {
    setTimeout(() => addHostControls(), 500);
  }
}

// ═════════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION
// ═════════════════════════════════════════════════════════════
function connectToRoom(token) {
  try {
    if (typeof io === 'undefined') { showToast('Using offline mode', 'warning'); return; }
    if (socket && socket.connected) return;

    const socketUrl = window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:5002'
      : 'http://localhost:5002';

    socket = io(socketUrl, {
      path: '/socket.io',
      // ── FIX: websocket FIRST avoids the polling→upgrade disconnect cycle
      // that was causing the rapid connect/disconnect loop in server logs.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      withCredentials: true
    });

    socket.on('connect', () => {
      // Always re-authenticate on every (re)connect — the server loses
      // currentUserId when the socket disconnects, so we must send the
      // token again before emitting join-voice-room.
      // ── FIX: read from sessionStorage so this tab always sends its own token,
      // never the other tab's token that may have been written to localStorage.
      const activeToken = sessionStorage.getItem('authToken') || token;
      socket.emit('authenticate', activeToken);
    });

    socket.on('connect_error', () => showToast('Connection issue — retrying…', 'warning'));

    socket.on('authenticated', (data) => {
      if (data.success) {
        if (roomData && roomData.status === 'scheduled' && isCurrentUserHost()) {
          // If host enters a scheduled room, offer to start it
          showStartRoomPrompt();
        } else {
          setTimeout(() => {
            socket.emit('join-voice-room', {
              roomId,
              userId  : currentUser.id,
              userName: currentUser.name
            });
          }, 300);
        }
      } else {
        // Auth failed (e.g. expired token) — don't loop, redirect to login
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => window.location.href = '../Homepage/index.html', 2000);
      }
    });

    socket.on('room-joined', (data) => {
      participants = data.participants || [];

      if (roomData) {
        roomData.hostId = { _id: data.hostId, name: data.hostName };
      } else {
        roomData = {
          _id: roomId,
          name: data.roomName,
          hostId: { _id: data.hostId, name: data.hostName }
        };
      }

      // Apply rotating state if room already in that mode
      if (data.mode === 'rotating' && data.rotatingState) {
        roomMode = 'rotating';
        rotatingState = data.rotatingState;
        applyRotatingState(rotatingState);
        if (typeof window.updateModeBadge === 'function') window.updateModeBadge('rotating');
      }

      renderParticipants();
      showToast(`Joined ${data.roomName}`, 'success');
      addHostControls();
      if (typeof SimplePeer !== 'undefined') initWebRTC(participants);
    });

    socket.on('user-joined', (data) => {
      participants = data.participants || participants;
      addParticipantToUI(data);
      if (data.userId !== currentUser.id && typeof SimplePeer !== 'undefined') {
        createPeerConnection(data.userId, true);
      }
      showToast(`${data.userName || 'Someone'} joined`, 'info');
    });

    socket.on('user-left', (data) => {
      removeParticipantFromUI(data.userId);
      participants = participants.filter(p => p.userId !== data.userId);
      if (peerConnections[data.userId]) {
        try { peerConnections[data.userId].destroy(); } catch (e) {}
        delete peerConnections[data.userId];
      }
      document.getElementById('hdr-count').textContent = participants.length + ' participants';
    });

    socket.on('user-muted',    (d) => updateParticipantMute(d.userId, d.isMuted));
    socket.on('hand-raised',   (d) => updateParticipantHand(d.userId, d.raised));
    socket.on('user-speaking', (d) => updateParticipantSpeaking(d.userId, d.isSpeaking));
    socket.on('new-message',   (d) => addChatMessage(d));

    // ── Content filter events ──────────────────────────────────────────────
    socket.on('message-blocked', (data) => {
      const type = data.suspended ? 'error' : 'warning';
      showToast(data.warning || 'Message blocked: community guidelines violation.', type);
      if (data.suspended) {
        // Also inject a persistent notice into the chat panel
        const container = document.getElementById('chat-messages');
        if (container) {
          const notice = document.createElement('div');
          notice.style.cssText = [
            'text-align:center', 'padding:10px 16px', 'margin:8px 4px',
            'background:rgba(120,20,20,.35)', 'border:1px solid rgba(224,100,100,.35)',
            'border-radius:8px', 'color:#e0a0a0', 'font-size:.84rem', 'line-height:1.5'
          ].join(';');
          notice.textContent = data.warning || 'Your account is suspended.';
          container.appendChild(notice);
          container.scrollTop = container.scrollHeight;
        }
      }
    });

    socket.on('room-ended', (data) => {
      showToast(data.message || 'Room has ended', 'warning');
      cleanupWebRTC();
      clearRotatingTimer();
      setTimeout(() => window.location.href = 'voice-rooms.html', 3000);
    });

    socket.on('server-shutdown', (data) => {
      showToast(data.message || 'Server shutting down', 'warning');
      cleanupWebRTC();
      clearRotatingTimer();
      setTimeout(() => window.location.href = 'voice-rooms.html', 3000);
    });

    socket.on('disconnect', (reason) => {
      // If the server closed the connection intentionally (e.g. room ended),
      // don't show a reconnecting message — the room-ended handler deals with it.
      if (reason !== 'io server disconnect') {
        showToast('Disconnected. Reconnecting…', 'warning');
      }
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log('Room reconnect attempt:', attempt);
    });

    socket.on('reconnect', (attempt) => {
      console.log('Room reconnected after attempts:', attempt);
      const activeToken = sessionStorage.getItem('authToken') || token;
      socket.emit('authenticate', activeToken);
    });

    // NOTE: No separate 'reconnect' handler needed.
    // Socket.IO fires 'connect' again after a successful reconnect,
    // which re-authenticates and then re-joins via the 'authenticated' handler above.

    socket.on('signal', async (data) => {
      const { from, signal } = data;
      try {
        if (!peerConnections[from] && typeof SimplePeer !== 'undefined') {
          await createPeerConnection(from, false);
        }
        if (peerConnections[from]) {
          await peerConnections[from].signal(signal);
        }
      } catch (err) {
        if (err.message?.includes('Invalid signaling data')) {
          setTimeout(() => recreatePeerConnection(from), 1000);
        }
      }
    });

    // ── ROTATING SPEAKER EVENTS ────────────────────────────────
    socket.on('room-mode-changed', (data) => {
      roomMode = data.mode;
      rotatingState = data.snapshot;
      if (typeof window.updateModeBadge === 'function') window.updateModeBadge(data.mode);

      if (roomMode === 'rotating') {
        applyRotatingState(rotatingState);
        showToast('🔄 Rotating speaker mode enabled', 'info');
      } else {
        roomMode = 'free';
        rotatingState    = null;
        isInQueue        = false;
        isCurrentSpeaker = false;
        clearRotatingTimer();
        highlightCurrentSpeaker(null);
        updateQueuePanel(null);
        showToast('🎙 Free mode enabled', 'info');
      }
      addRotatingModeToggle();
      renderParticipants();
    });

    socket.on('queue-updated', (data) => {
      rotatingState    = data;
      isInQueue        = data.queue?.some(u => u.userId === currentUser.id) || false;
      isCurrentSpeaker = data.currentSpeaker?.userId === currentUser.id;
      updateHandButton();
      renderParticipants();
      updateQueuePanel(data);
    });

    socket.on('turn-changed', (data) => {
      rotatingState    = data;
      isCurrentSpeaker = data.currentSpeaker?.userId === currentUser.id;
      isInQueue        = data.queue?.some(u => u.userId === currentUser.id) || false;

      if (isCurrentSpeaker) {
        showToast("🎙 It's YOUR turn to speak!", 'success');
        if (!isMicOn && localStream) enableMic();
        highlightCurrentSpeaker(currentUser.id);
      } else {
        // If I was the previous speaker, mute me and notify
        if (data.prevSpeaker?.userId === currentUser.id) {
          showToast('⏰ Your turn has ended', 'info');
          if (isMicOn && localStream) disableMic();
        }
        if (data.currentSpeaker) {
          showToast(`🎙 ${data.currentSpeaker.userName} is now speaking`, 'info');
          highlightCurrentSpeaker(data.currentSpeaker.userId);
        } else {
          // Queue is empty — nobody speaking
          highlightCurrentSpeaker(null);
          showToast('Queue is empty — raise your hand to speak!', 'info');
        }
      }

      updateHandButton();
      renderParticipants();
      updateQueuePanel(data);
      // Only show timer if there is an active speaker
      if (data.currentSpeaker) {
        updateTimerDisplay(data.secondsLeft, data.timeLimit);
      } else {
        updateTimerDisplay(0, data.timeLimit || 30);
      }
    });

    socket.on('timer-tick', (data) => {
      // Ignore ticks with negative values (can happen if server races on advance)
      if ((data.secondsLeft || 0) >= 0) {
        updateTimerDisplay(data.secondsLeft, data.timeLimit);
      }
    });

    socket.on('vote-skip-updated', (data) => {
      updateVoteSkipDisplay(data.voteSkipCount, data.voteSkipNeeded);
    });

    socket.on('speaker-skipped-by-vote', (data) => {
      if (data.skippedUserId === currentUser.id) showToast('You were skipped by vote', 'warning');
    });

    socket.on('emoji-reaction', (data) => {
      spawnFloatingEmoji(data.emoji, data.userName);
    });

    socket.on('topic-prompt-set', (data) => {
      topicPrompt = data.prompt;
      renderTopicPrompt(data.prompt);
      showToast(`📖 Topic: "${data.prompt}"`, 'info');
    });

  } catch (err) {
    console.error('connectToRoom error:', err);
    showToast('Using offline mode', 'warning');
  }
}

// ═════════════════════════════════════════════════════════════
// ROTATING SPEAKER — STATE & UI
// ═════════════════════════════════════════════════════════════
function applyRotatingState(state) {
  if (!state) return;
  isCurrentSpeaker = state.currentSpeaker?.userId === currentUser.id;
  isInQueue        = state.queue?.some(u => u.userId === currentUser.id) || false;
  rotatingState    = state;
  renderParticipants();
  updateQueuePanel(state);
  updateHandButton();
  updateTimerDisplay(state.secondsLeft, state.timeLimit);
  if (state.currentSpeaker) highlightCurrentSpeaker(state.currentSpeaker.userId);
}

/** Render / refresh the Queue panel at the top of the right sidebar */
function updateQueuePanel(state) {
  const body = document.getElementById('rsb-body');
  if (!body) return;
  document.getElementById('rsb-queue-section')?.remove();
  if (roomMode !== 'rotating' || !state) return;

  const queueSection = document.createElement('div');
  queueSection.className = 'rsb-section';
  queueSection.id        = 'rsb-queue-section';

  const queueItems = (state.queue || []).length > 0
    ? (state.queue || []).map((u, i) => `
        <div class="rsb-queue-item ${u.userId === currentUser.id ? 'is-you' : ''}">
          <span class="rsb-queue-pos">${i + 1}</span>
          <span class="rsb-queue-name">${escapeHtml(u.userName)}${u.userId === currentUser.id ? ' (You)' : ''}</span>
        </div>`)
        .join('')
    : '<div style="color:var(--text-dim);font-size:13px;padding:4px 0">Queue is empty — raise your hand to join!</div>';

  const speakerHtml = state.currentSpeaker
    ? `<div class="rsb-current-speaker">
         <div class="rcs-av">${getInitials(state.currentSpeaker.userName)}</div>
         <div>
           <div class="rcs-name">${escapeHtml(state.currentSpeaker.userName)}${state.currentSpeaker.userId === currentUser.id ? ' (You)' : ''}</div>
           <div class="rcs-badge">🎙 Speaking now</div>
         </div>
       </div>
       <div class="rcs-timer-bar">
         <div class="rcs-timer-fill" id="rcs-timer-fill"
           style="width:${Math.max(0, ((state.secondsLeft || 0) / state.timeLimit) * 100)}%"></div>
       </div>
       <div class="rcs-timer-text" id="rcs-timer-text">${state.secondsLeft || 0}s remaining</div>`
    : '<div style="color:var(--text-dim);font-size:13px">No active speaker — waiting…</div>';

  const voteBtnHtml = (state.currentSpeaker && state.currentSpeaker.userId !== currentUser.id)
    ? `<button class="rsb-vote-skip-btn" id="rsb-vote-skip-btn" onclick="voteSkip()">
         👍 Vote to Skip (${state.voteSkipCount}/${state.voteSkipNeeded})
       </button>`
    : '';

  const skipTurnHtml = isCurrentSpeaker
    ? `<button class="rsb-skip-turn-btn" onclick="skipMyTurn()">⏭ End My Turn Early</button>`
    : '';

  queueSection.innerHTML = `
    <div class="rsb-label">🔄 Rotating Mode
      <span style="font-size:11px;color:var(--text-dim);font-weight:400;margin-left:6px">${state.timeLimit}s turns</span>
    </div>
    ${topicPrompt ? `<div class="rsb-topic-prompt">📖 ${escapeHtml(topicPrompt)}</div>` : ''}
    <div style="margin-bottom:10px">${speakerHtml}</div>
    ${skipTurnHtml}
    <div class="rsb-label" style="margin-top:12px">Speaker Queue</div>
    <div class="rsb-queue-list">${queueItems}</div>
    ${voteBtnHtml}
    <div class="rsb-emoji-bar">
      ${['👍','❤️','🤯','👏','🔥','😂','💡'].map(e =>
        `<button class="rsb-emoji-btn" onclick="sendEmojiReaction('${e}')">${e}</button>`
      ).join('')}
    </div>
  `;

  body.insertBefore(queueSection, body.firstChild);
}

function highlightCurrentSpeaker(userId) {
  document.querySelectorAll('.participant-card').forEach(card => {
    card.classList.remove('is-current-speaker');
  });
  if (userId) {
    document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('is-current-speaker');
  }
}

function updateTimerDisplay(secondsLeft, timeLimit) {
  const fill = document.getElementById('rcs-timer-fill');
  const text = document.getElementById('rcs-timer-text');
  const pct  = Math.max(0, ((secondsLeft || 0) / (timeLimit || 1)) * 100);
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${Math.max(0, secondsLeft || 0)}s remaining`;

  // Also update the main stage timer bars
  const stageFill = document.getElementById('speaker-timer-fill');
  const stageText = document.getElementById('speaker-timer-text');
  if (stageFill) stageFill.style.width = pct + '%';
  if (stageText) stageText.textContent = `${Math.max(0, secondsLeft || 0)}s remaining`;

  // Colour the text red when < 10s
  if (text) text.style.color = (secondsLeft || 0) <= 10 ? 'var(--live-red)' : 'var(--sidebar-muted)';
}

function clearRotatingTimer() {
  document.getElementById('rcs-timer-fill')?.parentElement?.remove();
}

function updateVoteSkipDisplay(count, needed) {
  const btn = document.getElementById('rsb-vote-skip-btn');
  if (btn) btn.textContent = `👍 Vote to Skip (${count}/${needed})`;
}

function updateHandButton() {
  const handBtn = document.getElementById('ctrl-hand');
  if (!handBtn) return;
  if (roomMode === 'rotating') {
    handBtn.title = isCurrentSpeaker ? 'You are speaking' : (isInQueue ? 'Leave queue' : 'Join speaker queue');
    handBtn.className = `ctrl-btn ${(isInQueue || isCurrentSpeaker) ? 'ctrl-hand-on' : 'ctrl-hand-off'}`;
  } else {
    handBtn.title = isHandUp ? 'Lower hand' : 'Raise hand';
    handBtn.className = `ctrl-btn ${isHandUp ? 'ctrl-hand-on' : 'ctrl-hand-off'}`;
  }
}

function spawnFloatingEmoji(emoji, userName) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.cssText = `
    position:fixed;bottom:120px;
    left:${25 + Math.random() * 50}%;
    font-size:28px;animation:floatEmoji 2.5s ease forwards;
    pointer-events:none;z-index:9000;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/** Host-only: floating input to set a discussion topic */
function renderTopicPromptInput() {
  if (!isCurrentUserHost()) return;
  const existing = document.getElementById('topic-prompt-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'topic-prompt-modal';
  modal.style.cssText = `
    position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
    background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;
    padding:16px;width:340px;z-index:500;box-shadow:0 8px 32px rgba(0,0,0,.4)
  `;
  modal.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text-primary)">📖 Set Discussion Topic</div>
    <input id="topic-input" type="text" placeholder="e.g. What did you think about the ending?"
      style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;
             background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;
             outline:none;margin-bottom:10px;box-sizing:border-box"/>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('topic-prompt-modal').remove()"
        style="flex:1;padding:8px;background:transparent;border:1px solid var(--border);
               border-radius:8px;color:var(--text-muted);font-size:13px;cursor:pointer">Cancel</button>
      <button onclick="submitTopicPrompt()"
        style="flex:2;padding:8px;background:var(--accent);border:none;border-radius:8px;
               color:var(--bg-primary);font-weight:600;font-size:13px;cursor:pointer">Set Topic</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#topic-input').focus();
}

function submitTopicPrompt() {
  const input = document.getElementById('topic-input');
  if (!input?.value.trim()) return;
  if (socket?.connected) socket.emit('set-topic-prompt', { roomId, prompt: input.value.trim() });
  document.getElementById('topic-prompt-modal')?.remove();
}

function renderTopicPrompt(prompt) {
  document.getElementById('active-topic-prompt')?.remove();
  if (!prompt) return;
  const el = document.createElement('div');
  el.id = 'active-topic-prompt';
  el.style.cssText = `
    text-align:center;padding:8px 16px;background:var(--bg-secondary);
    border:1px solid var(--border);border-radius:8px;color:var(--accent-light);
    font-size:13px;margin-bottom:16px;animation:fadeInUp .3s ease both;
  `;
  el.textContent = `📖 ${prompt}`;
  const stage = document.getElementById('stage-content');
  if (stage) stage.insertBefore(el, stage.firstChild);
}

/** Add/refresh the 🔄 rotate toggle button in the controls bar (host only) */
function addRotatingModeToggle() {
  if (!isCurrentUserHost()) return;
  document.getElementById('ctrl-rotate-mode')?.remove();
  document.getElementById('ctrl-topic-prompt')?.remove();

  const controls = document.getElementById('room-controls');
  const leaveBtn = document.getElementById('ctrl-leave');
  if (!controls) return;

  const rotBtn = document.createElement('button');
  rotBtn.id        = 'ctrl-rotate-mode';
  rotBtn.className = `ctrl-btn ${roomMode === 'rotating' ? 'ctrl-rotate-on' : 'ctrl-rotate-off'}`;
  rotBtn.title     = roomMode === 'rotating' ? 'Switch to Free Mode' : 'Enable Rotating Speaker Mode';
  rotBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>`;
  rotBtn.addEventListener('click', () => {
    if (roomMode === 'rotating') switchRoomMode('free');
    else showTimeLimitPicker();
  });
  leaveBtn ? controls.insertBefore(rotBtn, leaveBtn) : controls.appendChild(rotBtn);

  if (roomMode === 'rotating') {
    const topicBtn = document.createElement('button');
    topicBtn.id        = 'ctrl-topic-prompt';
    topicBtn.className = 'ctrl-btn ctrl-topic';
    topicBtn.title     = 'Set Discussion Topic';
    topicBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`;
    topicBtn.addEventListener('click', renderTopicPromptInput);
    leaveBtn ? controls.insertBefore(topicBtn, leaveBtn) : controls.appendChild(topicBtn);
  }
}

function showTimeLimitPicker() {
  document.getElementById('time-limit-picker-backdrop')?.remove();
  const modal = document.createElement('div');
  modal.id = 'time-limit-picker-backdrop';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;
    align-items:center;justify-content:center;z-index:10000;
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-secondary);border-radius:12px;padding:24px;max-width:360px;width:90%">
      <h3 style="margin-bottom:8px;color:var(--text-primary)">🔄 Enable Rotating Mode</h3>

      <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px">
        📖 Discussion Topic <span style="color:var(--text-dim)">(optional)</span>
      </label>
      <input id="picker-topic-input" type="text"
        placeholder="e.g. What did you think about the ending?"
        style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;
               background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;
               outline:none;margin-bottom:16px;box-sizing:border-box"/>

      <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px">⏱ Speaking time per turn:</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px" id="time-opts">
        ${[30,60,90,120].map((s,i) =>
          `<button class="sched-btn${i===0?' active':''}" onclick="
            document.querySelectorAll('#time-opts .sched-btn').forEach(b=>b.classList.remove('active'));
            this.classList.add('active');window._pickedTime=${s};
          " style="flex:1">${s}s</button>`
        ).join('')}
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="document.getElementById('time-limit-picker-backdrop').remove()"
          style="flex:1;padding:8px 16px;background:transparent;border:1px solid var(--border);
                 border-radius:6px;color:var(--text-muted);cursor:pointer">Cancel</button>
        <button onclick="_startRotatingWithTopic()"
          style="flex:2;padding:8px 16px;background:var(--accent);border:none;
                 border-radius:6px;color:var(--bg-primary);font-weight:600;cursor:pointer">Start Rotating</button>
      </div>
    </div>
  `;
  window._pickedTime = 30;
  document.body.appendChild(modal);
  modal.querySelector('#picker-topic-input').focus();
}

/** Called by the Start Rotating button — sets topic first, then switches mode */
window._startRotatingWithTopic = function () {
  const topicInput = document.getElementById('picker-topic-input');
  const topic      = topicInput?.value.trim() || '';
  const timeLimit  = window._pickedTime || 30;

  // Set the topic immediately so it is stored before mode switches
  if (topic && socket?.connected) {
    socket.emit('set-topic-prompt', { roomId, prompt: topic });
    topicPrompt = topic;
    renderTopicPrompt(topic);
  }

  switchRoomMode('rotating', timeLimit);
  document.getElementById('time-limit-picker-backdrop')?.remove();
};

function switchRoomMode(mode, timeLimit = 90) {
  if (!socket?.connected) { showToast('Not connected', 'error'); return; }
  socket.emit('switch-room-mode', { roomId, mode, timeLimit });
}

// ═════════════════════════════════════════════════════════════
// ROTATING — USER ACTIONS
// ═════════════════════════════════════════════════════════════
function sendEmojiReaction(emoji) {
  if (socket?.connected) {
    socket.emit('room-emoji-reaction', {
      roomId, userId: currentUser.id, userName: currentUser.name, emoji
    });
  }
  spawnFloatingEmoji(emoji, currentUser.name);
}

function voteSkip() {
  if (socket?.connected) socket.emit('vote-skip-speaker', { roomId, userId: currentUser.id });
  showToast('Vote sent', 'info');
}

function skipMyTurn() {
  if (!isCurrentSpeaker) { showToast('You are not the current speaker', 'error'); return; }
  if (socket?.connected) socket.emit('skip-my-turn', { roomId, userId: currentUser.id });
}

function enableMic() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(t => t.enabled = true);
  isMicOn = true;
  const micBtn = document.getElementById('ctrl-mic');
  if (micBtn) {
    micBtn.className = 'ctrl-btn ctrl-mic-active';
    document.getElementById('mic-off-svg').style.display = 'none';
    document.getElementById('mic-on-svg').style.display  = 'block';
  }
  if (socket?.connected) socket.emit('toggle-mute', { roomId, userId: currentUser.id, isMuted: false });
}

function disableMic() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(t => t.enabled = false);
  isMicOn = false;
  const micBtn = document.getElementById('ctrl-mic');
  if (micBtn) {
    micBtn.className = 'ctrl-btn ctrl-mic-neutral';
    document.getElementById('mic-off-svg').style.display = 'block';
    document.getElementById('mic-on-svg').style.display  = 'none';
  }
  if (socket?.connected) socket.emit('toggle-mute', { roomId, userId: currentUser.id, isMuted: true });
}

// ═════════════════════════════════════════════════════════════
// WEBRTC
// ═════════════════════════════════════════════════════════════
async function initWebRTC(existingParticipants) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    window.localStream = localStream;
    initAudioAnalysis();
    for (const p of existingParticipants) {
      if (p.userId !== currentUser.id && typeof SimplePeer !== 'undefined') {
        await createPeerConnection(p.userId, true);
      }
    }
  } catch (err) {
    showToast('Please allow microphone access to join voice chat', 'error');
    const micBtn = document.getElementById('ctrl-mic');
    if (micBtn) micBtn.disabled = true;
  }
}

async function createPeerConnection(targetUserId, isInitiator = false) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof SimplePeer === 'undefined') return reject('SimplePeer not available');

      const peer = new SimplePeer({
        initiator: isInitiator,
        stream   : localStream,
        trickle  : true,
        config   : {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
          ]
        }
      });

      peer.on('signal', (signal) => {
        if (socket?.connected) socket.emit('signal', { to: targetUserId, signal, roomId });
      });

      peer.on('stream', (stream) => {
        let audio = document.getElementById(`audio-${targetUserId}`);
        if (!audio) {
          audio = document.createElement('audio');
          audio.id       = `audio-${targetUserId}`;
          audio.autoplay = true;
          audio.style.display = 'none';
          document.body.appendChild(audio);
        }
        audio.srcObject = stream;
        audio.play().catch(() => {
          document.addEventListener('click', () => audio.play(), { once: true });
        });
      });

      peer.on('error', (err) => {
        if (err.code === 'ERR_WEBRTC_SUPPORT' || err.message?.includes('ICE')) {
          setTimeout(() => recreatePeerConnection(targetUserId), 1000);
        }
      });

      peer.on('close', () => {
        document.getElementById(`audio-${targetUserId}`)?.remove();
      });

      peerConnections[targetUserId] = peer;
      resolve(peer);
    } catch (err) { reject(err); }
  });
}

async function recreatePeerConnection(targetUserId) {
  if (peerConnections[targetUserId]) {
    try { peerConnections[targetUserId].destroy(); } catch (e) {}
    delete peerConnections[targetUserId];
  }
  document.getElementById(`audio-${targetUserId}`)?.remove();
  await createPeerConnection(targetUserId, true);
}

function initAudioAnalysis() {
  if (!localStream) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser     = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    speakingInterval = setInterval(() => {
      if (!analyser) return;
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const speaking = avg > 20;
      if (window.lastSpeakingStatus !== speaking) {
        window.lastSpeakingStatus = speaking;
        if (socket?.connected) {
          socket.emit('speaking', { roomId, userId: currentUser.id, isSpeaking: speaking });
        }
        updateOwnSpeaking(speaking);
      }
    }, 100);
  } catch (err) { console.error('Audio analysis error:', err); }
}

// ═════════════════════════════════════════════════════════════
// UI RENDERING
// ═════════════════════════════════════════════════════════════
function renderParticipants() {
  const allParticipants = participants || [];
  const hostId = roomData?.hostId?._id
    ? roomData.hostId._id.toString()
    : roomData?.hostId?.toString();
  const amHost = hostId === currentUser.id?.toString();

  const meParticipant = {
    userId    : currentUser.id,
    name      : currentUser.name + (amHost ? ' (Host)' : ' (You)'),
    initials  : getInitials(currentUser.name),
    isHost    : amHost,
    isMuted   : !isMicOn,
    handRaised: isHandUp,
    isSpeaking: window.lastSpeakingStatus || false,
    color     : '#C9A27B'
  };

  const stage = document.getElementById('stage-content');
  if (!stage) return;

  if (roomMode === 'rotating' && rotatingState?.currentSpeaker) {
    const sp     = rotatingState.currentSpeaker;
    const spData = sp.userId === currentUser.id
      ? meParticipant
      : (allParticipants.find(p => p.userId?.toString() === sp.userId) || {
          name: sp.userName, color: '#C9A27B', isSpeaking: true
        });

    const gridPeople = [
      meParticipant,
      ...allParticipants.filter(p => p.userId?.toString() !== currentUser.id?.toString())
    ];

    stage.innerHTML = `
      ${topicPrompt ? `<div id="active-topic-prompt" style="text-align:center;padding:8px 16px;
        background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;
        color:var(--accent-light);font-size:13px;margin-bottom:16px">
        📖 ${escapeHtml(topicPrompt)}</div>` : ''}

      <div class="featured-speaker ${sp.userId === currentUser.id ? 'you-are-speaking' : ''}">
        <div class="featured-ring-wrap">
          <div class="featured-ring speaking"></div>
          <div class="featured-avatar">${getInitials(spData.name)}</div>
        </div>
        <div class="featured-name">${escapeHtml(spData.name)}</div>
        <div class="featured-status">🎙 Speaking Now</div>
        ${sp.userId === currentUser.id
          ? '<div class="your-turn-badge">Your Turn!</div>'
          : ''}
        <div class="speaker-timer-bar">
          <div class="speaker-timer-fill" id="speaker-timer-fill"
            style="width:${Math.max(0,((rotatingState.secondsLeft||0)/rotatingState.timeLimit)*100)}%"></div>
        </div>
        <div class="speaker-timer-text" id="speaker-timer-text">
          ${rotatingState.secondsLeft || 0}s remaining
        </div>
      </div>

      <div class="participants-grid">
        ${gridPeople.map((p, i) => renderParticipantCard(p, i, sp.userId)).join('')}
      </div>
    `;

  } else {
    // Free mode layout
    const featured   = allParticipants.find(p => p.userId?.toString() !== currentUser.id?.toString()) || meParticipant;
    const gridPeople = allParticipants.filter(p => p.userId?.toString() !== currentUser.id?.toString());

    stage.innerHTML = `
      ${topicPrompt ? `<div id="active-topic-prompt" style="text-align:center;padding:8px 16px;
        background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;
        color:var(--accent-light);font-size:13px;margin-bottom:16px">
        📖 ${escapeHtml(topicPrompt)}</div>` : ''}

      <div class="featured-speaker">
        <div class="featured-ring-wrap">
          <div class="featured-ring ${featured.isSpeaking ? 'speaking' : ''}"></div>
          <div class="featured-avatar">${getInitials(featured.name)}</div>
        </div>
        <div class="featured-name">${escapeHtml(featured.name)}</div>
        <div class="featured-status">${featured.isSpeaking ? 'Speaking' : 'Listening'}</div>
      </div>

      <div class="participants-grid">
        ${renderParticipantCard(meParticipant, 0, null)}
        ${gridPeople.map((p, i) => renderParticipantCard(p, i + 1, null)).join('')}
      </div>
    `;
  }

  renderSidebar();
}

function renderParticipantCard(p, i, currentSpeakerId) {
  const isSpkr = currentSpeakerId && p.userId?.toString() === currentSpeakerId;
  const inQ    = roomMode === 'rotating' &&
    rotatingState?.queue?.some(u => u.userId === p.userId?.toString());
  return `
    <div class="participant-card ${isSpkr ? 'is-current-speaker' : ''}"
      data-user-id="${p.userId}" style="animation-delay:${i * 0.06}s">
      <div class="pc-avatar-wrap">
        <div class="pc-avatar ${p.isSpeaking ? 'speaking' : ''}"
          style="background:${p.color || '#5A3025'}">
          ${getInitials(p.name)}
        </div>
        ${p.isHost    ? '<div class="pc-crown">👑</div>' : ''}
        ${p.handRaised? '<div class="pc-hand">✋</div>'  : ''}
        ${inQ         ? '<div class="pc-queue-badge">⏳</div>' : ''}
        <div class="pc-mic ${p.isMuted ? 'muted' : 'active'}">
          ${p.isMuted ? '🔇' : '🎤'}
        </div>
      </div>
      <div class="pc-name">${escapeHtml(p.name)}</div>
      <div class="pc-status">
        ${isSpkr      ? '🎙 Speaking'
          : p.isSpeaking? 'Speaking'
          : p.isMuted   ? 'Muted'
          : inQ         ? 'In Queue'
          : 'Listening'}
      </div>
    </div>
  `;
}

function renderSidebar() {
  const hostId = roomData?.hostId?._id
    ? roomData.hostId._id.toString()
    : roomData?.hostId?.toString();
  const amHost = hostId === currentUser.id?.toString();

  let genre = roomData?.genre || 'Discussion';
  let description = roomData?.description || '';
  if (!roomData?.genre) {
    const m = description.match(/^\[(.*?)\]/);
    if (m) { genre = m[1]; description = description.replace(/^\[.*?\]\s*/, ''); }
  }

  const host = participants.find(p => p.isHost) ||
    (roomData?.hostId ? { userId: hostId, name: roomData.hostId.name || roomData.hostName || 'Host' } : null);

  const body = document.getElementById('rsb-body');
  if (!body) return;

  const queueSection = document.getElementById('rsb-queue-section');

  body.innerHTML = `
    <div class="rsb-section">
      <div class="rsb-label">About</div>
      <p class="rsb-about">
        Welcome to <strong>${escapeHtml(roomData?.name || 'this room')}</strong>.
        ${description
          ? escapeHtml(description)
          : `A place to discuss all things <strong>${escapeHtml(genre)}</strong>.`}
        Be respectful and wait your turn to speak.
      </p>
    </div>

    <div class="rsb-section">
      <div class="rsb-label">Host</div>
      <div class="rsb-host-row">
        <div class="rsb-host-av">${getInitials(host?.name || 'Host')}</div>
        <div>
          <div class="rsb-host-name">${escapeHtml(host?.name || 'Host')}</div>
          <div class="rsb-host-badge">👑 Room Creator</div>
        </div>
      </div>
    </div>

    <div class="rsb-section">
      <div class="rsb-label">
        Participants (<span style="color:var(--sidebar-text)">${participants.length + 1}</span>)
      </div>
      <div class="rsb-p-list">
        <div class="rsb-p-row">
          <div class="rsb-p-av ${window.lastSpeakingStatus ? 'speaking' : ''}">
            ${getInitials(currentUser.name)}
          </div>
          <span class="rsb-p-name">
            ${escapeHtml(currentUser.name)} ${amHost ? '(Host)' : '(You)'}
          </span>
          ${amHost   ? '<span class="rsb-p-icon crown">👑</span>' : ''}
          ${isHandUp ? '<span class="rsb-p-icon" style="color:var(--accent-gold)">✋</span>' : ''}
        </div>
        ${participants
          .filter(p => p.userId?.toString() !== currentUser.id?.toString())
          .map(p => `
          <div class="rsb-p-row">
            <div class="rsb-p-av ${p.isSpeaking ? 'speaking' : ''}">${getInitials(p.name)}</div>
            <span class="rsb-p-name">${escapeHtml(p.name)}</span>
            ${p.isHost     ? '<span class="rsb-p-icon crown">👑</span>' : ''}
            ${p.handRaised ? '<span class="rsb-p-icon" style="color:var(--accent-gold)">✋</span>' : ''}
          </div>`).join('')}
      </div>
    </div>
  `;

  if (queueSection) body.insertBefore(queueSection, body.firstChild);
  else if (roomMode === 'rotating' && rotatingState) updateQueuePanel(rotatingState);
}

function renderChatReactions() {
  const reactions = ['Agreed!', 'Great point!', '👏', '🔥', '💡'];
  const container = document.getElementById('chat-reactions');
  if (container) {
    container.innerHTML = reactions.map(r =>
      `<button class="react-btn" onclick="sendReaction('${r}')">${r}</button>`
    ).join('');
  }
}

// ═════════════════════════════════════════════════════════════
// PARTICIPANT UI HELPERS
// ═════════════════════════════════════════════════════════════
function addParticipantToUI(data) {
  if (document.querySelector(`[data-user-id="${data.userId}"]`)) return;
  participants.push({
    userId: data.userId, name: data.userName,
    isMuted: false, handRaised: false, isSpeaking: false, color: getRandomColor()
  });
  renderParticipants();
  document.getElementById('hdr-count').textContent = (participants.length + 1) + ' participants';
}

function removeParticipantFromUI(userId) {
  const el = document.querySelector(`[data-user-id="${userId}"]`);
  if (el) {
    el.style.opacity   = '0';
    el.style.transform = 'scale(0.8)';
    setTimeout(() => el.remove(), 300);
  }
}

function updateParticipantMute(userId, isMuted) {
  const p = participants.find(p => p.userId === userId);
  if (p) {
    p.isMuted = isMuted;
    const mic = document.querySelector(`[data-user-id="${userId}"] .pc-mic`);
    if (mic) { mic.className = `pc-mic ${isMuted ? 'muted' : 'active'}`; mic.innerHTML = isMuted ? '🔇' : '🎤'; }
    const st = document.querySelector(`[data-user-id="${userId}"] .pc-status`);
    if (st) st.textContent = isMuted ? 'Muted' : (p.isSpeaking ? 'Speaking' : 'Listening');
  }
}

function updateParticipantHand(userId, raised) {
  const p = participants.find(p => p.userId === userId);
  if (p) {
    p.handRaised = raised;
    const wrap     = document.querySelector(`[data-user-id="${userId}"] .pc-avatar-wrap`);
    const existing = wrap?.querySelector('.pc-hand');
    if (raised && !existing && wrap) {
      const d = document.createElement('div');
      d.className = 'pc-hand';
      d.innerHTML = '✋';
      wrap.appendChild(d);
    } else if (!raised && existing) {
      existing.remove();
    }
    renderSidebar();
  }
}

function updateParticipantSpeaking(userId, isSpeaking) {
  const p = participants.find(p => p.userId === userId);
  if (p) {
    p.isSpeaking = isSpeaking;
    document.querySelector(`[data-user-id="${userId}"] .pc-avatar`)?.classList.toggle('speaking', isSpeaking);
    const st = document.querySelector(`[data-user-id="${userId}"] .pc-status`);
    if (st) st.textContent = isSpeaking ? 'Speaking' : (p.isMuted ? 'Muted' : 'Listening');
    renderSidebar();
  }
}

function updateOwnSpeaking(isSpeaking) {
  document.querySelector(`[data-user-id="${currentUser.id}"] .pc-avatar`)?.classList.toggle('speaking', isSpeaking);
  const st = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-status`);
  if (st) st.textContent = isSpeaking ? 'Speaking' : (!isMicOn ? 'Muted' : 'Listening');
  renderSidebar();
}

// ═════════════════════════════════════════════════════════════
// CHAT
// ═════════════════════════════════════════════════════════════
function sendMessage(text) {
  if (!text.trim()) return;
  const msg = {
    roomId, message: text.trim(),
    userName: currentUser.name, userId: currentUser.id,
    timestamp: new Date().toISOString()
  };
  if (socket?.connected) {
    // Do NOT render locally — the server broadcasts back via 'new-message'
    // after content filtering. If the message is blocked it emits
    // 'message-blocked' instead, so we never show a ghost message.
    socket.emit('room-message', msg);
  } else {
    // Offline fallback only
    addChatMessage({ ...msg, id: 'local-' + Date.now() });
  }
}

function sendReaction(r) { sendMessage(r); }

function addChatMessage(message) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const isOwn  = message.userId === currentUser.id;
  const colors = ['#A8D5BA', '#B4C7E8', '#D4B4E8', '#B4E8D4', '#E8C4B4'];
  const color  = colors[Math.floor(Math.random() * colors.length)];
  const el     = document.createElement('div');
  el.className = 'chat-msg';
  el.style.animation = 'fadeInUp 0.2s ease both';
  el.innerHTML = `
    <div class="chat-msg-av"
      style="background:linear-gradient(135deg,${color},${color}cc)">
      ${getInitials(message.userName)}
    </div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${escapeHtml(message.userName)} ${isOwn ? '(You)' : ''}</span>
        <span class="chat-msg-time">${formatTime(message.timestamp)}</span>
      </div>
      <p class="chat-msg-text">${escapeHtml(message.message)}</p>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ═════════════════════════════════════════════════════════════
// CONTROLS
// ═════════════════════════════════════════════════════════════
function toggleMute() {
  if (!localStream) { showToast('Microphone not available', 'error'); return; }

  // In rotating mode, non-speakers cannot unmute
  if (roomMode === 'rotating' && !isCurrentSpeaker && !isMicOn) {
    showToast('Wait for your turn to speak 🔄', 'warning');
    return;
  }

  const tracks = localStream.getAudioTracks();
  if (!tracks || tracks.length === 0) return;

  isMicOn = !isMicOn;
  tracks[0].enabled = isMicOn;

  const micBtn = document.getElementById('ctrl-mic');
  micBtn.className = `ctrl-btn ${isMicOn ? 'ctrl-mic-active' : 'ctrl-mic-neutral'}`;
  micBtn.setAttribute('aria-pressed', isMicOn);
  document.getElementById('mic-off-svg').style.display = isMicOn ? 'none' : 'block';
  document.getElementById('mic-on-svg').style.display  = isMicOn ? 'block' : 'none';

  const mic = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-mic`);
  if (mic) { mic.className = `pc-mic ${!isMicOn ? 'muted' : 'active'}`; mic.innerHTML = !isMicOn ? '🔇' : '🎤'; }

  const st = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-status`);
  if (st) st.textContent = !isMicOn ? 'Muted' : (window.lastSpeakingStatus ? 'Speaking' : 'Listening');

  renderSidebar();
  if (socket?.connected) socket.emit('toggle-mute', { roomId, userId: currentUser.id, isMuted: !isMicOn });
}

function toggleHand() {
  if (roomMode === 'rotating') {
    if (isCurrentSpeaker) { showToast('You are already speaking!', 'info'); return; }
    if (isInQueue) {
      socket?.connected && socket.emit('leave-speaker-queue', { roomId, userId: currentUser.id });
      isInQueue = false;
    } else {
      socket?.connected && socket.emit('join-speaker-queue', { roomId, userId: currentUser.id, userName: currentUser.name });
      isInQueue = true;
    }
    updateHandButton();
    return;
  }

  // Free mode
  isHandUp = !isHandUp;
  const handBtn = document.getElementById('ctrl-hand');
  handBtn.className = `ctrl-btn ${isHandUp ? 'ctrl-hand-on' : 'ctrl-hand-off'}`;
  handBtn.setAttribute('aria-pressed', isHandUp);

  const wrap = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-avatar-wrap`);
  if (wrap) {
    const existing = wrap.querySelector('.pc-hand');
    if (isHandUp && !existing) {
      const d = document.createElement('div'); d.className = 'pc-hand'; d.innerHTML = '✋'; wrap.appendChild(d);
    } else if (!isHandUp && existing) {
      existing.remove();
    }
  }
  renderSidebar();
  if (socket?.connected) {
    socket.emit('raise-hand', { roomId, userId: currentUser.id, raised: isHandUp, userName: currentUser.name });
  }
}

function leaveRoom() {
  if (socket?.connected) socket.emit('leave-voice-room', { roomId, userId: currentUser.id });
  cleanupWebRTC();
  clearRotatingTimer();
  window.location.href = 'voice-rooms.html';
}

function showStartRoomPrompt() {
  const stage = document.getElementById('stage-content');
  if (!stage) return;

  stage.innerHTML = `
    <div style="text-align:center;padding:60px 20px;background:var(--bg-secondary);border-radius:12px;border:1px solid var(--border)">
      <div style="font-size:48px;margin-bottom:20px">🎙️</div>
      <h2 style="color:var(--text-primary);margin-bottom:12px">Ready to start your room?</h2>
      <p style="color:var(--text-muted);margin-bottom:24px;max-width:400px;margin-left:auto;margin-right:auto">
        Your room is currently scheduled. Once you start it, notifications will be sent to people who set a reminder, and the room will appear live in the lobby.
      </p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button onclick="window.location.href='voice-rooms.html'"
                style="padding:12px 24px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text-primary);cursor:pointer;font-weight:600">
          Not Now
        </button>
        <button onclick="startScheduledRoomFromInside()"
                style="padding:12px 24px;background:var(--accent);border:none;border-radius:8px;color:var(--bg-primary);cursor:pointer;font-weight:600">
          Start Room Now
        </button>
      </div>
    </div>
  `;
}

async function startScheduledRoomFromInside() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
  try {
    showToast('Starting room...', 'info');
    const res = await fetch(`${API_BASE}/voice-rooms/rooms/${roomId}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Room started!', 'success');
      // Now actually join the room via socket
      socket.emit('join-voice-room', {
        roomId,
        userId  : currentUser.id,
        userName: currentUser.name
      });
      // UI will be updated by room-joined event
    } else {
      showToast(data.message || 'Failed to start room', 'error');
    }
  } catch (err) {
    console.error('Error starting room:', err);
    showToast('Failed to start room. Please try again.', 'error');
  }
}

function cleanupWebRTC() {
  Object.values(peerConnections).forEach(p => { try { p.destroy(); } catch (e) {} });
  peerConnections = {};
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (speakingInterval) { clearInterval(speakingInterval); speakingInterval = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
}

// ═════════════════════════════════════════════════════════════
// END ROOM (host)
// ═════════════════════════════════════════════════════════════
function confirmEndRoom() {
  if (typeof window.showConfirmModal === 'function') {
    window.showConfirmModal(
      'End Room',
      'Are you sure? All participants will be disconnected.',
      () => endRoom()
    );
    return;
  }

  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;
    align-items:center;justify-content:center;z-index:10000;
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-secondary);border-radius:12px;padding:24px;max-width:400px;width:90%">
      <h3 style="margin-bottom:12px;color:var(--text-primary)">End Room</h3>
      <p style="margin-bottom:20px;color:var(--text-muted)">
        Are you sure? All participants will be disconnected.
      </p>
      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button id="cancel-end"
          style="padding:8px 16px;background:transparent;border:1px solid var(--border);
                 border-radius:6px;color:var(--text-muted);cursor:pointer">Cancel</button>
        <button id="confirm-end"
          style="padding:8px 16px;background:var(--live-red);border:none;
                 border-radius:6px;color:white;cursor:pointer">End Room</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#cancel-end').addEventListener('click', () => modal.remove());
  modal.querySelector('#confirm-end').addEventListener('click', async () => { modal.remove(); await endRoom(); });
}

async function endRoom() {
  try {
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    showToast('Ending room…', 'info');
    const res  = await fetch(`${API_BASE}/voice-rooms/rooms/${roomId}/end`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Room ended successfully', 'success');
      cleanupWebRTC();
      clearRotatingTimer();
      if (socket?.connected) socket.emit('leave-voice-room', { roomId, userId: currentUser.id });
      setTimeout(() => window.location.href = 'voice-rooms.html', 1500);
    } else {
      showToast(data.message || 'Failed to end room', 'error');
    }
  } catch (err) { showToast('Failed to end room', 'error'); }
}

// ═════════════════════════════════════════════════════════════
// CHAT PANEL TOGGLE
// ═════════════════════════════════════════════════════════════
function openChatPanel() {
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('chat-panel').classList.remove('hidden');
  document.getElementById('chat-input')?.focus();
}
function closeChatPanel() {
  document.getElementById('chat-panel').classList.add('hidden');
  document.getElementById('info-panel').style.display = 'flex';
}

// ═════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═════════════════════════════════════════════════════════════
function setupEventListeners() {
  document.getElementById('ctrl-mic')?.addEventListener('click', toggleMute);
  document.getElementById('ctrl-hand')?.addEventListener('click', toggleHand);
  document.getElementById('ctrl-leave')?.addEventListener('click', leaveRoom);
  document.getElementById('open-chat-btn')?.addEventListener('click', openChatPanel);
  document.getElementById('chat-back-btn')?.addEventListener('click', closeChatPanel);

  const chatInput = document.getElementById('chat-input');
  const chatSend  = document.getElementById('chat-send');
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      if (chatSend) chatSend.disabled = !chatInput.value.trim();
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && chatInput.value.trim()) {
        e.preventDefault();
        sendMessage(chatInput.value);
        chatInput.value = '';
        if (chatSend) chatSend.disabled = true;
      }
    });
  }
  if (chatSend) {
    chatSend.addEventListener('click', () => {
      if (chatInput?.value.trim()) {
        sendMessage(chatInput.value);
        chatInput.value = '';
        chatSend.disabled = true;
      }
    });
  }

  document.querySelector('.back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    leaveRoom();
  });

  window.addEventListener('beforeunload', () => {
    if (socket?.connected) socket.emit('leave-voice-room', { roomId, userId: currentUser.id });
    cleanupWebRTC();
  });
}

// ═════════════════════════════════════════════════════════════
// UTILITY
// ═════════════════════════════════════════════════════════════
function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}
function getRandomColor() {
  const c = ['#7A4030','#5A3025','#6B3828','#5E3020','#4F2A1A','#8B4A35','#9B5A40'];
  return c[Math.floor(Math.random() * c.length)];
}
function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
function formatTime(ts) {
  if (!ts) return 'Just now';
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function showToast(message, type = 'info') {
  document.querySelector('.room-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'room-toast';
  toast.style.cssText = `
    position:fixed;top:80px;right:20px;
    background:${type==='error'?'#dc2626':type==='success'?'#10b981':type==='warning'?'#f59e0b':'#3b1d14'};
    color:white;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);
    z-index:9999;font-size:14px;animation:slideIn .3s ease;
    border-left:4px solid ${type==='error'?'#991b1b':type==='success'?'#059669':type==='warning'?'#d97706':'#d4a574'};
    max-width:300px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Inject animation keyframes
const _style = document.createElement('style');
_style.textContent = `
  @keyframes slideIn  { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
  @keyframes slideOut { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin     { to{transform:rotate(360deg)} }
`;
document.head.appendChild(_style);

// ═════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Global exports
window.sendReaction      = sendReaction;
window.toggleMute        = toggleMute;
window.toggleHand        = toggleHand;
window.leaveRoom         = leaveRoom;
window.sendEmojiReaction = sendEmojiReaction;
window.voteSkip          = voteSkip;
window.skipMyTurn        = skipMyTurn;
window.submitTopicPrompt = submitTopicPrompt;
window.startScheduledRoomFromInside = startScheduledRoomFromInside;