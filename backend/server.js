const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/User');
const FilterWord = require('./models/FilterWord');
const Report = require('./models/Report');

// Import routes
const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/admin.routes');
const miscRoutes = require('./routes/miscRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

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
    'http://127.0.0.1:5002'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ===== DATABASE CONNECTION =====
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected Successfully');
    
    const userCount = await User.countDocuments();
    console.log(`📊 Total Users in Database: ${userCount}`);
    
    const filterWordCount = await FilterWord.countDocuments();
    console.log(`🔤 Filter Words in Database: ${filterWordCount}`);
    
    const reportCount = await Report.countDocuments();
    console.log(`📋 Reports in Database: ${reportCount}`);
    
    const adminExists = await User.findOne({ email: 'admin@litlink.com' });
    if (!adminExists) {
      console.log('⚠️ Admin user not found. Run: node seed-admin.js');
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
app.use('/api', miscRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: global.io ? 'enabled' : 'disabled'
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

// Keep reference to socket server
let socketServer = null;

const startServer = async () => {
  try {
    await connectDB();
    
    const server = app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(60));
      console.log(`🌐 Server URL: http://localhost:${PORT}`);
      console.log(`🔌 API Base: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket URL: ws://localhost:${PORT}`);
      console.log(`👑 ADMIN ENDPOINTS:`);
      console.log(`   GET    /api/admin/dashboard/stats ✨`);
      console.log(`   GET    /api/admin/users ✨`);
      console.log(`   GET    /api/admin/users/:userId ✨`);
      console.log(`   POST   /api/admin/users/:userId/ban ✨`);
      console.log(`   POST   /api/admin/users/:userId/unban ✨`);
      console.log(`   POST   /api/admin/users/:userId/suspend ✨`);
      console.log(`   POST   /api/admin/users/:userId/warn ✨`);
      console.log(`   GET    /api/admin/filter-words ✨`);
      console.log(`   POST   /api/admin/filter-words ✨`);
      console.log(`   GET    /api/admin/reports ✨`);
      console.log(`   GET    /api/admin/system/info ✨`);
      console.log(`   GET    /api/admin/me ✨`);
      console.log(`   POST   /api/admin/test-socket ✨ (NEW)`);
      console.log('='.repeat(60));
      console.log('📍 Available Endpoints:');
      console.log('   POST /api/auth/signup');
      console.log('   POST /api/auth/login');
      console.log('   POST /api/auth/verify-email');
      console.log('   GET  /api/books/search (Protected)');
      console.log('   GET  /api/books/popular/:genre (Public)');
      console.log('   GET  /api/books/details/:bookId (Protected)');
      console.log('   GET  /api/dashboard/:userId (Protected)');
      console.log('   GET  /api/notifications (Protected)');
      console.log('   GET  /api/health');
      console.log('='.repeat(60));
      console.log('💡 Tip: Make sure you have an admin user created');
      console.log('   Use: node seed-admin.js to create admin account');
      console.log('='.repeat(60));
    });
    
    // Initialize WebSocket server
    socketServer = new SocketServer(server);
    global.io = socketServer; // Make accessible globally
    
    console.log('✅ WebSocket server initialized');
    
    // Handle graceful shutdown
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
function gracefulShutdown() {
  console.log('\n🔄 Shutting down gracefully...');
  
  // Close WebSocket server
  if (socketServer) {
    console.log('Closing WebSocket server...');
    socketServer.wss.close(() => {
      console.log('✅ WebSocket server closed');
    });
  }
  
  // Close MongoDB connection
  console.log('Closing MongoDB connection...');
  mongoose.connection.close(false, () => {
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, 10000);
}

startServer();

module.exports = app;