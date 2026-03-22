const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const VoiceRoom = require('./models/VoiceRoom');
const RoomParticipant = require('./models/RoomParticipant');
const User = require('./models/User');

class SocketServer {
  constructor(server) {
    console.log('🔌 Initializing Socket.IO server with Voice Room support...');
    
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
      
      // Admin tracking
      this.adminSockets = new Map(); // socketId -> userId

      this.setupEventHandlers();
      console.log('✅ Socket.IO server is ready with voice room support');
      
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
          
          this.userSockets.set(currentUserId, socket.id);
          
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
            // If room is scheduled and time has passed, start it
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

      // WebRTC signaling - using userId instead of socketId
      socket.on('signal', async (data) => {
        const { to, signal, roomId } = data;
        
        try {
          // Get target socket ID from room participants
          const targetSocketId = this.roomParticipants.get(roomId)?.get(to);
          
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('signal', {
              from: currentUserId,
              signal,
              fromSocketId: socket.id
            });
          } else {
            console.log(`Target user ${to} not found in room ${roomId}`);
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

      // Leave room
      socket.on('leave-voice-room', async (data) => {
        await this.handleLeaveRoom(socket, data);
      });

      // Disconnect
      socket.on('disconnect', async () => {
        console.log('❌ Client disconnected:', socket.id);
        
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

        // Remove from user mapping
        if (currentUserId) {
          this.userSockets.delete(currentUserId);
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