/* ===== VOICE ROOM - COMPLETE REAL IMPLEMENTATION ===== */
const API_BASE = 'http://localhost:5002/api';
let socket;
let roomId;
let currentUser = null;
let roomData = null;
let participants = [];
let peerConnections = {};
let localStream = null;
let isMicOn = false;
let isHandUp = false;
let audioContext = null;
let analyser = null;
let speakingInterval = null;

// Load Socket.IO script dynamically
function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
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

// Load SimplePeer for WebRTC
function loadSimplePeer() {
  return new Promise((resolve, reject) => {
    if (typeof SimplePeer !== 'undefined') {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/simple-peer@9.11.1/simplepeer.min.js';
    script.onload = resolve;
    script.onerror = () => {
      console.error('Failed to load SimplePeer');
      showToast('Voice chat features limited', 'warning');
      // Resolve anyway to continue with offline mode
      resolve();
    };
    document.head.appendChild(script);
  });
}

/* ===== INITIALIZATION ===== */
async function init() {
  console.log('🎙 Initializing Voice Room...');
  
  // Get room ID from URL
  const params = new URLSearchParams(window.location.search);
  roomId = params.get('id');
  
  if (!roomId) {
    console.error('❌ No room ID provided');
    showToast('Invalid room', 'error');
    setTimeout(() => window.location.href = 'voice-rooms.html', 2000);
    return;
  }
  
  // Get current user
  const token = localStorage.getItem('authToken');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token || !user.id) {
    console.log('❌ Not authenticated');
    window.location.href = '../login.html';
    return;
  }
  
  currentUser = user;
  
  // Update UI with user info
  updateUserUI();
  
  // Load required libraries
  await loadSocketIO();
  await loadSimplePeer();
  
  // Load room details
  await loadRoomDetails();
  
  // Connect to WebSocket and join room
  connectToRoom(token);
  
  // Setup event listeners
  setupEventListeners();
  
  // Render chat reactions
  renderChatReactions();
}

function updateUserUI() {
  // Update avatar in header if exists
  const participantCard = document.querySelector(`[data-user-id="${currentUser.id}"]`);
  if (participantCard) {
    const avatar = participantCard.querySelector('.pc-avatar');
    if (avatar) {
      const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      avatar.textContent = initials || 'U';
    }
  }
}

/* ===== ROOM DETAILS ===== */
async function loadRoomDetails() {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/voice-rooms/rooms/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.success) {
      roomData = data.room;
      participants = data.room.participants || [];
      updateRoomUI(roomData);
      renderParticipants();
    } else {
      throw new Error(data.message || 'Failed to load room');
    }
  } catch (error) {
    console.error('Error loading room details:', error);
    showToast('Using demo mode', 'info');
    
    // Use demo data as fallback
    roomData = {
      id: roomId,
      name: 'Fantasy World Debate',
      genre: 'Fantasy',
      hostId: 'host1',
      hostName: 'Elena Vance',
      participantCount: 8
    };
    participants = getDemoParticipants();
    updateRoomUI(roomData);
    renderParticipants();
  }
}

function updateRoomUI(room) {
  // Update header
  document.getElementById('hdr-name').textContent = room.name || 'Voice Room';
  document.getElementById('hdr-genre').textContent = room.genre || 'Discussion';
  document.getElementById('hdr-count').textContent = (room.participantCount || participants.length) + ' participants';
  document.title = `Litlink — ${room.name || 'Voice Room'}`;
  
  // Check if current user is host
  const isHost = room.hostId === currentUser.id;
  if (isHost) {
    console.log('👑 You are the host');
  }
}

/* ===== WEBSOCKET CONNECTION ===== */
function connectToRoom(token) {
  try {
    // Check if io is defined
    if (typeof io === 'undefined') {
      console.log('Socket.IO not available, using offline mode');
      showToast('Using offline mode', 'warning');
      return;
    }
    
    socket = io('http://localhost:5002', {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('✅ Connected to voice server');
      showToast('Connected to voice server', 'success');
      
      // Authenticate
      socket.emit('authenticate', token);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      showToast('Using offline mode', 'warning');
    });

    socket.on('authenticated', (data) => {
      if (data.success) {
        console.log('🔐 Authentication successful');
        
        // Join room after authentication
        setTimeout(() => {
          socket.emit('join-voice-room', {
            roomId,
            userId: currentUser.id,
            userName: currentUser.name
          });
        }, 500);
      } else {
        console.error('❌ Authentication failed');
      }
    });

    // Room events
    socket.on('room-joined', (data) => {
      console.log('✅ Joined room:', data.roomName);
      participants = data.participants || [];
      renderParticipants();
      showToast(`Joined ${data.roomName}`, 'success');
      
      // Initialize WebRTC with existing participants
      if (typeof SimplePeer !== 'undefined') {
        initWebRTC(participants);
      } else {
        console.log('SimplePeer not loaded, using demo mode');
      }
    });

    socket.on('user-joined', (data) => {
      console.log('👤 User joined:', data.userName);
      participants = data.participants || participants;
      
      // Add new participant to UI
      addParticipantToUI(data);
      
      // Create peer connection for new user
      if (data.userId !== currentUser.id && typeof SimplePeer !== 'undefined') {
        createPeerConnection(data.userId, true);
      }
      
      showToast(`${data.userName || 'Someone'} joined`, 'info');
    });

    socket.on('user-left', (data) => {
      console.log('👋 User left:', data.userId);
      
      // Remove from UI
      removeParticipantFromUI(data.userId);
      
      // Update participants list
      participants = participants.filter(p => p.userId !== data.userId);
      
      // Close peer connection
      if (peerConnections[data.userId]) {
        try {
          peerConnections[data.userId].destroy();
        } catch (e) {}
        delete peerConnections[data.userId];
      }
      
      // Update participant count
      document.getElementById('hdr-count').textContent = participants.length + ' participants';
    });

    // Audio events
    socket.on('user-muted', (data) => {
      updateParticipantMute(data.userId, data.isMuted);
    });

    socket.on('hand-raised', (data) => {
      updateParticipantHand(data.userId, data.raised);
    });

    socket.on('user-speaking', (data) => {
      updateParticipantSpeaking(data.userId, data.isSpeaking);
    });

    // Chat events
    socket.on('new-message', (data) => {
      addChatMessage(data);
    });

    // Room status events
    socket.on('room-ended', (data) => {
      console.log('📢 Room ended:', data.message);
      showToast(data.message || 'Room has ended', 'warning');
      
      // Clean up
      cleanupWebRTC();
      
      setTimeout(() => {
        window.location.href = 'voice-rooms.html';
      }, 3000);
    });

    socket.on('server-shutdown', (data) => {
      console.log('🔌 Server shutdown:', data.message);
      showToast(data.message || 'Server is shutting down', 'warning');
      
      cleanupWebRTC();
      
      setTimeout(() => {
        window.location.href = 'voice-rooms.html';
      }, 3000);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
      showToast('Disconnected from server. Reconnecting...', 'warning');
    });

    socket.on('reconnect', () => {
      console.log('✅ Reconnected to server');
      showToast('Reconnected to server', 'success');
      
      // Rejoin room
      socket.emit('join-voice-room', {
        roomId,
        userId: currentUser.id,
        userName: currentUser.name
      });
    });

    // WebRTC signaling
    socket.on('signal', async (data) => {
      const { from, signal } = data;
      
      try {
        if (!peerConnections[from] && typeof SimplePeer !== 'undefined') {
          await createPeerConnection(from, false);
        }
        
        if (peerConnections[from]) {
          await peerConnections[from].signal(signal);
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    });

  } catch (error) {
    console.error('Error connecting socket:', error);
    showToast('Using offline mode', 'warning');
  }
}

/* ===== WEBRTC IMPLEMENTATION ===== */
async function initWebRTC(existingParticipants) {
  try {
    // Request microphone permission
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    console.log('✅ Microphone access granted');
    
    // Store local stream globally
    window.localStream = localStream;
    
    // Initialize audio analysis for speaking detection
    initAudioAnalysis();
    
    // Create peer connections for each existing participant
    for (const participant of existingParticipants) {
      if (participant.userId !== currentUser.id && typeof SimplePeer !== 'undefined') {
        await createPeerConnection(participant.userId, true);
      }
    }
    
  } catch (error) {
    console.error('Error accessing microphone:', error);
    showToast('Please allow microphone access to join voice chat', 'error');
    
    // Still allow joining but without audio
    document.getElementById('ctrl-mic').disabled = true;
  }
}

async function createPeerConnection(targetUserId, isInitiator = false) {
  return new Promise((resolve, reject) => {
    try {
      // Check if SimplePeer is available
      if (typeof SimplePeer === 'undefined') {
        console.error('SimplePeer not loaded');
        return reject('SimplePeer not available');
      }
      
      const peer = new SimplePeer({
        initiator: isInitiator,
        stream: localStream,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ]
        }
      });

      peer.on('signal', (signal) => {
        if (socket && socket.connected) {
          socket.emit('signal', {
            to: targetUserId,
            signal
          });
        }
      });

      peer.on('stream', (stream) => {
        console.log('📡 Received stream from user:', targetUserId);
        
        // Create audio element for remote stream
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.id = `audio-${targetUserId}`;
        
        // Remove existing if any
        const existing = document.getElementById(`audio-${targetUserId}`);
        if (existing) existing.remove();
        
        document.body.appendChild(audio);
        audio.play().catch(e => console.log('Audio play failed:', e));
      });

      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
      });

      peer.on('close', () => {
        console.log('Peer connection closed:', targetUserId);
        const audio = document.getElementById(`audio-${targetUserId}`);
        if (audio) audio.remove();
      });

      peerConnections[targetUserId] = peer;
      resolve(peer);
      
    } catch (error) {
      console.error('Error creating peer connection:', error);
      reject(error);
    }
  });
}

function initAudioAnalysis() {
  if (!localStream) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Check speaking status every 100ms
    speakingInterval = setInterval(() => {
      if (!analyser) return;
      
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const isCurrentlySpeaking = average > 20; // Threshold
      
      // Emit speaking status if changed
      if (window.lastSpeakingStatus !== isCurrentlySpeaking) {
        window.lastSpeakingStatus = isCurrentlySpeaking;
        if (socket && socket.connected) {
          socket.emit('speaking', {
            roomId,
            userId: currentUser.id,
            isSpeaking: isCurrentlySpeaking
          });
        }
        
        // Update own UI
        updateOwnSpeaking(isCurrentlySpeaking);
      }
    }, 100);
    
  } catch (error) {
    console.error('Error initializing audio analysis:', error);
  }
}

/* ===== UI RENDERING ===== */
function renderParticipants() {
  if (!participants || participants.length === 0) {
    participants = getDemoParticipants();
  }
  
  const featured = participants.find(p => p.featured) || participants[0] || { userId: 'host', name: 'Host', initials: 'H' };
  const gridPeople = participants.filter(p => !p.featured && p.userId !== currentUser.id);
  
  // Add current user to grid if not host/featured
  const currentUserParticipant = {
    userId: currentUser.id,
    name: currentUser.name + (currentUser.id === roomData?.hostId ? ' (Host)' : ' (You)'),
    initials: getInitials(currentUser.name),
    isHost: roomData?.hostId === currentUser.id,
    isMuted: !isMicOn,
    handRaised: isHandUp,
    isSpeaking: window.lastSpeakingStatus || false,
    color: '#C9A27B'
  };
  
  const stageContent = document.getElementById('stage-content');
  if (!stageContent) return;
  
  stageContent.innerHTML = `
    <!-- Featured Speaker -->
    <div class="featured-speaker">
      <div class="featured-ring-wrap">
        <div class="featured-ring ${featured.isSpeaking ? 'speaking' : ''}"></div>
        <div class="featured-avatar">${getInitials(featured.name)}</div>
      </div>
      <div class="featured-name">${escapeHtml(featured.name)}</div>
      <div class="featured-status">${featured.isSpeaking ? 'Speaking' : 'Listening'}</div>
    </div>

    <!-- Grid -->
    <div class="participants-grid">
      <!-- Current User -->
      <div class="participant-card" data-user-id="${currentUser.id}">
        <div class="pc-avatar-wrap">
          <div class="pc-avatar ${currentUserParticipant.isSpeaking ? 'speaking' : ''}" style="background:${currentUserParticipant.color}">
            ${currentUserParticipant.initials}
          </div>
          ${currentUserParticipant.isHost ? '<div class="pc-crown">👑</div>' : ''}
          ${currentUserParticipant.handRaised ? '<div class="pc-hand">✋</div>' : ''}
          <div class="pc-mic ${!isMicOn ? 'muted' : 'active'}">
            ${!isMicOn ? '🔇' : '🎤'}
          </div>
        </div>
        <div class="pc-name">${escapeHtml(currentUserParticipant.name)}</div>
        <div class="pc-status">${currentUserParticipant.isSpeaking ? 'Speaking' : (!isMicOn ? 'Muted' : 'Listening')}</div>
      </div>
      
      ${gridPeople.map((p, i) => `
        <div class="participant-card" data-user-id="${p.userId}" style="animation-delay:${i * 0.06}s">
          <div class="pc-avatar-wrap">
            <div class="pc-avatar ${p.isSpeaking ? 'speaking' : ''}" style="background:${p.color || '#5A3025'}">
              ${getInitials(p.name)}
            </div>
            ${p.isHost ? '<div class="pc-crown">👑</div>' : ''}
            ${p.handRaised ? '<div class="pc-hand">✋</div>' : ''}
            <div class="pc-mic ${p.isMuted ? 'muted' : 'active'}">
              ${p.isMuted ? '🔇' : '🎤'}
            </div>
          </div>
          <div class="pc-name">${escapeHtml(p.name)}</div>
          <div class="pc-status">${p.isSpeaking ? 'Speaking' : (p.isMuted ? 'Muted' : 'Listening')}</div>
        </div>
      `).join('')}
    </div>
  `;
  
  // Also render sidebar
  renderSidebar();
}

function renderSidebar() {
  const host = participants.find(p => p.isHost) || 
               (roomData?.hostId ? { userId: roomData.hostId, name: roomData.hostName || 'Host' } : participants[0]);
  
  const sidebarBody = document.getElementById('rsb-body');
  if (!sidebarBody) return;
  
  sidebarBody.innerHTML = `
    <!-- About -->
    <div class="rsb-section">
      <div class="rsb-label">About</div>
      <p class="rsb-about">Welcome to <strong>${escapeHtml(roomData?.name || 'this room')}</strong>. A place to discuss all things <strong>${escapeHtml(roomData?.genre || 'literature')}</strong>. Be respectful and wait your turn to speak.</p>
    </div>

    <!-- Host -->
    <div class="rsb-section">
      <div class="rsb-label">Host</div>
      <div class="rsb-host-row">
        <div class="rsb-host-av">${getInitials(host?.name || 'Host')}</div>
        <div>
          <div class="rsb-host-name">${escapeHtml(host?.name || 'Host')}</div>
          <div class="rsb-host-badge">
            👑 Room Creator
          </div>
        </div>
      </div>
    </div>

    <!-- Participants -->
    <div class="rsb-section">
      <div class="rsb-label">Participants ( <span style="color:var(--sidebar-text)">${participants.length + 1}</span> )</div>
      <div class="rsb-p-list">
        <!-- Current user -->
        <div class="rsb-p-row">
          <div class="rsb-p-av ${window.lastSpeakingStatus ? 'speaking' : ''}">${getInitials(currentUser.name)}</div>
          <span class="rsb-p-name">${escapeHtml(currentUser.name)} ${currentUser.id === roomData?.hostId ? '(Host)' : '(You)'}</span>
          ${roomData?.hostId === currentUser.id ? '<span class="rsb-p-icon crown">👑</span>' : ''}
          ${isHandUp ? '<span class="rsb-p-icon" style="color: var(--accent-gold);">✋</span>' : ''}
        </div>
        
        ${participants.filter(p => p.userId !== currentUser.id).map(p => `
          <div class="rsb-p-row">
            <div class="rsb-p-av ${p.isSpeaking ? 'speaking' : ''}">${getInitials(p.name)}</div>
            <span class="rsb-p-name">${escapeHtml(p.name)}</span>
            ${p.isHost ? '<span class="rsb-p-icon crown">👑</span>' : ''}
            ${p.handRaised ? '<span class="rsb-p-icon" style="color: var(--accent-gold);">✋</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderChatReactions() {
  const quickReactions = ['Agreed!', 'Great point!', '👏', '🔥', '💡'];
  const container = document.getElementById('chat-reactions');
  if (container) {
    container.innerHTML = quickReactions.map(r =>
      `<button class="react-btn" onclick="sendReaction('${r}')">${r}</button>`
    ).join('');
  }
}

/* ===== PARTICIPANT UI UPDATES ===== */
function addParticipantToUI(data) {
  // Check if participant already exists
  const exists = document.querySelector(`[data-user-id="${data.userId}"]`);
  if (exists) return;
  
  // Add to participants array
  participants.push({
    userId: data.userId,
    name: data.userName,
    isMuted: false,
    handRaised: false,
    isSpeaking: false,
    color: getRandomColor()
  });
  
  // Re-render all participants
  renderParticipants();
  
  // Update count
  document.getElementById('hdr-count').textContent = participants.length + 1 + ' participants';
}

function removeParticipantFromUI(userId) {
  const element = document.querySelector(`[data-user-id="${userId}"]`);
  if (element) {
    element.style.opacity = '0';
    element.style.transform = 'scale(0.8)';
    setTimeout(() => {
      element.remove();
    }, 300);
  }
}

function updateParticipantMute(userId, isMuted) {
  const participant = participants.find(p => p.userId === userId);
  if (participant) {
    participant.isMuted = isMuted;
    
    // Update UI
    const card = document.querySelector(`[data-user-id="${userId}"] .pc-mic`);
    if (card) {
      card.className = `pc-mic ${isMuted ? 'muted' : 'active'}`;
      card.innerHTML = isMuted ? '🔇' : '🎤';
    }
    
    const status = document.querySelector(`[data-user-id="${userId}"] .pc-status`);
    if (status) {
      status.textContent = isMuted ? 'Muted' : (participant.isSpeaking ? 'Speaking' : 'Listening');
    }
  }
}

function updateParticipantHand(userId, raised) {
  const participant = participants.find(p => p.userId === userId);
  if (participant) {
    participant.handRaised = raised;
    
    // Update UI
    const card = document.querySelector(`[data-user-id="${userId}"] .pc-hand`);
    if (raised && !card) {
      // Add hand icon
      const wrap = document.querySelector(`[data-user-id="${userId}"] .pc-avatar-wrap`);
      if (wrap) {
        const handDiv = document.createElement('div');
        handDiv.className = 'pc-hand';
        handDiv.innerHTML = '✋';
        wrap.appendChild(handDiv);
      }
    } else if (!raised && card) {
      card.remove();
    }
    
    // Update sidebar
    renderSidebar();
  }
}

function updateParticipantSpeaking(userId, isSpeaking) {
  const participant = participants.find(p => p.userId === userId);
  if (participant) {
    participant.isSpeaking = isSpeaking;
    
    // Update avatar ring
    const avatar = document.querySelector(`[data-user-id="${userId}"] .pc-avatar`);
    if (avatar) {
      avatar.classList.toggle('speaking', isSpeaking);
    }
    
    // Update status
    const status = document.querySelector(`[data-user-id="${userId}"] .pc-status`);
    if (status) {
      status.textContent = isSpeaking ? 'Speaking' : (participant.isMuted ? 'Muted' : 'Listening');
    }
    
    // Update sidebar
    const sidebarAvatar = document.querySelector(`.rsb-p-row:has([data-user-id="${userId}"]) .rsb-p-av`);
    if (sidebarAvatar) {
      sidebarAvatar.classList.toggle('speaking', isSpeaking);
    }
  }
}

function updateOwnSpeaking(isSpeaking) {
  const avatar = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-avatar`);
  if (avatar) {
    avatar.classList.toggle('speaking', isSpeaking);
  }
  
  const status = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-status`);
  if (status) {
    status.textContent = isSpeaking ? 'Speaking' : (!isMicOn ? 'Muted' : 'Listening');
  }
  
  // Update sidebar
  renderSidebar();
}

/* ===== CHAT FUNCTIONS ===== */
function sendMessage(text) {
  if (!text.trim()) return;
  
  const message = {
    roomId,
    message: text.trim(),
    userName: currentUser.name,
    userId: currentUser.id,
    timestamp: new Date().toISOString()
  };
  
  if (socket && socket.connected) {
    socket.emit('room-message', message);
  }
  
  // Add to local chat
  addChatMessage({
    ...message,
    id: 'local-' + Date.now()
  });
}

function sendReaction(reaction) {
  sendMessage(reaction);
}

function addChatMessage(message) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const isOwn = message.userName === currentUser.name || message.userId === currentUser.id;
  const initials = getInitials(message.userName);
  const colors = ['#A8D5BA', '#B4C7E8', '#D4B4E8', '#B4E8D4', '#E8C4B4'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-msg';
  messageEl.style.animation = 'fadeInUp 0.2s ease both';
  messageEl.innerHTML = `
    <div class="chat-msg-av" style="background:linear-gradient(135deg,${color},${color}cc)">${initials}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${escapeHtml(message.userName)} ${isOwn ? '(You)' : ''}</span>
        <span class="chat-msg-time">${formatTime(message.timestamp)}</span>
      </div>
      <p class="chat-msg-text">${escapeHtml(message.message)}</p>
    </div>
  `;
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

/* ===== CONTROL FUNCTIONS ===== */
function toggleMute() {
  if (!localStream) {
    showToast('Microphone not available', 'error');
    return;
  }
  
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks && audioTracks.length > 0) {
    isMicOn = !isMicOn;
    audioTracks[0].enabled = isMicOn;
    
    // Update UI
    const micBtn = document.getElementById('ctrl-mic');
    micBtn.className = `ctrl-btn ${isMicOn ? 'ctrl-mic-active' : 'ctrl-mic-neutral'}`;
    micBtn.setAttribute('aria-pressed', isMicOn);
    document.getElementById('mic-off-svg').style.display = isMicOn ? 'none' : 'block';
    document.getElementById('mic-on-svg').style.display = isMicOn ? 'block' : 'none';
    
    // Update own card
    const micIcon = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-mic`);
    if (micIcon) {
      micIcon.className = `pc-mic ${!isMicOn ? 'muted' : 'active'}`;
      micIcon.innerHTML = !isMicOn ? '🔇' : '🎤';
    }
    
    const status = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-status`);
    if (status) {
      status.textContent = !isMicOn ? 'Muted' : (window.lastSpeakingStatus ? 'Speaking' : 'Listening');
    }
    
    // Update sidebar
    renderSidebar();
    
    // Notify server
    if (socket && socket.connected) {
      socket.emit('toggle-mute', {
        roomId,
        userId: currentUser.id,
        isMuted: !isMicOn
      });
    }
  }
}

function toggleHand() {
  isHandUp = !isHandUp;
  
  // Update UI
  const handBtn = document.getElementById('ctrl-hand');
  handBtn.className = `ctrl-btn ${isHandUp ? 'ctrl-hand-on' : 'ctrl-hand-off'}`;
  handBtn.setAttribute('aria-pressed', isHandUp);
  
  // Update own card
  const wrap = document.querySelector(`[data-user-id="${currentUser.id}"] .pc-avatar-wrap`);
  if (wrap) {
    const existingHand = wrap.querySelector('.pc-hand');
    if (isHandUp && !existingHand) {
      const handDiv = document.createElement('div');
      handDiv.className = 'pc-hand';
      handDiv.innerHTML = '✋';
      wrap.appendChild(handDiv);
    } else if (!isHandUp && existingHand) {
      existingHand.remove();
    }
  }
  
  // Update sidebar
  renderSidebar();
  
  // Notify server
  if (socket && socket.connected) {
    socket.emit('raise-hand', {
      roomId,
      userId: currentUser.id,
      raised: isHandUp
    });
  }
}

function leaveRoom() {
  if (socket && socket.connected) {
    socket.emit('leave-voice-room', {
      roomId,
      userId: currentUser.id
    });
  }
  
  cleanupWebRTC();
  window.location.href = 'voice-rooms.html';
}

function cleanupWebRTC() {
  // Stop all peer connections
  Object.values(peerConnections).forEach(peer => {
    try { peer.destroy(); } catch (e) {}
  });
  peerConnections = {};
  
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Stop audio analysis
  if (speakingInterval) {
    clearInterval(speakingInterval);
    speakingInterval = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

/* ===== CHAT PANEL TOGGLE ===== */
function openChatPanel() {
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('chat-panel').classList.remove('hidden');
  document.getElementById('chat-input')?.focus();
}

function closeChatPanel() {
  document.getElementById('chat-panel').classList.add('hidden');
  document.getElementById('info-panel').style.display = 'flex';
}

/* ===== EVENT LISTENERS ===== */
function setupEventListeners() {
  // Control buttons
  document.getElementById('ctrl-mic')?.addEventListener('click', toggleMute);
  document.getElementById('ctrl-hand')?.addEventListener('click', toggleHand);
  document.getElementById('ctrl-leave')?.addEventListener('click', leaveRoom);
  
  // Chat panel
  document.getElementById('open-chat-btn')?.addEventListener('click', openChatPanel);
  document.getElementById('chat-back-btn')?.addEventListener('click', closeChatPanel);
  
  // Chat input
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  
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
      if (chatInput && chatInput.value.trim()) {
        sendMessage(chatInput.value);
        chatInput.value = '';
        chatSend.disabled = true;
      }
    });
  }
  
  // Back button
  document.querySelector('.back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    leaveRoom();
  });
  
  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (socket && socket.connected) {
      socket.emit('leave-voice-room', {
        roomId,
        userId: currentUser.id
      });
    }
    cleanupWebRTC();
  });
}

/* ===== UTILITY FUNCTIONS ===== */
function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function getRandomColor() {
  const colors = ['#7A4030', '#5A3025', '#6B3828', '#5E3020', '#4F2A1A', '#8B4A35', '#9B5A40'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.room-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = 'room-toast';
  toast.style.cssText = `
    position: fixed;
    top: 80px;
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
    max-width: 300px;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===== DEMO DATA ===== */
function getDemoParticipants() {
  return [
    { userId: 'host1', name: 'Elena Vance', initials: 'EV', isHost: true, isMuted: false, isSpeaking: false, handRaised: false, color: '#7A4030' },
    { userId: 'user2', name: 'Marcus Chen', initials: 'MC', isHost: false, isMuted: true, isSpeaking: false, handRaised: false, color: '#5A3025' },
    { userId: 'user3', name: 'Sarah Jenkins', initials: 'SJ', isHost: false, isMuted: false, isSpeaking: true, handRaised: false, color: '#6B3828', featured: true },
    { userId: 'user4', name: 'David Kim', initials: 'DK', isHost: false, isMuted: false, isSpeaking: false, handRaised: false, color: '#5E3020' },
    { userId: 'user5', name: 'Aisha Patel', initials: 'AP', isHost: false, isMuted: true, isSpeaking: false, handRaised: true, color: '#4F2A1A' }
  ];
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
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .pc-hand {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-gold, #C9A640);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--bg-primary, #3B1D14);
    animation: fadeInUp 0.2s ease;
    z-index: 5;
  }
  .pc-crown {
    position: absolute;
    top: -8px;
    left: -4px;
    font-size: 20px;
    animation: fadeInUp 0.2s ease;
    z-index: 5;
  }
  .pc-mic {
    z-index: 5;
  }
  .room-toast {
    z-index: 9999;
  }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Make functions globally available
window.sendReaction = sendReaction;
window.toggleMute = toggleMute;
window.toggleHand = toggleHand;
window.leaveRoom = leaveRoom;