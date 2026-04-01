const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const VoiceRoom = require('./models/VoiceRoom');
const RoomParticipant = require('./models/RoomParticipant');
const User = require('./models/User');
const Conversation = require('./models/Conversation');

class SocketServer {
  constructor(server) {
    console.log('🔌 Initializing Socket.IO server with Voice Room and Chat support...');
    
    if (!server) {
      throw new Error('HTTP server instance is required');
    }
    
    try {
      this.io = new Server(server, {
        cors: {
          origin: [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:5002',
            'http://127.0.0.1:5002',
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            /^http:\/\/localhost:\d+$/,
            /^http:\/\/127\.0\.0\.1:\d+$/
          ],
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

      // Store active rooms and users
      this.activeRooms = new Map(); // roomId -> Set of socketIds
      this.userSockets = new Map(); // userId -> socketId
      this.roomParticipants = new Map(); // roomId -> Map of userId -> socketId
      this.userStatus = new Map(); // userId -> { online: boolean, lastSeen: Date }
      
      // Admin tracking
      this.adminSockets = new Map(); // socketId -> userId

      this.setupEventHandlers();
      console.log('✅ Socket.IO server is ready with voice room and chat support');
      
    } catch (error) {
      console.error('❌ Failed to create Socket.IO server:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('✅ Client connected:', socket.id);
      
      let currentUserId = null;
      let isAdmin = false;

      // Authenticate user
      socket.on('authenticate', async (token) => {
        try {
          if (!token) {
            socket.emit('authenticated', { success: false, error: 'No token provided' });
            return;
          }

          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
          const user = await User.findById(decoded.userId);
          
          if (!user) {
            socket.emit('authenticated', { success: false, error: 'User not found' });
            return;
          }
          
          currentUserId = user._id.toString();
          isAdmin = user.isAdmin === true;
          
          // Always store as trimmed string to avoid key mismatches
          this.userSockets.set(currentUserId, socket.id);
          this.userStatus.set(currentUserId, { online: true, lastSeen: new Date() });
          
          // Remove any stale socket entries for this user (reconnect case)
          for (const [uid, sid] of this.userSockets.entries()) {
            if (uid === currentUserId && sid !== socket.id) {
              this.userSockets.delete(uid);
            }
          }
          
          // Track admin connections
          if (isAdmin) {
            this.adminSockets.set(socket.id, currentUserId);
            console.log(`👑 Admin connected: ${user.name}`);
            
            // Send admin status to the client
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
          
          console.log(`🔐 User ${user.name} authenticated${isAdmin ? ' (Admin)' : ''}`);
          
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authenticated', { 
            success: false, 
            error: error.message 
          });
        }
      });

      // ========== CHAT MESSAGE HANDLERS ==========
      
      // Send chat message
      socket.on('chat:message', async (data) => {
        try {
          const { content, conversationId, attachment } = data;
          // Normalize recipientId to string to match userSockets key format
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
          
          // Get sender user
          const sender = await User.findById(currentUserId);
          if (!sender) {
            socket.emit('error', { message: 'User not found' });
            return;
          }
          
          // Find or create conversation
          let conversation = null;
          
          if (conversationId) {
            conversation = await Conversation.findById(conversationId);
          }
          
          if (!conversation) {
            // Find existing conversation between these users
            conversation = await Conversation.findOne({
              participants: { $all: [currentUserId, recipientId], $size: 2 }
            });
            
            if (!conversation) {
              // Create new conversation
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
          
          // Create message object
          const messageObj = {
            _id: new mongoose.Types.ObjectId(),
            sender: currentUserId,
            content: content || '',
            type: attachment ? 'file' : 'text',
            read: false,
            readAt: null,
            createdAt: new Date(),
            attachment: attachment || null
          };
          
          // Add to conversation
          conversation.messages.push(messageObj);
          conversation.lastMessage = new Date();
          conversation.lastMessagePreview = content ? (content.length > 50 ? content.substring(0, 47) + '...' : content) : '📎 Sent an attachment';
          
          // Increment unread count for recipient
          const currentUnread = conversation.unreadCount.get(recipientId) || 0;
          conversation.unreadCount.set(recipientId, currentUnread + 1);
          
          await conversation.save();
          
          // Prepare message for sending
          const messageToSend = {
            _id: messageObj._id,
            senderId: currentUserId,
            senderName: sender.name,
            content: content,
            type: messageObj.type,
            attachment: attachment,
            createdAt: messageObj.createdAt,
            conversationId: conversation._id
          };
          
          // Send to recipient if online
          const recipientSocketId = this.userSockets.get(recipientId);
          console.log(`📬 Delivery check — recipient ${recipientId}: socket ${recipientSocketId || 'NOT ONLINE'}`);
          if (recipientSocketId) {
            this.io.to(recipientSocketId).emit('chat:message', {
              ...messageToSend,
              isFromOthers: true
            });
            console.log(`✅ Message delivered to socket ${recipientSocketId}`);
          } else {
            console.log(`⚠️  Recipient ${recipientId} is not connected — message saved to DB only`);
          }
          
          // Send confirmation to sender
          socket.emit('chat:message:sent', {
            success: true,
            message: messageToSend,
            conversationId: conversation._id
          });
          
          console.log(`💬 Message sent from ${sender.name} to ${recipientId}`);
          
        } catch (error) {
          console.error('Error sending chat message:', error);
          socket.emit('error', { message: 'Failed to send message: ' + error.message });
        }
      });
      
      // Request chat history
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
          
          // Find conversation
          const conversation = await Conversation.findOne({
            participants: { $all: [currentUserId, otherUserId], $size: 2 }
          }).populate('messages.sender', 'name profilePicture');
          
          if (!conversation) {
            socket.emit('chat:history', {
              conversationId: null,
              messages: [],
              error: false
            });
            return;
          }
          
          // Mark messages as read for current user
          let unreadCount = 0;
          conversation.messages.forEach(msg => {
            if (msg.sender._id.toString() !== currentUserId && !msg.read) {
              msg.read = true;
              msg.readAt = new Date();
              unreadCount++;
            }
          });
          
          if (unreadCount > 0) {
            conversation.unreadCount.set(currentUserId, 0);
            await conversation.save();
          }
          
          // Get last limit messages
          const messages = conversation.messages.slice(-limit).map(msg => ({
            _id: msg._id,
            sender: msg.sender._id.toString(),
            senderName: msg.sender.name,
            content: msg.content,
            type: msg.type,
            attachment: msg.attachment,
            read: msg.read,
            readAt: msg.readAt,
            createdAt: msg.createdAt
          }));
          
          socket.emit('chat:history', {
            conversationId: conversation._id,
            messages: messages.reverse(),
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
          
          const recipientSocketId = this.userSockets.get(recipientId);
          if (recipientSocketId) {
            this.io.to(recipientSocketId).emit('chat:typing', {
              senderId: currentUserId,
              isTyping: isTyping
            });
          }
        } catch (error) {
          console.error('Error sending typing indicator:', error);
        }
      });
      
      // Get online status for users
      socket.on('chat:online', async (data) => {
        try {
          const { userIds } = data;
          
          if (!currentUserId) return;
          
          const onlineStatus = {};
          userIds.forEach(userId => {
            const uid = userId ? userId.toString().trim() : userId;
            const status = this.userStatus.get(uid);
            onlineStatus[uid] = status ? status.online : false;
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
            
            // Notify sender that messages were read
            const senderSocketId = this.userSockets.get(otherUserId);
            if (senderSocketId) {
              this.io.to(senderSocketId).emit('chat:read-receipt', {
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

      // ========== VOICE ROOM HANDLERS ==========
      
      // Join a voice room
      socket.on('join-voice-room', async (data) => {
        try {
          const { roomId, userId, userName } = data;
          
          if (!userId) {
            socket.emit('error', { message: 'Authentication required' });
            return;
          }

          // Check if room exists
          const room = await VoiceRoom.findById(roomId);
          if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
          }

          // Check room status
          if (room.status !== 'live') {
            if (room.status === 'scheduled' && room.scheduledFor && room.scheduledFor <= new Date()) {
              room.status = 'live';
              await room.save();
            } else {
              socket.emit('error', { message: 'Room is not live' });
              return;
            }
          }

          // Add to Socket.IO room
          socket.join(`room-${roomId}`);
          
          // Track in memory
          if (!this.activeRooms.has(roomId)) {
            this.activeRooms.set(roomId, new Set());
          }
          this.activeRooms.get(roomId).add(socket.id);
          
          if (!this.roomParticipants.has(roomId)) {
            this.roomParticipants.set(roomId, new Map());
          }
          this.roomParticipants.get(roomId).set(userId, socket.id);

          // Add/update participant in database
          let participant = await RoomParticipant.findOne({ 
            roomId, 
            userId,
            leftAt: null 
          });

          if (!participant) {
            participant = new RoomParticipant({
              roomId,
              userId,
              userName,
              socketId: socket.id,
              joinedAt: new Date()
            });
          } else {
            participant.socketId = socket.id;
            participant.leftAt = null;
          }
          await participant.save();

          // Update room participant count
          const participantCount = await RoomParticipant.countDocuments({ 
            roomId, 
            leftAt: null 
          });
          await VoiceRoom.findByIdAndUpdate(roomId, { 
            participantCount 
          });

          // Get all participants in room
          const participants = await RoomParticipant.find({ 
            roomId, 
            leftAt: null 
          }).select('userId userName isMuted handRaised isSpeaking');

          // Notify existing participants
          socket.to(`room-${roomId}`).emit('user-joined', {
            userId,
            userName,
            timestamp: new Date()
          });

          // Send current participants to new user
          socket.emit('room-joined', {
            roomId,
            roomName: room.name,
            hostId: room.hostId.toString(),
            participants: participants.map(p => ({
              userId: p.userId.toString(),
              name: p.userName,
              isMuted: p.isMuted,
              handRaised: p.handRaised,
              isSpeaking: p.isSpeaking
            }))
          });

          console.log(`👤 User ${userName} joined room ${room.name}`);
          
        } catch (error) {
          console.error('Error joining room:', error);
          socket.emit('error', { message: 'Failed to join room' });
        }
      });

      // WebRTC signaling
      socket.on('signal', async (data) => {
        const { to, signal, roomId } = data;
        
        try {
          const targetSocketId = this.roomParticipants.get(roomId)?.get(to);
          
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('signal', {
              from: currentUserId,
              signal,
              fromSocketId: socket.id
            });
          }
        } catch (error) {
          console.error('Error forwarding signal:', error);
        }
      });

      // Mute toggle
      socket.on('toggle-mute', async (data) => {
        try {
          const { roomId, userId, isMuted } = data;
          
          await RoomParticipant.findOneAndUpdate(
            { roomId, userId, leftAt: null },
            { isMuted }
          );

          this.io.to(`room-${roomId}`).emit('user-muted', {
            userId,
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
          const { roomId, userId, raised } = data;
          
          await RoomParticipant.findOneAndUpdate(
            { roomId, userId, leftAt: null },
            { handRaised: raised }
          );

          this.io.to(`room-${roomId}`).emit('hand-raised', {
            userId,
            raised,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error raising hand:', error);
        }
      });

      // Speaking status
      socket.on('speaking', async (data) => {
        const { roomId, userId, isSpeaking } = data;
        
        try {
          await RoomParticipant.findOneAndUpdate(
            { roomId, userId, leftAt: null },
            { isSpeaking }
          );
          
          socket.to(`room-${roomId}`).emit('user-speaking', {
            userId,
            isSpeaking,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error updating speaking status:', error);
        }
      });

      // Chat message in room
      socket.on('room-message', (data) => {
        const { roomId, message, userName, userId } = data;
        
        this.io.to(`room-${roomId}`).emit('new-message', {
          userId,
          userName,
          message,
          timestamp: new Date().toISOString()
        });
      });

      // Get unread notification count for admin
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

      // Leave voice room
      socket.on('leave-voice-room', async (data) => {
        await this.handleLeaveRoom(socket, data);
      });

      // Disconnect
      socket.on('disconnect', async () => {
        console.log('❌ Client disconnected:', socket.id);
        
        // Update user status
        if (currentUserId) {
          this.userStatus.set(currentUserId, { online: false, lastSeen: new Date() });
          this.userSockets.delete(currentUserId);
        }
        
        // Remove from admin tracking
        if (this.adminSockets.has(socket.id)) {
          this.adminSockets.delete(socket.id);
          console.log(`👑 Admin disconnected, ${this.adminSockets.size} admins remain`);
        }
        
        // Find and remove from all rooms
        for (const [roomId, sockets] of this.activeRooms.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            
            // Find user for this socket
            const participant = await RoomParticipant.findOneAndUpdate(
              { socketId: socket.id, leftAt: null },
              { leftAt: new Date() }
            );

            if (participant) {
              // Remove from room participants map
              const roomParticipantsMap = this.roomParticipants.get(roomId);
              if (roomParticipantsMap) {
                roomParticipantsMap.delete(participant.userId.toString());
              }
              
              // Update room count
              const count = await RoomParticipant.countDocuments({ 
                roomId, 
                leftAt: null 
              });
              await VoiceRoom.findByIdAndUpdate(roomId, { 
                participantCount: count 
              });

              // Notify others
              this.io.to(`room-${roomId}`).emit('user-left', {
                userId: participant.userId.toString(),
                timestamp: new Date()
              });

              // If room empty, end it
              if (count === 0) {
                await VoiceRoom.findByIdAndUpdate(roomId, { 
                  status: 'ended',
                  endedAt: new Date()
                });
                this.io.to(`room-${roomId}`).emit('room-ended', {
                  message: 'Room ended (no participants)',
                  endedAt: new Date()
                });
                
                // Clean up
                this.activeRooms.delete(roomId);
                this.roomParticipants.delete(roomId);
              }
            }
          }
        }
      });
    });
  }

  async handleLeaveRoom(socket, data) {
    try {
      const { roomId, userId } = data;
      
      socket.leave(`room-${roomId}`);
      
      if (this.activeRooms.has(roomId)) {
        this.activeRooms.get(roomId).delete(socket.id);
      }
      
      const roomParticipantsMap = this.roomParticipants.get(roomId);
      if (roomParticipantsMap) {
        roomParticipantsMap.delete(userId);
      }

      const participant = await RoomParticipant.findOneAndUpdate(
        { roomId, userId, leftAt: null },
        { leftAt: new Date() }
      );

      if (participant) {
        const count = await RoomParticipant.countDocuments({ 
          roomId, 
          leftAt: null 
        });
        await VoiceRoom.findByIdAndUpdate(roomId, { 
          participantCount: count 
        });

        this.io.to(`room-${roomId}`).emit('user-left', {
          userId,
          timestamp: new Date()
        });
      }

      console.log(`👋 User left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  // Helper methods for admin
  getConnectedAdminCount() {
    return this.adminSockets.size;
  }

  getConnectedAdminIds() {
    return Array.from(this.adminSockets.values());
  }

  broadcastToAdmins(data) {
    let sentCount = 0;
    for (const [socketId] of this.adminSockets) {
      this.io.to(socketId).emit('admin-notification', data);
      sentCount++;
    }
    return sentCount;
  }
}

module.exports = SocketServer;