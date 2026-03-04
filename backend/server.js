// server.js - Complete updated version with fixed shutdown handling
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http'); // IMPORTANT: Added for Socket.IO
require('dotenv').config();

// Import models
const User = require('./models/User');
const FilterWord = require('./models/FilterWord');
const Report = require('./models/Report');
const DiscussionThread = require('./models/DiscussionThread');
const Conversation = require('./models/Conversation');
const Notification = require('./models/Notification');

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
    
    // Log database stats
    const userCount = await User.countDocuments();
    const threadCount = await DiscussionThread.countDocuments();
    const filterWordCount = await FilterWord.countDocuments();
    const reportCount = await Report.countDocuments();
    const conversationCount = await Conversation.countDocuments();
    
    console.log('📊 Database Statistics:');
    console.log(`   Users: ${userCount}`);
    console.log(`   Discussion Threads: ${threadCount}`);
    console.log(`   Filter Words: ${filterWordCount}`);
    console.log(`   Reports: ${reportCount}`);
    console.log(`   Conversations: ${conversationCount}`);
    
    // Check for admin user
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
app.use('/api', miscRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    databaseState: mongoose.STATES[mongoose.connection.readyState],
    websocket: global.io ? 'enabled' : 'disabled',
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// API Info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Litlink Backend API',
    version: '1.0.0',
    description: 'Literary Social Network API',
    endpoints: {
      auth: '/api/auth',
      books: '/api/books',
      users: '/api/users',
      dashboard: '/api/dashboard',
      chat: '/api/chat',
      admin: '/api/admin',
      notifications: '/api/notifications',
      discussions: '/api/discussions',
      health: '/health'
    },
    documentation: 'See README.md for detailed API documentation',
    status: 'running'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.url}`,
    availableEndpoints: [
      '/api/auth',
      '/api/books',
      '/api/users',
      '/api/dashboard',
      '/api/chat',
      '/api/admin',
      '/api/notifications',
      '/api/discussions',
      '/health'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate key error',
      field: Object.keys(err.keyPattern)[0]
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }
  
  // Default error
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

// Keep references for graceful shutdown
let socketServer = null;
let server = null;

const startServer = async () => {
  try {
    await connectDB();
    
    // IMPORTANT: Create HTTP server explicitly for Socket.IO
    server = http.createServer(app);
    
    // Initialize WebSocket server with the HTTP server
    socketServer = new SocketServer(server);
    global.io = socketServer; // Make accessible globally
    
    console.log('✅ WebSocket server initialized');
    
    // Start listening
    server.listen(PORT, () => {
      console.log('='.repeat(70));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(70));
      console.log(`🌐 HTTP Server: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket Server: ws://localhost:${PORT}/socket.io`);
      console.log(`🔌 API Base: http://localhost:${PORT}/api`);
      console.log('='.repeat(70));
      
      console.log('📌 MAIN ENDPOINTS:');
      console.log('   POST   /api/auth/signup - Register new user');
      console.log('   POST   /api/auth/login - Login user');
      console.log('   POST   /api/auth/verify-email - Verify email');
      console.log('   POST   /api/auth/forgot-password - Forgot password');
      console.log('   POST   /api/auth/reset-password - Reset password');
      console.log('   GET    /api/auth/me - Get current user');
      console.log('='.repeat(70));
      
      console.log('📌 DISCUSSION ENDPOINTS:');
      console.log('   GET    /api/discussions/threads - Get all threads (with filters)');
      console.log('   GET    /api/discussions/threads/:threadId - Get single thread');
      console.log('   POST   /api/discussions/threads - Create new thread');
      console.log('   PUT    /api/discussions/threads/:threadId - Update thread');
      console.log('   DELETE /api/discussions/threads/:threadId - Delete thread');
      console.log('   POST   /api/discussions/threads/:threadId/like - Like/unlike thread');
      console.log('   POST   /api/discussions/threads/:threadId/comments - Add comment');
      console.log('   POST   /api/discussions/threads/:threadId/comments/:commentId/like - Like comment');
      console.log('   DELETE /api/discussions/threads/:threadId/comments/:commentId - Delete comment');
      console.log('   GET    /api/discussions/stats/genres - Get genre statistics');
      console.log('   GET    /api/discussions/user/:userId/threads - Get user threads');
      console.log('='.repeat(70));
      
      console.log('📌 ADMIN ENDPOINTS:');
      console.log('   GET    /api/admin/dashboard/stats - Dashboard statistics');
      console.log('   GET    /api/admin/users - List all users');
      console.log('   GET    /api/admin/users/:userId - Get user details');
      console.log('   POST   /api/admin/users/:userId/ban - Ban user');
      console.log('   POST   /api/admin/users/:userId/unban - Unban user');
      console.log('   POST   /api/admin/users/:userId/suspend - Suspend user');
      console.log('   POST   /api/admin/users/:userId/warn - Warn user');
      console.log('   GET    /api/admin/filter-words - List filter words');
      console.log('   POST   /api/admin/filter-words - Add filter word');
      console.log('   GET    /api/admin/reports - List reports');
      console.log('   GET    /api/admin/system/info - System information');
      console.log('   GET    /api/admin/me - Get admin info');
      console.log('   POST   /api/admin/test-socket - Test WebSocket');
      console.log('='.repeat(70));
      
      console.log('📌 OTHER ENDPOINTS:');
      console.log('   GET    /api/books/search - Search books');
      console.log('   GET    /api/books/popular/:genre - Popular books by genre');
      console.log('   GET    /api/books/details/:bookId - Book details');
      console.log('   GET    /api/dashboard/:userId - User dashboard');
      console.log('   GET    /api/notifications - User notifications');
      console.log('   GET    /health - Health check');
      console.log('   GET    / - API information');
      console.log('='.repeat(70));
      
      console.log('💡 Tip: Make sure you have an admin user created');
      console.log('   Use: node seed-admin.js to create admin account');
      console.log('='.repeat(70));
      console.log(`🕐 Server started at: ${new Date().toLocaleString()}`);
      console.log('='.repeat(70));
    });
    
    // Handle graceful shutdown
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

// Graceful shutdown function - FIXED VERSION
function gracefulShutdown() {
  console.log('\n🔄 Shutting down gracefully...');
  
  // Set a timeout to force shutdown if cleanup takes too long
  const forceShutdownTimeout = setTimeout(() => {
    console.error('❌ Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, 10000);
  
  // Track completed operations
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
  
  // Close WebSocket server
  if (socketServer && socketServer.io) {
    console.log('Closing WebSocket server...');
    socketServer.io.close(() => {
      console.log('✅ WebSocket server closed');
      webSocketClosed = true;
      checkAllClosed();
    });
  } else {
    webSocketClosed = true;
    checkAllClosed();
  }
  
  // Close HTTP server
  if (server) {
    console.log('Closing HTTP server...');
    server.close(() => {
      console.log('✅ HTTP server closed');
      httpServerClosed = true;
      checkAllClosed();
    });
    
    // Also close all keep-alive connections
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
  } else {
    httpServerClosed = true;
    checkAllClosed();
  }
  
  // Close MongoDB connection
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

// Start the server
startServer();

module.exports = app;