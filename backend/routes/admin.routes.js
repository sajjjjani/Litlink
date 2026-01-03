const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');

// ===== DASHBOARD STATS =====
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    // Total users
    const totalUsers = await User.countDocuments();
    
    // Active today (last 24 hours)
    const activeToday = await User.countDocuments({
      lastLogin: { 
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
      }
    });
    
    // New users today
    const newUsersToday = await User.countDocuments({
      createdAt: { 
        $gte: new Date().setHours(0, 0, 0, 0) 
      }
    });
    
    // New users this week
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { 
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
      }
    });
    
    // Banned users
    const bannedUsers = await User.countDocuments({ isBanned: true });
    
    // Suspended users
    const suspendedUsers = await User.countDocuments({ isSuspended: true });
    
    // Verified vs unverified
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });
    
    // Admin users
    const adminUsers = await User.countDocuments({ isAdmin: true });
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeToday,
        newUsersToday,
        newUsersThisWeek,
        bannedUsers,
        suspendedUsers,
        verifiedUsers,
        unverifiedUsers,
        adminUsers
      }
    });
    
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== USER MANAGEMENT =====

// Get all users with pagination
router.get('/users', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || '';
    const status = req.query.status || 'all';
    
    // Build query
    let query = {};
    
    // Search by name, email, or username
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by status
    if (status !== 'all') {
      switch(status) {
        case 'active':
          query.isBanned = false;
          query.isSuspended = false;
          break;
        case 'banned':
          query.isBanned = true;
          break;
        case 'suspended':
          query.isSuspended = true;
          break;
        case 'unverified':
          query.isVerified = false;
          break;
        case 'verified':
          query.isVerified = true;
          break;
        case 'admin':
          query.isAdmin = true;
          break;
      }
    }
    
    // Get users
    const users = await User.find(query)
      .select('-password -verificationCode -resetToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        limit
      }
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get single user details
router.get('/users/:userId', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Ban user
router.post('/users/:userId/ban', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow banning admins
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot ban admin users'
      });
    }
    
    user.isBanned = true;
    user.banReason = reason || 'Violation of terms of service';
    user.bannedAt = new Date();
    user.bannedBy = req.user._id;
    
    await user.save();
    
    res.json({
      success: true,
      message: `User ${user.email} has been banned`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedAt: user.bannedAt
      }
    });
    
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Unban user
router.post('/users/:userId/unban', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.isBanned = false;
    user.banReason = '';
    user.bannedAt = null;
    user.bannedBy = null;
    
    await user.save();
    
    res.json({
      success: true,
      message: `User ${user.email} has been unbanned`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned
      }
    });
    
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow deleting admins
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }
    
    await User.deleteOne({ _id: req.params.userId });
    
    res.json({
      success: true,
      message: `User ${user.email} has been deleted`
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== SYSTEM ENDPOINTS =====

// Get system info
router.get('/system/info', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    // Get database stats
    const dbStats = await User.db.db.stats();
    
    // Get recent signups (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSignups = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    
    res.json({
      success: true,
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        database: {
          name: dbStats.db,
          collections: dbStats.collections,
          objects: dbStats.objects,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize
        },
        recentSignups
      }
    });
    
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get admin user info
router.get('/me', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -verificationCode -resetToken');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get admin info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;