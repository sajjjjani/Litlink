const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const VoiceRoom = require('./models/VoiceRoom');
const RoomParticipant = require('./models/RoomParticipant');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const FilterService = require('./services/filterService');
const { corsOrigin } = require('./utils/allowedOrigins');

// ─────────────────────────────────────────────────────────────────────────────
// RotatingRoomState — in-memory state for a single rotating-mode room
// ─────────────────────────────────────────────────────────────────────────────
class RotatingRoomState {
  constructor(roomId, timeLimit = 90) {
    this.roomId         = roomId;
    this.timeLimit      = timeLimit;
    this.queue          = [];          // [{ userId, userName }, ...]
    this.currentSpeaker = null;        // { userId, userName } | null
    this.timerInterval  = null;
    this.secondsLeft    = 0;
    this.voteSkipVoters = new Set();
  }

  joinQueue(userId, userName) {
    if (this.isInQueue(userId) || this.isCurrentSpeaker(userId)) return null;
    this.queue.push({ userId, userName });
    return this.queue.length;
  }

  leaveQueue(userId) {
    const idx = this.queue.findIndex(u => u.userId === userId);
    if (idx !== -1) this.queue.splice(idx, 1);
  }

  isInQueue(userId)        { return this.queue.some(u => u.userId === userId); }
  isCurrentSpeaker(userId) { return this.currentSpeaker?.userId === userId; }

  advanceTurn() {
    this.currentSpeaker = this.queue.length > 0 ? this.queue.shift() : null;
    this.secondsLeft    = this.timeLimit;
    this.voteSkipVoters.clear();
    return this.currentSpeaker;
  }

  snapshot() {
    return {
      currentSpeaker : this.currentSpeaker,
      queue          : [...this.queue],
      secondsLeft    : this.secondsLeft,
      timeLimit      : this.timeLimit,
      voteSkipCount  : this.voteSkipVoters.size,
      voteSkipNeeded : Math.max(1, Math.ceil((this.queue.length + 2) / 2))
    };
  }

  destroy() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SocketServer
// ─────────────────────────────────────────────────────────────────────────────
class SocketServer {
  constructor(server) {
    console.log('🔌 Initializing Socket.IO server with Voice Room, Chat, and Rotating Speaker support...');

    if (!server) throw new Error('HTTP server instance is required');

    try {
      this.io = new Server(server, {
        cors: {
          origin: corsOrigin,
          methods: ['GET', 'POST'],
          credentials: true
        },
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        allowEIO3: true,
        connectTimeout: 45000,
        pingTimeout: 60000,
        pingInterval: 25000
      });

      this.userSockets      = new Map(); // userId -> Set<socketId>
      this.socketUsers      = new Map(); // socketId -> userId
      this.activeRooms      = new Map(); // roomId -> Set<socketId>
      this.roomParticipants = new Map(); // roomId -> Map<userId, Set<socketId>>
      this.userStatus       = new Map(); // userId -> { online, lastSeen }
      this.adminSockets     = new Map(); // socketId -> userId
      this.rotatingRooms    = new Map(); // roomId -> RotatingRoomState

      this.setupEventHandlers();
      console.log('✅ Socket.IO server is ready with voice room, chat, and rotating speaker support');

    } catch (error) {
      console.error('❌ Failed to create Socket.IO server:', error);
      throw error;
    }
  }

  // ── Multi-socket helpers ─────────────────────────────────────────────────

  _addUserSocket(userId, socketId) {
    const uid = userId.toString().trim();
    if (!this.userSockets.has(uid)) this.userSockets.set(uid, new Set());
    this.userSockets.get(uid).add(socketId);
    this.socketUsers.set(socketId, uid);
  }

  _removeUserSocket(socketId) {
    const uid = this.socketUsers.get(socketId);
    if (!uid) return null;
    this.socketUsers.delete(socketId);
    const sids = this.userSockets.get(uid);
    if (sids) {
      sids.delete(socketId);
      if (sids.size === 0) {
        this.userSockets.delete(uid);
        this.userStatus.set(uid, { online: false, lastSeen: new Date() });
      }
    }
    return uid;
  }

  _isUserOnline(userId) {
    const sids = this.userSockets.get(userId.toString().trim());
    return sids ? sids.size > 0 : false;
  }

  _emitToUser(userId, event, data) {
    const sids = this.userSockets.get(userId.toString().trim());
    if (!sids || sids.size === 0) return false;
    for (const sid of sids) this.io.to(sid).emit(event, data);
    return true;
  }

  _getRoomForSocket(socketId) {
    for (const [roomId, set] of this.activeRooms.entries()) {
      if (set.has(socketId)) return roomId;
    }
    return null;
  }

  // ── setupEventHandlers ───────────────────────────────────────────────────
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('✅ Client connected:', socket.id, `transport=${socket.conn.transport.name}`);

      let currentUserId = null;
      let isAdmin = false;

      // ─────────────────────────────────────────
      // AUTHENTICATE
      // ─────────────────────────────────────────
      socket.on('authenticate', async (token) => {
        try {
          if (!token) {
            socket.emit('authenticated', { success: false, error: 'No token provided' });
            return;
          }

          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
          const user    = await User.findById(decoded.userId);

          if (!user) {
            socket.emit('authenticated', { success: false, error: 'User not found' });
            return;
          }

          currentUserId = user._id.toString();
          isAdmin       = user.isAdmin === true;

          this._addUserSocket(currentUserId, socket.id);
          this.userStatus.set(currentUserId, { online: true, lastSeen: new Date() });

          // ── Join personal notification room so io.to(`user-${id}`) works ──
          socket.join(`user-${currentUserId}`);

          if (isAdmin) {
            this.adminSockets.set(socket.id, currentUserId);
            console.log(`👑 Admin connected: ${user.name}`);
            socket.emit('admin-authenticated', {
              success: true,
              userName: user.name,
              connectedAdmins: this.adminSockets.size
            });
          }

          socket.emit('authenticated', {
            success: true,
            userId: currentUserId,
            isAdmin: isAdmin
          });

          console.log(`🔐 User ${user.name} authenticated (socket ${socket.id})${isAdmin ? ' (Admin)' : ''}`);

        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authenticated', { success: false, error: error.message });
        }
      });

      socket.conn.on('upgrade', () => {
        console.log(`🔄 Transport upgraded for ${socket.id}: ${socket.conn.transport.name}`);
      });

      // ─────────────────────────────────────────
      // CHAT MESSAGE HANDLERS
      // ─────────────────────────────────────────

      socket.on('chat:message', async (data) => {
        try {
          const { content, conversationId, attachment } = data;
          const recipientId = data.recipientId ? data.recipientId.toString().trim() : null;

          if (!currentUserId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          if (!recipientId) {
            socket.emit('error', { message: 'Recipient ID required' });
            return;
          }

          if (!content && !attachment) {
            socket.emit('error', { message: 'Message content required' });
            return;
          }

          const sender = await User.findById(currentUserId);
          if (!sender) {
            socket.emit('error', { message: 'User not found' });
            return;
          }

          // ── Check suspension ──────────────────────────────────────────────
          if (sender.isSuspended && sender.suspensionEnds) {
            if (new Date() < sender.suspensionEnds) {
              const daysLeft = Math.ceil((sender.suspensionEnds - new Date()) / (1000 * 60 * 60 * 24));
              socket.emit('message-blocked', {
                suspended: true,
                warning: `⛔ Your account is suspended for ${daysLeft} more day(s) due to multiple content violations. Please review our community guidelines.`,
                suspensionEnds: sender.suspensionEnds,
                daysLeft
              });
              return;
            } else {
              // Suspension expired — lift it automatically
              sender.isSuspended = false;
              sender.suspensionEnds = null;
              sender.suspensionReason = null;
              await sender.save();
            }
          }

          // ── Check if recipient is blocked ────────────────────────────────
          const UserSettings = require('./models/UserSettings');
          if (sender.blockedUsers && sender.blockedUsers.some(id => id.toString() === recipientId)) {
            socket.emit('message-blocked', {
              blocked: true,
              warning: 'You cannot message a blocked user.'
            });
            return;
          }

          // ── Check if sender is blocked by recipient ──────────────────────
          const recipientUser = await User.findById(recipientId).select('blockedUsers');
          if (recipientUser && recipientUser.blockedUsers && recipientUser.blockedUsers.some(id => id.toString() === currentUserId)) {
            socket.emit('message-blocked', {
              blocked: true,
              warning: 'You cannot message this user.'
            });
            return;
          }

          // ── Check recipient's message privacy setting ────────────────────
          try {
            const recipientSettings = await UserSettings.findOne({ userId: recipientId });
            if (recipientSettings && recipientSettings.privacy) {
              const msgPrivacy = recipientSettings.privacy.messagePrivacy || 'everyone';
              if (msgPrivacy === 'none') {
                socket.emit('message-blocked', {
                  privacyBlocked: true,
                  warning: 'This user is not accepting messages.'
                });
                return;
              }
              if (msgPrivacy === 'followers') {
                const recipient = await User.findById(recipientId).select('followers');
                if (recipient && recipient.followers) {
                  const isFollower = recipient.followers.some(id => id.toString() === currentUserId);
                  if (!isFollower) {
                    socket.emit('message-blocked', {
                      privacyBlocked: true,
                      warning: 'This user only accepts messages from followers.'
                    });
                    return;
                  }
                }
              }
            }
          } catch (settingsError) {
            console.error('Failed to check notification settings, continuing delivery:', settingsError);
          }

          // ── Content filter (text messages only) ──────────────────────────
          let finalContent = content || '';
          let filterWarning = null;

          if (finalContent && finalContent.trim()) {
            const filterResult = await FilterService.checkAndProcess(
              finalContent,
              currentUserId,
              'chat',
              recipientId
            );

            if (!filterResult.allowed) {
              // Suspended or blocked — reject the message entirely
              socket.emit('message-blocked', {
                originalMessage: finalContent,
                warning: filterResult.message,
                warningIssued: filterResult.warningIssued,
                warningCount: filterResult.warningCount,
                suspended: filterResult.suspended
              });
              return;
            }

            if (filterResult.hasViolation) {
              // Allowed but with a warning — use censored text and notify sender
              finalContent = filterResult.censoredText;
              filterWarning = {
                message: filterResult.message,
                warningCount: filterResult.warningCount,
                warningIssued: filterResult.warningIssued
              };
              socket.emit('content-warning', {
                type: 'content_warning',
                title: 'Content Warning',
                message: filterResult.message,
                warningNumber: filterResult.warningCount,
                timestamp: new Date()
              });
            }
          }

          let conversation = null;

          if (conversationId) {
            conversation = await Conversation.findById(conversationId);
          }

          if (!conversation) {
            conversation = await Conversation.findOne({
              participants: { $all: [currentUserId, recipientId], $size: 2 }
            });

            if (!conversation) {
              conversation = new Conversation({
                participants: [currentUserId, recipientId],
                messages: [],
                unreadCount: new Map()
              });
              conversation.unreadCount.set(currentUserId, 0);
              conversation.unreadCount.set(recipientId, 0);
              await conversation.save();
            }
          }

          const messageObj = {
            _id: new mongoose.Types.ObjectId(),
            sender: currentUserId,
            content: finalContent,
            type: attachment ? 'file' : 'text',
            read: false,
            readAt: null,
            createdAt: new Date(),
            attachment: attachment || null,
            wasFiltered: filterWarning !== null
          };

          conversation.messages.push(messageObj);
          conversation.lastMessage = new Date();
          conversation.lastMessagePreview = finalContent
            ? (finalContent.length > 50 ? finalContent.substring(0, 47) + '...' : finalContent)
            : '📎 Sent an attachment';

          const currentUnread = conversation.unreadCount.get(recipientId) || 0;
          conversation.unreadCount.set(recipientId, currentUnread + 1);

          await conversation.save();

          // Emit updated unread count to recipient
          this._emitToUser(recipientId, 'unread-count-updated', {
            unreadCount: currentUnread + 1,
            senderId: currentUserId
          });

          const messageToSend = {
            _id: messageObj._id,
            senderId: currentUserId,
            senderName: sender.name,
            content: finalContent,
            type: messageObj.type,
            attachment: attachment,
            createdAt: messageObj.createdAt,
            conversationId: conversation._id,
            wasFiltered: filterWarning !== null
          };

          const recipientSids = this.userSockets.get(recipientId);
          if (recipientSids && recipientSids.size > 0) {
            for (const sid of recipientSids) {
              this.io.to(sid).emit('chat:message', { ...messageToSend, isFromOthers: true });
            }
            console.log(`📬 Message delivered to ${recipientSids.size} socket(s) for recipient ${recipientId}`);
          } else {
            console.log(`⚠️  Recipient ${recipientId} is not connected — message saved to DB only`);
          }

          socket.emit('chat:message:sent', {
            success: true,
            message: messageToSend,
            conversationId: conversation._id,
            warningIssued: filterWarning !== null,
            warningMessage: filterWarning ? filterWarning.message : null,
            warningCount: filterWarning ? filterWarning.warningCount : null
          });

          console.log(`💬 Message sent from ${sender.name} to ${recipientId}`);

        } catch (error) {
          console.error('Error sending chat message:', error);
          socket.emit('error', { message: 'Failed to send message: ' + error.message });
        }
      });

      // Chat history
      socket.on('chat:history', async (data) => {
        try {
          const { limit = 50 } = data;
          const otherUserId = data.otherUserId ? data.otherUserId.toString().trim() : null;

          if (!currentUserId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          if (!otherUserId) {
            socket.emit('error', { message: 'Other user ID required' });
            return;
          }

          const conversation = await Conversation.findOne({
            participants: { $all: [currentUserId, otherUserId], $size: 2 }
          }).populate('messages.sender', 'name profilePicture');

          if (!conversation) {
            socket.emit('chat:history', { conversationId: null, messages: [], error: false });
            return;
          }

          let unreadCount = 0;
          conversation.messages.forEach(msg => {
            if (msg.unsent) return;
            const senderId = msg.sender._id ? msg.sender._id.toString() : msg.sender.toString();
            if (senderId !== currentUserId && !msg.read) {
              msg.read = true;
              msg.readAt = new Date();
              unreadCount++;
            }
          });

          if (unreadCount > 0) {
            if (typeof conversation.unreadCount.set === 'function') {
              conversation.unreadCount.set(currentUserId, 0);
            } else {
              conversation.unreadCount[currentUserId] = 0;
              conversation.markModified('unreadCount');
            }
            await conversation.save();
          }

          const visibleMessages = conversation.messages.filter(msg => {
            if (msg.unsent) return false;
            if (msg.deletedFor && msg.deletedFor.some(id => id.toString() === currentUserId)) return false;
            return true;
          });

          const messages = visibleMessages.slice(-limit).map(msg => ({
            _id: msg._id,
            sender: msg.sender._id ? msg.sender._id.toString() : msg.sender.toString(),
            senderName: msg.sender.name,
            content: msg.content,
            type: msg.type,
            attachment: msg.attachment && msg.attachment.data ? msg.attachment : null,
            read: msg.read,
            readAt: msg.readAt,
            createdAt: msg.createdAt,
            unsent: msg.unsent || false,
            deletedFor: msg.deletedFor || []
          }));

          socket.emit('chat:history', {
            conversationId: conversation._id,
            messages: messages,
            error: false
          });

        } catch (error) {
          console.error('Error fetching chat history:', error);
          socket.emit('chat:history', {
            conversationId: null,
            messages: [],
            error: true,
            message: error.message
          });
        }
      });

      // Typing indicator
      socket.on('chat:typing', async (data) => {
        try {
          const { recipientId, isTyping } = data;
          if (!currentUserId) return;
          const rid = recipientId ? recipientId.toString().trim() : null;
          if (rid) this._emitToUser(rid, 'chat:typing', { senderId: currentUserId, isTyping });
        } catch (error) {
          console.error('Error sending typing indicator:', error);
        }
      });

      // Online status
      socket.on('chat:online', async (data) => {
        try {
          const { userIds } = data;
          if (!currentUserId) return;

          const onlineStatus = {};
          userIds.forEach(userId => {
            const uid = userId ? userId.toString().trim() : userId;
            onlineStatus[uid] = this._isUserOnline(uid);
          });

          socket.emit('chat:online', { online: onlineStatus });
        } catch (error) {
          console.error('Error getting online status:', error);
        }
      });

      // Mark messages as read
      socket.on('chat:mark-read', async (data) => {
        try {
          const { conversationId, otherUserId } = data;
          if (!currentUserId) return;

          const conversation = await Conversation.findById(conversationId);
          if (!conversation) return;

          let unreadMarked = 0;
          conversation.messages.forEach(msg => {
            if (msg.sender.toString() !== currentUserId && !msg.read) {
              msg.read = true;
              msg.readAt = new Date();
              unreadMarked++;
            }
          });

          if (unreadMarked > 0) {
            conversation.unreadCount.set(currentUserId, 0);
            await conversation.save();

            if (otherUserId) {
              this._emitToUser(otherUserId.toString(), 'chat:read-receipt', {
                conversationId,
                readBy: currentUserId,
                readAt: new Date()
              });
            }
          }
        } catch (error) {
          console.error('Error marking messages as read:', error);
        }
      });

      // ─────────────────────────────────────────
      // VOICE ROOM HANDLERS
      // ─────────────────────────────────────────

      socket.on('join-voice-room', async (data) => {
        try {
          const { roomId, userName } = data;

          if (!currentUserId) {
            socket.emit('error', { message: 'Authentication required' });
            return;
          }
          const verifiedUserId = currentUserId;

          const room = await VoiceRoom.findById(roomId);
          if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
          }

          if (room.status !== 'live') {
            if (room.status === 'scheduled' && room.scheduledFor && room.scheduledFor <= new Date()) {
              room.status = 'live';
              await room.save();
            } else {
              socket.emit('error', { message: 'Room is not live' });
              return;
            }
          }

          socket.join(`room-${roomId}`);

          if (!this.activeRooms.has(roomId)) this.activeRooms.set(roomId, new Set());
          this.activeRooms.get(roomId).add(socket.id);

          if (!this.roomParticipants.has(roomId)) this.roomParticipants.set(roomId, new Map());
          const pMap = this.roomParticipants.get(roomId);
          if (!pMap.has(verifiedUserId)) pMap.set(verifiedUserId, new Set());
          pMap.get(verifiedUserId).add(socket.id);

          let participant = await RoomParticipant.findOne({ roomId, userId: verifiedUserId, leftAt: null });

          if (!participant) {
            participant = new RoomParticipant({
              roomId,
              userId: verifiedUserId,
              userName,
              socketId: socket.id,
              isMuted: true,
              canSpeak: false,
              joinedAt: new Date()
            });
          } else {
            participant.socketId = socket.id;
            participant.leftAt = null;
            participant.isMuted = true;
            participant.canSpeak = false;
          }
          await participant.save();

          const participantCount = await RoomParticipant.countDocuments({ roomId, leftAt: null });
          await VoiceRoom.findByIdAndUpdate(roomId, { participantCount });

          const participants = await RoomParticipant.find({ roomId, leftAt: null })
            .select('userId userName isMuted canSpeak handRaised isSpeaking');

          socket.to(`room-${roomId}`).emit('user-joined', {
            userId: verifiedUserId,
            userName,
            timestamp: new Date()
          });

          const rotatingState = this.rotatingRooms.has(roomId)
            ? this.rotatingRooms.get(roomId).snapshot()
            : null;

          socket.emit('room-joined', {
            roomId,
            roomName: room.name,
            hostId: room.hostId.toString(),
            hostName: room.hostName,
            mode: rotatingState ? 'rotating' : 'free',
            rotatingState,
            participants: participants.map(p => ({
              userId: p.userId.toString(),
              name: p.userName,
              isMuted: p.isMuted,
              canSpeak: p.canSpeak,
              handRaised: p.handRaised,
              isSpeaking: p.isSpeaking
            }))
          });

          console.log(`👤 User ${userName} (${verifiedUserId}) joined room ${room.name}`);

        } catch (error) {
          console.error('Error joining room:', error);
          socket.emit('error', { message: 'Failed to join room' });
        }
      });

      // WebRTC signaling
      socket.on('signal', async (data) => {
        const { to, signal, roomId } = data;
        try {
          if (!currentUserId) return;
          const targetSids = this.roomParticipants.get(roomId)?.get(to);
          if (targetSids) {
            for (const sid of targetSids) {
              this.io.to(sid).emit('signal', {
                from: currentUserId,
                signal,
                fromSocketId: socket.id
              });
            }
          }
        } catch (error) {
          console.error('Error forwarding signal:', error);
        }
      });

      // Mute toggle — enforces host permissions
      socket.on('toggle-mute', async (data) => {
        try {
          const { roomId, isMuted } = data;
          if (!currentUserId) return;

          // If trying to unmute, check if user has permission to speak
          if (!isMuted) {
            const participant = await RoomParticipant.findOne(
              { roomId, userId: currentUserId, leftAt: null }
            );

            if (!participant) return;

            // Check if user is the host
            const room = await VoiceRoom.findById(roomId);
            const isHost = room && room.hostId?.toString() === currentUserId;

            // Non-host users cannot unmute without canSpeak permission
            if (!isHost && !participant.canSpeak) {
              socket.emit('mute-denied', {
                message: 'You do not have permission to speak. Wait for the host to grant it.',
                timestamp: new Date()
              });
              return;
            }
          }

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: currentUserId, leftAt: null },
            { isMuted }
          );

          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId: currentUserId,
            isMuted,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error toggling mute:', error);
        }
      });

      // Raise hand
      socket.on('raise-hand', async (data) => {
        try {
          const { roomId, raised, userName } = data;
          if (!currentUserId) return;

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: currentUserId, leftAt: null },
            { handRaised: raised }
          );

          this.io.to(`room-${roomId}`).emit('hand-raised', {
            userId: currentUserId,
            raised,
            timestamp: new Date()
          });

          const rState = this.rotatingRooms.get(roomId);
          if (rState) {
            if (raised) {
              const position = rState.joinQueue(currentUserId, userName || currentUserId);
              if (position !== null) {
                if (!rState.currentSpeaker) {
                  rState.advanceTurn();
                  this._startRotationTimer(roomId);
                  this.io.to(`room-${roomId}`).emit('turn-changed', {
                    prevSpeaker: null,
                    nextSpeaker: rState.currentSpeaker,
                    ...rState.snapshot(),
                    timestamp: new Date()
                  });
                } else {
                  this.io.to(`room-${roomId}`).emit('queue-updated', {
                    ...rState.snapshot(),
                    action: 'joined',
                    userId: currentUserId,
                    position,
                    timestamp: new Date()
                  });
                }
              }
            } else {
              const wasCurrentSpeaker = rState.isCurrentSpeaker(currentUserId);
              rState.leaveQueue(currentUserId);
              if (wasCurrentSpeaker) {
                this._advanceToNextSpeaker(roomId);
              } else {
                this.io.to(`room-${roomId}`).emit('queue-updated', {
                  ...rState.snapshot(),
                  action: 'left',
                  userId: currentUserId,
                  timestamp: new Date()
                });
              }
            }
          }
        } catch (error) {
          console.error('Error raising hand:', error);
        }
      });

      // Speaking status
      socket.on('speaking', async (data) => {
        const { roomId, isSpeaking } = data;
        if (!currentUserId) return;
        try {
          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: currentUserId, leftAt: null },
            { isSpeaking }
          );

          socket.to(`room-${roomId}`).emit('user-speaking', {
            userId: currentUserId,
            isSpeaking,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error updating speaking status:', error);
        }
      });

      // ─────────────────────────────────────────
      // HOST MODERATION EVENTS
      // ─────────────────────────────────────────

      // Host mutes a participant
      socket.on('host-mute-user', async (data) => {
        try {
          const { roomId, targetUserId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can mute users.' });
            return;
          }

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: targetUserId, leftAt: null },
            { isMuted: true, canSpeak: false }
          );

          // If host is muting themselves, just update DB
          if (targetUserId === currentUserId) {
            this.io.to(`room-${roomId}`).emit('user-muted', {
              userId: targetUserId,
              isMuted: true,
              timestamp: new Date()
            });
            return;
          }

          this.io.to(`room-${roomId}`).emit('host-muted-user', {
            userId: targetUserId,
            isMuted: true,
            mutedBy: currentUserId,
            timestamp: new Date()
          });

          // Also emit the standard mute event so UI updates
          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId: targetUserId,
            isMuted: true,
            timestamp: new Date()
          });

          console.log(`🔇 Host ${currentUserId} muted user ${targetUserId} in room ${roomId}`);
        } catch (error) {
          console.error('host-mute-user error:', error);
        }
      });

      // Host unmutes a participant
      socket.on('host-unmute-user', async (data) => {
        try {
          const { roomId, targetUserId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can unmute users.' });
            return;
          }

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: targetUserId, leftAt: null },
            { isMuted: false }
          );

          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId: targetUserId,
            isMuted: false,
            timestamp: new Date()
          });

          console.log(`🔊 Host ${currentUserId} unmuted user ${targetUserId} in room ${roomId}`);
        } catch (error) {
          console.error('host-unmute-user error:', error);
        }
      });

      // Host unmutes ALL participants except self
      socket.on('host-unmute-all', async (data) => {
        try {
          const { roomId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can unmute all.' });
            return;
          }

          // Unmute all participants except the host
          await RoomParticipant.updateMany(
            { roomId, userId: { $ne: currentUserId }, leftAt: null },
            { isMuted: false, canSpeak: true }
          );

          // Broadcast unmute-all event so clients re-enable audio
          this.io.to(`room-${roomId}`).emit('host-unmute-all', {
            exceptUserId: currentUserId,
            timestamp: new Date()
          });

          // Send individual unmute + speak-allowed events for each non-host participant
          const allParticipants = await RoomParticipant.find(
            { roomId, userId: { $ne: currentUserId }, leftAt: null }
          ).select('userId');

          for (const p of allParticipants) {
            this.io.to(`room-${roomId}`).emit('user-muted', {
              userId: p.userId.toString(),
              isMuted: false,
              timestamp: new Date()
            });
            this.io.to(`room-${roomId}`).emit('user-speak-allowed', {
              userId: p.userId.toString(),
              canSpeak: true,
              timestamp: new Date()
            });
          }

          console.log(`🔊 Host ${currentUserId} unmuted all participants in room ${roomId}`);
        } catch (error) {
          console.error('host-unmute-all error:', error);
        }
      });

      // Host mutes ALL participants except self
      socket.on('host-mute-all', async (data) => {
        try {
          const { roomId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can mute all.' });
            return;
          }

          // Mute all participants except the host
          await RoomParticipant.updateMany(
            { roomId, userId: { $ne: currentUserId }, leftAt: null },
            { isMuted: true, canSpeak: false }
          );

          // Broadcast mute-all event so clients force-disable audio
          this.io.to(`room-${roomId}`).emit('host-mute-all', {
            exceptUserId: currentUserId,
            timestamp: new Date()
          });

          // Send individual mute events for each non-host participant
          const allParticipants = await RoomParticipant.find(
            { roomId, userId: { $ne: currentUserId }, leftAt: null }
          ).select('userId');

          for (const p of allParticipants) {
            this.io.to(`room-${roomId}`).emit('user-muted', {
              userId: p.userId.toString(),
              isMuted: true,
              timestamp: new Date()
            });
            this.io.to(`room-${roomId}`).emit('user-speak-allowed', {
              userId: p.userId.toString(),
              canSpeak: false,
              timestamp: new Date()
            });
          }

          console.log(`🔇 Host ${currentUserId} muted all participants in room ${roomId}`);
        } catch (error) {
          console.error('host-mute-all error:', error);
        }
      });

      // Host allows a participant to speak
      socket.on('host-allow-speak', async (data) => {
        try {
          const { roomId, targetUserId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can grant speaking permission.' });
            return;
          }

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: targetUserId, leftAt: null },
            { canSpeak: true, isMuted: false }
          );

          this.io.to(`room-${roomId}`).emit('user-speak-allowed', {
            userId: targetUserId,
            canSpeak: true,
            timestamp: new Date()
          });

          // Also emit unmute so UI reflects it
          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId: targetUserId,
            isMuted: false,
            timestamp: new Date()
          });

          console.log(`🎤 Host ${currentUserId} allowed ${targetUserId} to speak in room ${roomId}`);
        } catch (error) {
          console.error('host-allow-speak error:', error);
        }
      });

      // Host revokes speaking permission
      socket.on('host-revoke-speak', async (data) => {
        try {
          const { roomId, targetUserId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can revoke speaking permission.' });
            return;
          }

          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: targetUserId, leftAt: null },
            { canSpeak: false, isMuted: true }
          );

          this.io.to(`room-${roomId}`).emit('user-speak-allowed', {
            userId: targetUserId,
            canSpeak: false,
            timestamp: new Date()
          });

          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId: targetUserId,
            isMuted: true,
            timestamp: new Date()
          });

          console.log(`🔇 Host ${currentUserId} revoked speak permission for ${targetUserId} in room ${roomId}`);
        } catch (error) {
          console.error('host-revoke-speak error:', error);
        }
      });

      // Host kicks a user from the room
      socket.on('host-kick-user', async (data) => {
        try {
          const { roomId, targetUserId } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can remove users.' });
            return;
          }

          // Mark participant as left
          await RoomParticipant.findOneAndUpdate(
            { roomId, userId: targetUserId, leftAt: null },
            { leftAt: new Date() }
          );

          const count = await RoomParticipant.countDocuments({ roomId, leftAt: null });
          await VoiceRoom.findByIdAndUpdate(roomId, { participantCount: count });

          // Notify the kicked user
          this._emitToUser(targetUserId, 'user-kicked', {
            roomId,
            message: 'You were removed from the room by the host.',
            timestamp: new Date()
          });

          // Notify everyone else
          this.io.to(`room-${roomId}`).emit('user-left', {
            userId: targetUserId,
            kicked: true,
            timestamp: new Date()
          });

          // Clean up RTC connections for the kicked user
          const rState = this.rotatingRooms.get(roomId);
          if (rState) {
            rState.leaveQueue(targetUserId);
            if (rState.isCurrentSpeaker(targetUserId)) {
              this._advanceToNextSpeaker(roomId);
            }
          }

          // Disconnect the kicked user's sockets from the room
          const kickedSids = this.roomParticipants.get(roomId)?.get(targetUserId);
          if (kickedSids) {
            for (const sid of kickedSids) {
              const sock = this.io.sockets.sockets.get(sid);
              if (sock) {
                sock.leave(`room-${roomId}`);
              }
            }
            this.roomParticipants.get(roomId).delete(targetUserId);
          }

          console.log(`👢 Host ${currentUserId} kicked user ${targetUserId} from room ${roomId}`);
        } catch (error) {
          console.error('host-kick-user error:', error);
        }
      });

      // Report a user from voice room
      socket.on('report-user', async (data) => {
        try {
          const { roomId, reportedUserId, reason, category } = data;
          if (!currentUserId) {
            socket.emit('error', { message: 'Authentication required' });
            return;
          }

          if (!reportedUserId || !reason || !category) {
            socket.emit('error', { message: 'Missing required fields' });
            return;
          }

          const Report = require('./models/Report');

          const report = new Report({
            reporter: currentUserId,
            reportedUser: reportedUserId,
            reportedItemType: 'voice_room',
            reportedItemId: roomId,
            reason: reason,
            category: category,
            status: 'pending',
            priority: 'medium'
          });

          // Mark as new for post-save hook
          report.wasNew = true;
          await report.save();

          socket.emit('report-submitted', {
            success: true,
            message: 'Report submitted successfully. Our team will review it.',
            reportId: report._id
          });

          console.log(`📋 Report from ${currentUserId} against ${reportedUserId} in room ${roomId}: ${category} - ${reason}`);
        } catch (error) {
          console.error('report-user error:', error);
          socket.emit('error', { message: 'Failed to submit report.' });
        }
      });

      // ─────────────────────────────────────────
      // ROOM CHAT MESSAGE (WITH FILTER)
      // ─────────────────────────────────────────
      socket.on('room-message', async (data) => {
        const { roomId, message, userName } = data;
        if (!currentUserId) return;
        
        // Apply content filtering to voice room chat
        const filterResult = await FilterService.checkAndProcess(message, currentUserId, 'voice_chat', roomId);
        
        if (!filterResult.allowed) {
          socket.emit('message-blocked', {
            originalMessage: message,
            warning: filterResult.message,
            warningIssued: filterResult.warningIssued,
            warningCount: filterResult.warningCount,
            suspended: filterResult.suspended
          });
          return;
        }
        
        const finalMessage = filterResult.hasViolation ? filterResult.censoredText : message;
        
        this.io.to(`room-${roomId}`).emit('new-message', {
          userId: currentUserId,
          userName,
          message: finalMessage,
          wasFiltered: filterResult.hasViolation,
          timestamp: new Date().toISOString()
        });
        
        if (filterResult.warningIssued) {
          socket.emit('content-warning', {
            message: filterResult.message,
            warningNumber: filterResult.warningCount
          });
        }
      });

      // ─────────────────────────────────────────
      // ROTATING SPEAKER HANDLERS
      // ─────────────────────────────────────────

      socket.on('switch-room-mode', async (data) => {
        try {
          const { roomId, mode, timeLimit = 90 } = data;
          if (!currentUserId) return;

          const room = await VoiceRoom.findById(roomId);
          if (!room) return;
          if (room.hostId?.toString() !== currentUserId) {
            socket.emit('error', { message: 'Only the host can change the room mode.' });
            return;
          }

          if (mode === 'rotating') {
            const state = new RotatingRoomState(roomId, Number(timeLimit) || 90);
            this.rotatingRooms.set(roomId, state);
          } else {
            this._stopRotationTimer(roomId);
          }

          this.io.to(`room-${roomId}`).emit('room-mode-changed', {
            mode,
            snapshot: this.rotatingRooms.has(roomId) ? this.rotatingRooms.get(roomId).snapshot() : null,
            timestamp: new Date()
          });

          console.log(`🔄 Room ${roomId} switched to ${mode} mode`);
        } catch (error) {
          console.error('switch-room-mode error:', error);
        }
      });

      socket.on('join-speaker-queue', (data) => {
        try {
          const { roomId, userName } = data;
          if (!currentUserId) return;
          const state = this.rotatingRooms.get(roomId);
          if (!state) { socket.emit('error', { message: 'Room is not in rotating mode.' }); return; }
          const position = state.joinQueue(currentUserId, userName);
          if (position === null) { socket.emit('already-in-queue', {}); return; }

          if (!state.currentSpeaker) {
            state.advanceTurn();
            this._startRotationTimer(roomId);
            this.io.to(`room-${roomId}`).emit('turn-changed', {
              prevSpeaker: null,
              nextSpeaker: state.currentSpeaker,
              ...state.snapshot(),
              timestamp: new Date()
            });
          } else {
            this.io.to(`room-${roomId}`).emit('queue-updated', {
              ...state.snapshot(),
              action: 'joined',
              userId: currentUserId,
              userName,
              position,
              timestamp: new Date()
            });
          }
        } catch (error) {
          console.error('join-speaker-queue error:', error);
        }
      });

      socket.on('leave-speaker-queue', (data) => {
        try {
          const { roomId } = data;
          if (!currentUserId) return;
          const state = this.rotatingRooms.get(roomId);
          if (!state) return;
          state.leaveQueue(currentUserId);
          this.io.to(`room-${roomId}`).emit('queue-updated', {
            ...state.snapshot(),
            action: 'left',
            userId: currentUserId,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('leave-speaker-queue error:', error);
        }
      });

      socket.on('skip-my-turn', (data) => {
        try {
          const { roomId } = data;
          if (!currentUserId) return;
          const state = this.rotatingRooms.get(roomId);
          if (!state || !state.isCurrentSpeaker(currentUserId)) {
            socket.emit('error', { message: 'You are not the current speaker.' });
            return;
          }
          this._advanceToNextSpeaker(roomId);
        } catch (error) {
          console.error('skip-my-turn error:', error);
        }
      });

      socket.on('vote-skip-speaker', (data) => {
        try {
          const { roomId } = data;
          if (!currentUserId) return;
          const state = this.rotatingRooms.get(roomId);
          if (!state || !state.currentSpeaker) return;
          if (state.isCurrentSpeaker(currentUserId)) return;

          state.voteSkipVoters.add(currentUserId);
          const needed = Math.max(1, Math.ceil((state.queue.length + 2) / 2));

          this.io.to(`room-${roomId}`).emit('vote-skip-updated', {
            voteSkipCount: state.voteSkipVoters.size,
            voteSkipNeeded: needed,
            timestamp: new Date()
          });

          if (state.voteSkipVoters.size >= needed) {
            this.io.to(`room-${roomId}`).emit('speaker-skipped-by-vote', {
              skippedUserId: state.currentSpeaker.userId,
              timestamp: new Date()
            });
            this._advanceToNextSpeaker(roomId);
          }
        } catch (error) {
          console.error('vote-skip-speaker error:', error);
        }
      });

      socket.on('room-emoji-reaction', (data) => {
        try {
          const { roomId, userName, emoji } = data;
          if (!currentUserId) return;
          const ALLOWED = ['👍', '❤️', '🤯', '👏', '🔥', '😂', '💡'];
          if (!ALLOWED.includes(emoji)) return;
          this.io.to(`room-${roomId}`).emit('emoji-reaction', {
            userId: currentUserId,
            userName,
            emoji,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('room-emoji-reaction error:', error);
        }
      });

      socket.on('set-topic-prompt', async (data) => {
        try {
          const { roomId, prompt } = data;
          if (!currentUserId) return;
          const room = await VoiceRoom.findById(roomId);
          if (!room || room.hostId?.toString() !== currentUserId) return;
          this.io.to(`room-${roomId}`).emit('topic-prompt-set', {
            prompt,
            setBy: currentUserId,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('set-topic-prompt error:', error);
        }
      });

      // ─────────────────────────────────────────
      // NOTIFICATION HANDLERS
      // ─────────────────────────────────────────

      socket.on('get-unread-count', async () => {
        if (!isAdmin || !currentUserId) return;
        try {
          const Notification = require('./models/Notification');
          const unreadCount = await Notification.countDocuments({
            userId: currentUserId,
            read: false,
            archived: false,
            type: { $regex: '^admin_', $options: 'i' }
          });
          socket.emit('notification-count', { unreadCount });
        } catch (error) {
          console.error('Error getting unread count:', error);
        }
      });

      socket.on('get-user-unread-count', async () => {
        if (!currentUserId) return;
        try {
          const Notification = require('./models/Notification');
          const unreadCount = await Notification.countDocuments({
            userId: currentUserId,
            read: false,
            archived: false
          });
          socket.emit('user-notification-count', { unreadCount });
        } catch (error) {
          console.error('Error getting user unread count:', error);
        }
      });

      socket.on('join-thread', (threadId) => {
        socket.join(`thread-${threadId}`);
        socket.emit('joined-thread', { threadId, message: 'Joined thread' });
      });

      socket.on('leave-thread', (threadId) => {
        socket.leave(`thread-${threadId}`);
      });

      // ─────────────────────────────────────────
      // LEAVE ROOM & DISCONNECT
      // ─────────────────────────────────────────

      socket.on('leave-voice-room', async (data) => {
        await this.handleLeaveRoom(socket, currentUserId);
      });

      socket.on('disconnect', async (reason) => {
        const disconnectLabel = reason === 'transport close' ? 'ℹ️ Client disconnected:' : '❌ Client disconnected:';
        console.log(
          disconnectLabel,
          socket.id,
          `(user: ${currentUserId || 'unauthenticated'})`,
          `reason=${reason}`,
          `transport=${socket.conn.transport.name}`
        );

        this._removeUserSocket(socket.id);

        if (this.adminSockets.has(socket.id)) {
          this.adminSockets.delete(socket.id);
          console.log(`👑 Admin disconnected, ${this.adminSockets.size} admins remain`);
        }

        if (!currentUserId) return;

        for (const [roomId, socketSet] of this.activeRooms.entries()) {
          if (!socketSet.has(socket.id)) continue;
          socketSet.delete(socket.id);

          const pMap = this.roomParticipants.get(roomId);
          if (pMap) {
            const userSids = pMap.get(currentUserId);
            if (userSids) {
              userSids.delete(socket.id);
              if (userSids.size === 0) {
                pMap.delete(currentUserId);
                await this._markParticipantLeft(roomId, currentUserId, socketSet);
              }
            }
          }
        }
      });
    });
  }

  // ── Internal: mark participant left, clean up room if empty ───────────────
  async _markParticipantLeft(roomId, userId, socketSet) {
    try {
      const participant = await RoomParticipant.findOneAndUpdate(
        { roomId, userId, leftAt: null },
        { leftAt: new Date() },
        { new: true }
      );

      if (!participant) return;

      const count = await RoomParticipant.countDocuments({ roomId, leftAt: null });
      await VoiceRoom.findByIdAndUpdate(roomId, { participantCount: count });

      this.io.to(`room-${roomId}`).emit('user-left', {
        userId: userId.toString(),
        timestamp: new Date()
      });

      const rState = this.rotatingRooms.get(roomId);
      if (rState) {
        const wasCurrentSpeaker = rState.isCurrentSpeaker(userId.toString());
        rState.leaveQueue(userId.toString());
        if (wasCurrentSpeaker) {
          this._advanceToNextSpeaker(roomId);
        } else {
          this.io.to(`room-${roomId}`).emit('queue-updated', {
            ...rState.snapshot(),
            action: 'left',
            userId: userId.toString(),
            timestamp: new Date()
          });
        }
      }

      if (count === 0) {
        const room = await VoiceRoom.findById(roomId);
        if (room) {
          room.status = 'completed';
          room.endedAt = new Date();
          room.duration = Math.round((room.endedAt - room.createdAt) / 60000) || 0;
          await room.save();
        }
        this.io.to(`room-${roomId}`).emit('room-ended', {
          message: 'Room ended (no participants)',
          endedAt: new Date()
        });
        this.activeRooms.delete(roomId);
        this.roomParticipants.delete(roomId);
        this._stopRotationTimer(roomId);
      }
    } catch (error) {
      console.error('_markParticipantLeft error:', error);
    }
  }

  async handleLeaveRoom(socket, userId) {
    try {
      if (!userId) return;
      const roomId = this._getRoomForSocket(socket.id);
      if (!roomId) return;

      socket.leave(`room-${roomId}`);

      const socketSet = this.activeRooms.get(roomId);
      if (socketSet) socketSet.delete(socket.id);

      const pMap = this.roomParticipants.get(roomId);
      if (pMap) {
        const userSids = pMap.get(userId);
        if (userSids) {
          userSids.delete(socket.id);
          if (userSids.size === 0) {
            pMap.delete(userId);
            await this._markParticipantLeft(roomId, userId, socketSet || new Set());
          }
        }
      }

      console.log(`👋 User ${userId} left room ${roomId}`);
    } catch (error) {
      console.error('handleLeaveRoom error:', error);
    }
  }

  // ── Rotating speaker timer helpers ────────────────────────────────────────

  _startRotationTimer(roomId) {
    const state = this.rotatingRooms.get(roomId);
    if (!state) return;
    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
      const s = this.rotatingRooms.get(roomId);
      if (!s) { clearInterval(state.timerInterval); return; }

      s.secondsLeft--;
      this.io.to(`room-${roomId}`).emit('timer-tick', {
        secondsLeft: s.secondsLeft,
        timeLimit: s.timeLimit,
        speakerId: s.currentSpeaker?.userId
      });

      if (s.secondsLeft <= 0) this._advanceToNextSpeaker(roomId);
    }, 1000);
  }

  _stopRotationTimer(roomId) {
    const state = this.rotatingRooms.get(roomId);
    if (state) { state.destroy(); this.rotatingRooms.delete(roomId); }
  }

  _advanceToNextSpeaker(roomId) {
    const state = this.rotatingRooms.get(roomId);
    if (!state) return;
    const prevSpeaker = state.currentSpeaker;
    const nextSpeaker = state.advanceTurn();

    if (nextSpeaker) {
      this._startRotationTimer(roomId);
    } else {
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
      }
      state.secondsLeft = 0;
    }

    this.io.to(`room-${roomId}`).emit('turn-changed', {
      prevSpeaker,
      nextSpeaker,
      ...state.snapshot(),
      timestamp: new Date()
    });
    console.log(`🔄 Room ${roomId}: ${prevSpeaker?.userName || '-'} → ${nextSpeaker?.userName || 'nobody (queue empty)'}`);
  }

  // ─────────────────────────────────────────
  // HELPER METHODS (called via global.io.*)
  // ─────────────────────────────────────────

  sendToUser(userId, data) {
    const sent = this._emitToUser(userId, 'notification', data);
    if (sent) {
      console.log(`🔔 Notification sent to user ${userId}`);
    } else {
      console.log(`⚠️  sendToUser: user ${userId} not connected`);
    }
    return sent;
  }

  broadcastToAdmins(data) {
    let sentCount = 0;
    for (const [socketId] of this.adminSockets) {
      this.io.to(socketId).emit('admin-notification', data);
      sentCount++;
    }
    console.log(`📢 Admin notification broadcast to ${sentCount} admin(s)`);
    return sentCount;
  }

  getConnectedAdminCount() {
    return this.adminSockets.size;
  }

  getConnectedAdminIds() {
    return Array.from(this.adminSockets.values());
  }
}

module.exports = SocketServer;
