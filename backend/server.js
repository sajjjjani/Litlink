const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/User');
const FilterWord = require('./models/FilterWord'); // NEW
const Report = require('./models/Report'); // NEW

// Import routes
const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/admin.routes');
const miscRoutes = require('./routes/miscRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

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
    
    const filterWordCount = await FilterWord.countDocuments(); // NEW
    console.log(`🔤 Filter Words in Database: ${filterWordCount}`); // NEW
    
    const reportCount = await Report.countDocuments(); // NEW
    console.log(`📋 Reports in Database: ${reportCount}`); // NEW
    
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

// ===== START SERVER =====
const PORT = process.env.PORT || 5002;

const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Litlink Backend Server Started!');
      console.log('='.repeat(60));
      console.log(`🌐 Server URL: http://localhost:${PORT}`);
      console.log(`🔌 API Base: http://localhost:${PORT}/api`);
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
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;