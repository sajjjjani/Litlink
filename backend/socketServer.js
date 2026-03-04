const { Server } = require('socket.io');
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
          origin: '*',
          methods: ['GET', 'POST'],
          credentials: true
        },
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        allowEIO3: true,
        connectTimeout: 45000,
        pingTimeout: 30000,
        pingInterval: 25000
      });

      console.log('✅ Socket.IO server instance created');

      // Store active rooms and users
      this.activeRooms = new Map(); // roomId -> Set of socketIds
      this.userSockets = new Map(); // userId -> socketId

      // Handle connections
      this.io.on('connection', (socket) => {
        console.log('✅ Client connected:', socket.id);
        
        // Store userId when authenticated
        let currentUserId = null;

        // Authenticate user
        socket.on('authenticate', async (token) => {
          try {
            // Verify token (you'll need to implement this)
            const userId = await this.verifyToken(token);
            currentUserId = userId;
            this.userSockets.set(userId, socket.id);
            
            socket.emit('authenticated', { success: true });
            console.log(`🔐 User ${userId} authenticated`);
          } catch (error) {
            socket.emit('authenticated', { success: false, error: error.message });
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

            // Check if room exists and is live
            const room = await VoiceRoom.findById(roomId);
            if (!room || room.status !== 'live') {
              socket.emit('error', { message: 'Room not available' });
              return;
            }

            // Add to Socket.IO room
            socket.join(`room-${roomId}`);
            
            // Track in memory
            if (!this.activeRooms.has(roomId)) {
              this.activeRooms.set(roomId, new Set());
            }
            this.activeRooms.get(roomId).add(socket.id);

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
                socketId: socket.id
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
            }).select('userId userName isMuted handRaised');

            // Notify existing participants
            socket.to(`room-${roomId}`).emit('user-joined', {
              userId,
              userName,
              participants: participants.map(p => ({
                userId: p.userId,
                name: p.userName,
                isMuted: p.isMuted,
                handRaised: p.handRaised
              }))
            });

            // Send current participants to new user
            socket.emit('room-joined', {
              roomId,
              roomName: room.name,
              hostId: room.hostId,
              participants: participants.map(p => ({
                userId: p.userId,
                name: p.userName,
                isMuted: p.isMuted,
                handRaised: p.handRaised
              }))
            });

            console.log(`👤 User ${userName} joined room ${room.name}`);
          } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
          }
        });

        // WebRTC signaling
        socket.on('signal', (data) => {
          const { to, signal } = data;
          // Forward signal to specific user
          socket.to(to).emit('signal', {
            from: socket.id,
            signal
          });
        });

        // Mute toggle
        socket.on('toggle-mute', async (data) => {
          try {
            const { roomId, userId, isMuted } = data;
            
            await RoomParticipant.findOneAndUpdate(
              { roomId, userId, leftAt: null },
              { isMuted }
            );

            socket.to(`room-${roomId}`).emit('user-muted', {
              userId,
              isMuted
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

            socket.to(`room-${roomId}`).emit('hand-raised', {
              userId,
              raised
            });
          } catch (error) {
            console.error('Error raising hand:', error);
          }
        });

        // Speaking status
        socket.on('speaking', async (data) => {
          const { roomId, userId, isSpeaking } = data;
          socket.to(`room-${roomId}`).emit('user-speaking', {
            userId,
            isSpeaking
          });
        });

        // Chat message in room
        socket.on('room-message', (data) => {
          const { roomId, message, userName } = data;
          this.io.to(`room-${roomId}`).emit('new-message', {
            userName,
            message,
            timestamp: new Date()
          });
        });

        // Leave room
        socket.on('leave-voice-room', async (data) => {
          await this.handleLeaveRoom(socket, data);
        });

        // Disconnect
        socket.on('disconnect', async () => {
          console.log('❌ Client disconnected:', socket.id);
          
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
                  userId: participant.userId
                });

                // If room empty, end it
                if (count === 0) {
                  await VoiceRoom.findByIdAndUpdate(roomId, { 
                    status: 'ended',
                    endedAt: new Date()
                  });
                  this.io.to(`room-${roomId}`).emit('room-ended', {
                    message: 'Room ended (no participants)'
                  });
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

      console.log('✅ Socket.IO server is ready with voice room support');
      
    } catch (error) {
      console.error('❌ Failed to create Socket.IO server:', error);
      throw error;
    }
  }

  async handleLeaveRoom(socket, data) {
    try {
      const { roomId, userId } = data;
      
      socket.leave(`room-${roomId}`);
      
      if (this.activeRooms.has(roomId)) {
        this.activeRooms.get(roomId).delete(socket.id);
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

        socket.to(`room-${roomId}`).emit('user-left', {
          userId
        });
      }

      console.log(`👋 User left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  async verifyToken(token) {
    // Implement your JWT verification here
    // Return userId
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId;
  }
}

module.exports = SocketServer;