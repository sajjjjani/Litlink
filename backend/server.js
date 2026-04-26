const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
require('dotenv').config();

// Import models
const User = require('./models/User');
const FilterWord = require('./models/FilterWord');
const Report = require('./models/Report');
const DiscussionThread = require('./models/DiscussionThread');
const Conversation = require('./models/Conversation');
const Notification = require('./models/Notification');
const VoiceRoom = require('./models/VoiceRoom');
const RoomParticipant = require('./models/RoomParticipant');

// Import routes
const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/admin.routes');
const miscRoutes = require('./routes/miscRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const openLibraryRoutes = require('./routes/openLibraryRoutes');
const voiceRoomRoutes = require('./routes/voiceRoomRoutes');
const matchRoutes = require('./routes/matchRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const circleRequestRoutes = require('./routes/circleRequestRoutes');
const activityRoutes = require('./routes/activityRoutes');
const adminSettingsRoutes = require('./routes/adminSettings.routes');
// Import WebSocket server
const SocketServer = require('./socketServer');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5002',
    'http://127.0.0.1:5002',
    'http://localhost:5001',
    'http://127.0.0.1:5001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== DATABASE CONNECTION =====
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/litlink', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected Successfully');
    
    const userCount = await User.countDocuments();
    const threadCount = await DiscussionThread.countDocuments();
    const filterWordCount = await FilterWord.countDocuments();
    const reportCount = await Report.countDocuments();
    const conversationCount = await Conversation.countDocuments();
    const voiceRoomCount = await VoiceRoom.countDocuments();
    const activeVoiceRooms = await VoiceRoom.countDocuments({ status: 'live' });
    
    console.log('📊 Database Statistics:');
    console.log(`   Users: ${userCount}`);
    console.log(`   Discussion Threads: ${threadCount}`);
    console.log(`   Filter Words: ${filterWordCount}`);
    console.log(`   Reports: ${reportCount}`);
    console.log(`   Conversations: ${conversationCount}`);
    console.log(`   Voice Rooms: ${voiceRoomCount} (${activeVoiceRooms} live)`);
    
    const adminExists = await User.findOne({ email: 'admin@litlink.com' });
    if (!adminExists) {
      console.log('⚠️  Admin user not found. Run: node seed-admin.js');
    } else {
      console.log('✅ Admin user exists');
    }
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// ===== ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/openlibrary', openLibraryRoutes);
app.use('/api/voice-rooms', voiceRoomRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api', miscRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/circle-requests', circleRequestRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    databaseState: mongoose.STATES[mongoose.connection.readyState],
    websocket: global.io ? 'enabled' : 'disabled',
    matching: {
      enabled: true,
      version: '1.0.0'
    },
    voiceRooms: {
      total: global.activeRooms ? global.activeRooms.size : 0,
      active: global.activeRooms ? Array.from(global.activeRooms.keys()).length : 0
    },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// API Info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Litlink Backend API',
    version: '1.0.0',
    description: 'Literary Social Network API with AI-Powered Matching',
    endpoints: {
      auth: '/api/auth',
      books: '/api/books',
      users: '/api/users',
      dashboard: '/api/dashboard',
      chat: '/api/chat',
      admin: '/api/admin',
      notifications: '/api/notifications',
      discussions: '/api/discussions',
      voiceRooms: '/api/voice-rooms',
      matches: '/api/matches',
      health: '/health'
    },
    features: {
      matching: 'AI-powered user matching based on reading preferences',
      discussions: 'Community discussions and circles',
      voiceRooms: 'Live voice chat rooms',
      admin: 'Admin dashboard and moderation'
    },
    status: 'running'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.url}`,
    availableEndpoints: [
      '/api/auth', '/api/books', '/api/users', '/api/dashboard',
      '/api/chat', '/api/admin', '/api/notifications', '/api/discussions',
      '/api/voice-rooms', '/api/matches', '/health'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate key error',
      field: Object.keys(err.keyPattern)[0]
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

let socketServer = null;
let server = null;

const startServer = async () => {
  try {
    await connectDB();
    
    server = http.createServer(app);
    
    // Initialize WebSocket server
    socketServer = new SocketServer(server);

    // ─── Expose socket helpers globally ───────────────────────────────────────
    // global.io is the raw Socket.IO instance (for room broadcasts etc.)
    global.io = socketServer.io;

    // Bind the two notification helpers so any file can call them without
    // importing SocketServer directly.
    global.io.sendToUser = (userId, data) => socketServer.sendToUser(userId, data);
    global.io.broadcastToAdmins = (data) => socketServer.broadcastToAdmins(data);

    // Keep the full socketServer reference accessible for edge cases
    global.io._litlinkSocketServer = socketServer;
    global.activeRooms = socketServer.activeRooms;
    // ──────────────────────────────────────────────────────────────────────────

    console.log('✅ WebSocket server initialized with voice room, chat and notification support');
    
    server.listen(PORT, () => {
      console.log('='.repeat(70));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(70));
      console.log(`🌐 HTTP Server:    http://localhost:${PORT}`);
      console.log(`🔌 WebSocket:      ws://localhost:${PORT}/socket.io`);
      console.log(`🔌 API Base:       http://localhost:${PORT}/api`);
      console.log('='.repeat(70));

      console.log('📌 MAIN ENDPOINTS:');
      console.log('   POST   /api/auth/signup');
      console.log('   POST   /api/auth/login');
      console.log('   GET    /api/auth/me');
      console.log('='.repeat(70));

      console.log('📌 NOTIFICATION ENDPOINTS:');
      console.log('   GET    /api/notifications               - User notifications');
      console.log('   GET    /api/notifications/admin         - Admin notifications');
      console.log('   GET    /api/notifications/unread-count  - Unread badge count');
      console.log('   POST   /api/notifications/read/:id      - Mark one read');
      console.log('   POST   /api/notifications/read-all      - Mark all read');
      console.log('   POST   /api/notifications/create        - Create notification');
      console.log('   DELETE /api/notifications/:id           - Archive notification');
      console.log('='.repeat(70));

      console.log('📌 MATCHING ENDPOINTS:');
      console.log('   GET    /api/matches/matches');
      console.log('   GET    /api/matches/match-suggestions');
      console.log('   GET    /api/matches/global');
      console.log('   PUT    /api/matches/preferences');
      console.log('='.repeat(70));

      console.log('📌 CHAT ENDPOINTS:');
      console.log('   GET    /api/chat/matches');
      console.log('   GET    /api/chat/messages/:matchId');
      console.log('   POST   /api/chat/messages');
      console.log('='.repeat(70));

      console.log('📌 VOICE ROOM ENDPOINTS:');
      console.log('   GET    /api/voice-rooms/rooms/live');
      console.log('   GET    /api/voice-rooms/rooms/scheduled');
      console.log('   POST   /api/voice-rooms/rooms');
      console.log('='.repeat(70));

      console.log('📌 ADMIN ENDPOINTS:');
      console.log('   GET    /api/admin/dashboard/stats');
      console.log('   GET    /api/admin/users');
      console.log('   GET    /api/admin/reports');
      console.log('='.repeat(70));

      console.log(`🕐 Server started at: ${new Date().toLocaleString()}`);
      console.log('='.repeat(70));
    });
    
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown();
    });
    process.on('unhandledRejection', (error) => {
      console.error('❌ Unhandled Rejection:', error);
      gracefulShutdown();
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

function gracefulShutdown() {
  console.log('\n🔄 Shutting down gracefully...');
  
  const forceShutdownTimeout = setTimeout(() => {
    console.error('❌ Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, 10000);
  
  let webSocketClosed = false;
  let httpServerClosed = false;
  let mongoClosed = false;
  
  function checkAllClosed() {
    if (webSocketClosed && httpServerClosed && mongoClosed) {
      console.log('✅ All connections closed successfully');
      clearTimeout(forceShutdownTimeout);
      process.exit(0);
    }
  }
  
  if (socketServer && socketServer.io) {
    console.log('Closing WebSocket server...');
    
    if (global.activeRooms) {
      for (const [roomId] of global.activeRooms.entries()) {
        socketServer.io.to(`room-${roomId}`).emit('server-shutdown', {
          message: 'Server is shutting down. Rooms will be closed.'
        });
      }
    }
    
    socketServer.io.close(() => {
      console.log('✅ WebSocket server closed');
      webSocketClosed = true;
      checkAllClosed();
    });
  } else {
    webSocketClosed = true;
    checkAllClosed();
  }
  
  if (server) {
    console.log('Closing HTTP server...');
    server.close(() => {
      console.log('✅ HTTP server closed');
      httpServerClosed = true;
      checkAllClosed();
    });
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
  } else {
    httpServerClosed = true;
    checkAllClosed();
  }
  
  console.log('Closing MongoDB connection...');
  mongoose.connection.close()
    .then(() => {
      console.log('✅ MongoDB connection closed');
      mongoClosed = true;
      checkAllClosed();
    })
    .catch((err) => {
      console.error('❌ Error closing MongoDB connection:', err);
      mongoClosed = true;
      checkAllClosed();
    });
}

startServer();

module.exports = app;