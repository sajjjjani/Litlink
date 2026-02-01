// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const FilterWord = require('../models/FilterWord');
const Report = require('../models/Report');
const { requireAdmin, requirePermission } = require('../middleware/adminAuth');
const AdminNotificationService = require('../services/adminNotificationService');

// ===== DASHBOARD STATS =====
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all stats in parallel
    const [
      totalUsers,
      activeToday,
      newUsersToday,
      newUsersThisWeek,
      bannedUsers,
      suspendedUsers,
      verifiedUsers,
      unverifiedUsers,
      adminUsers,
      newReportsCount,
      pendingReportsCount,
      resolvedReportsCount,
      activeMatches,
      liveVoiceRooms,
      filteredWordsCount
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLogin: { $gte: dayAgo } }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ isSuspended: true }),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isVerified: false }),
      User.countDocuments({ isAdmin: true }),
      Report.countDocuments({ 
        status: 'pending',
        createdAt: { $gte: dayAgo }
      }),
      Report.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'resolved' }),
      // Placeholders for now - implement with actual models later
      Promise.resolve(156), // activeMatches
      Promise.resolve(24), // liveVoiceRooms
      FilterWord.countDocuments({ isActive: true })
    ]);

    // Get recent activity (users who changed profile in last 24h)
    const recentActivity = await User.find({
      updatedAt: { $gte: dayAgo },
      $or: [
        { isBanned: true },
        { isSuspended: true },
        { isVerified: { $exists: true } }
      ]
    })
    .select('name email profilePicture updatedAt isBanned isSuspended')
    .limit(10)
    .sort({ updatedAt: -1 });

    // Get recent reports for dashboard
    const recentReports = await Report.find({ status: 'pending' })
      .populate('reporter', 'name email')
      .populate('reportedUser', 'name email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('reason category description status createdAt reportedItemType');

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
        adminUsers,
        activeUsers: activeToday,
        activeMatches,
        liveRooms: liveVoiceRooms,
        newReports: newReportsCount,
        pendingReports: pendingReportsCount,
        resolvedReports: resolvedReportsCount,
        joinedToday: newUsersToday,
        joinedWeek: newUsersThisWeek,
        bannedUsers,
        filteredWordsCount
      },
      recentActivity,
      recentReports
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

// Get all users with pagination and advanced filtering
router.get('/users', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || '';
    const status = req.query.status || 'all';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
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
        case 'inactive':
          query.lastLogin = { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
          break;
      }
    }
    
    // Get users
    const users = await User.find(query)
      .select('-password -verificationCode -resetToken')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    
    // Get total count
    const total = await User.countDocuments(query);
    
    // Get additional stats for the filtered set
    const stats = {
      total,
      active: await User.countDocuments({ ...query, isBanned: false, isSuspended: false }),
      banned: await User.countDocuments({ ...query, isBanned: true }),
      suspended: await User.countDocuments({ ...query, isSuspended: true }),
      verified: await User.countDocuments({ ...query, isVerified: true }),
      admin: await User.countDocuments({ ...query, isAdmin: true })
    };
    
    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        limit
      },
      stats
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get single user details with full information
router.get('/users/:userId', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -verificationCode -resetToken')
      .populate('bannedBy', 'name email');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get user's recent activity (created reports, etc.)
    const recentReports = await Report.find({
      $or: [
        { reporter: user._id },
        { reportedUser: user._id }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('reporter', 'name email')
    .populate('reportedUser', 'name email');
    
    // Get user's login history (last 10 logins)
    // Note: You might want to create a separate LoginHistory model
    const loginHistory = [];
    
    res.json({
      success: true,
      user,
      recentReports,
      loginHistory,
      summary: {
        totalReportsMade: await Report.countDocuments({ reporter: user._id }),
        totalReportsAgainst: await Report.countDocuments({ reportedUser: user._id }),
        followersCount: user.followers?.length || 0,
        followingCount: user.following?.length || 0,
        booksReadCount: user.booksRead?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get user's profile changes history
router.get('/users/:userId/profile-changes', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    // Note: For production, you should implement a proper change history system
    // This is a simplified version
    const user = await User.findById(req.params.userId)
      .select('name email username bio location pronouns favoriteGenres profilePicture updatedAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get user's reports related to profile changes
    const profileReports = await Report.find({
      reportedItemType: 'profile',
      reportedItemId: user._id
    })
    .sort({ createdAt: -1 })
    .populate('reporter', 'name email')
    .select('reason category description status createdAt');
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        bio: user.bio,
        location: user.location,
        pronouns: user.pronouns,
        favoriteGenres: user.favoriteGenres,
        profilePicture: user.profilePicture,
        lastUpdated: user.updatedAt
      },
      profileReports,
      changeCount: profileReports.length
    });
    
  } catch (error) {
    console.error('Get profile changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update user information
router.put('/users/:userId', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.password;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.__v;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -verificationCode -resetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user
    });
    
  } catch (error) {
    console.error('Update user error:', error);
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
    const { reason, duration } = req.body;
    
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
    
    // Set suspension end if duration is provided (in days)
    if (duration) {
      user.isSuspended = true;
      user.suspensionEnds = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    }
    
    await user.save();
    
    // Send admin notification
    await AdminNotificationService.notifyUserBanned(user, req.user, reason);
    
    // Create a report for this action
    const report = new Report({
      reporter: req.user._id,
      reportedUser: user._id,
      reportedItemType: 'user',
      reportedItemId: user._id,
      reason: `Admin action: ${reason || 'User banned'}`,
      category: 'other',
      description: `User banned by admin ${req.user.name}. Reason: ${reason || 'Not specified'}`,
      status: 'resolved',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      priority: 'high'
    });
    await report.save();
    
    res.json({
      success: true,
      message: `User ${user.email} has been banned`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        suspensionEnds: user.suspensionEnds
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

// ===== TEST WEBSOCKET NOTIFICATION =====
router.post('/test-socket', requireAdmin, async (req, res) => {
  try {
    const { message, type, title } = req.body;
    
    // Send test notification via WebSocket
    const io = global.io;
    if (io) {
      const notificationData = {
        type: 'admin-notification',
        notificationType: type || 'admin_test',
        title: title || 'Test Notification',
        message: message || 'This is a test notification from the server',
        timestamp: new Date(),
        priority: 'medium',
        metadata: { 
          test: true,
          sentBy: req.user.name,
          sentAt: new Date()
        }
      };
      
      const sentCount = io.broadcastToAdmins(notificationData);
      
      return res.json({
        success: true,
        message: `✅ Test notification sent to ${sentCount} connected admins`,
        data: notificationData,
        connectedAdmins: sentCount
      });
    } else {
      return res.status(500).json({
        success: false,
        message: '❌ WebSocket server not available'
      });
    }
  } catch (error) {
    console.error('Test socket error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== GET WEBSOCKET STATUS =====
router.get('/websocket-status', requireAdmin, async (req, res) => {
  try {
    const io = global.io;
    if (io) {
      return res.json({
        success: true,
        websocket: {
          enabled: true,
          connectedAdmins: io.getConnectedAdminCount(),
          connectedAdminIds: io.getConnectedAdminIds(),
          status: 'active'
        }
      });
    } else {
      return res.json({
        success: true,
        websocket: {
          enabled: false,
          connectedAdmins: 0,
          connectedAdminIds: [],
          status: 'inactive'
        }
      });
    }
  } catch (error) {
    console.error('WebSocket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Suspend user temporarily
router.post('/users/:userId/suspend', requireAdmin, requirePermission('manage_users'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, durationDays } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow suspending admins
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot suspend admin users'
      });
    }
    
    const duration = parseInt(durationDays) || 7; // Default 7 days
    
    user.isSuspended = true;
    user.suspensionEnds = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    
    await user.save();
    
    // Send admin notification
    await AdminNotificationService.notifyUserSuspended(user, req.user, reason, duration);
    
    // Create a report for this action
    const report = new Report({
      reporter: req.user._id,
      reportedUser: user._id,
      reportedItemType: 'user',
      reportedItemId: user._id,
      reason: `Admin action: Suspended for ${duration} days`,
      category: 'other',
      description: `User suspended by admin ${req.user.name}. Reason: ${reason || 'Not specified'}. Duration: ${duration} days`,
      status: 'resolved',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      priority: 'medium'
    });
    await report.save();
    
    res.json({
      success: true,
      message: `User ${user.email} has been suspended for ${duration} days`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isSuspended: user.isSuspended,
        suspensionEnds: user.suspensionEnds
      }
    });
    
  } catch (error) {
    console.error('Suspend user error:', error);
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
    user.isSuspended = false;
    user.banReason = '';
    user.bannedAt = null;
    user.bannedBy = null;
    user.suspensionEnds = null;
    
    await user.save();
    
    res.json({
      success: true,
      message: `User ${user.email} has been unbanned`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned,
        isSuspended: user.isSuspended
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

// Warn user (without suspension or ban)
router.post('/users/:userId/warn', requireAdmin, requirePermission('manage_users'), async (req, res) => {
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
    
    // Send admin notification
    await AdminNotificationService.sendToAllAdmins(
      'admin_warning_issued',
      'User Warning Issued',
      `${user.name} warned: ${reason}`,
      {
        priority: 'medium',
        sourceUserId: req.user._id,
        relatedEntityId: user._id,
        relatedEntityType: 'User',
        actionUrl: `/admin/users/${user._id}`,
        metadata: {
          userId: user._id.toString(),
          userName: user.name,
          userEmail: user.email,
          warningReason: reason,
          warnedById: req.user._id.toString(),
          warnedByName: req.user.name,
          warnedAt: new Date()
        }
      }
    );
    
    // Create a report as a warning
    const report = new Report({
      reporter: req.user._id,
      reportedUser: user._id,
      reportedItemType: 'user',
      reportedItemId: user._id,
      reason: `Admin warning: ${reason}`,
      category: 'other',
      description: `User warned by admin ${req.user.name}. Reason: ${reason || 'Not specified'}`,
      status: 'resolved',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      priority: 'low'
    });
    await report.save();
    
    res.json({
      success: true,
      message: `Warning sent to ${user.email}`,
      warning: {
        id: report._id,
        reason: report.reason,
        issuedAt: report.createdAt,
        issuedBy: req.user.name
      }
    });
    
  } catch (error) {
    console.error('Warn user error:', error);
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
    
    // Instead of hard delete, mark as deleted and anonymize
    user.name = '[Deleted User]';
    user.email = `deleted_${Date.now()}@deleted.com`;
    user.username = null;
    user.bio = '';
    user.profilePicture = '🗑️';
    user.isBanned = true;
    user.banReason = 'Account deleted by admin';
    user.bannedAt = new Date();
    user.bannedBy = req.user._id;
    
    await user.save();
    
    // Send admin notification
    await AdminNotificationService.sendToAllAdmins(
      'admin_user_banned',
      'User Account Deleted',
      `${user.email} account has been deleted`,
      {
        priority: 'high',
        sourceUserId: req.user._id,
        relatedEntityId: user._id,
        relatedEntityType: 'User',
        actionUrl: '/admin/users',
        metadata: {
          userId: user._id.toString(),
          userEmail: user.email,
          deletedById: req.user._id.toString(),
          deletedByName: req.user.name,
          deletedAt: new Date()
        }
      }
    );
    
    res.json({
      success: true,
      message: `User account has been deleted and anonymized`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== FILTER WORDS MANAGEMENT =====

// Get all filter words
router.get('/filter-words', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const activeOnly = req.query.active !== 'false';
    
    let query = {};
    
    if (search) {
      query.word = { $regex: search, $options: 'i' };
    }
    
    if (category !== 'all') {
      query.category = category;
    }
    
    if (activeOnly) {
      query.isActive = true;
    }
    
    const filterWords = await FilterWord.find(query)
      .populate('createdBy', 'name email')
      .sort({ word: 1 })
      .skip(skip)
      .limit(limit);
    
    const total = await FilterWord.countDocuments(query);
    
    // Get stats
    const stats = {
      total,
      active: await FilterWord.countDocuments({ isActive: true }),
      byCategory: {
        profanity: await FilterWord.countDocuments({ category: 'profanity', isActive: true }),
        hate_speech: await FilterWord.countDocuments({ category: 'hate_speech', isActive: true }),
        harassment: await FilterWord.countDocuments({ category: 'harassment', isActive: true }),
        spam: await FilterWord.countDocuments({ category: 'spam', isActive: true }),
        sexual: await FilterWord.countDocuments({ category: 'sexual', isActive: true }),
        violent: await FilterWord.countDocuments({ category: 'violent', isActive: true }),
        other: await FilterWord.countDocuments({ category: 'other', isActive: true })
      }
    };
    
    res.json({
      success: true,
      filterWords,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalWords: total,
        limit
      },
      stats
    });
    
  } catch (error) {
    console.error('Get filter words error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add new filter word
router.post('/filter-words', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const { word, category, severity, action, notes } = req.body;
    
    if (!word) {
      return res.status(400).json({
        success: false,
        message: 'Word is required'
      });
    }
    
    // Check if word already exists
    const existingWord = await FilterWord.findOne({ 
      word: word.toLowerCase() 
    });
    
    if (existingWord) {
      return res.status(400).json({
        success: false,
        message: 'Filter word already exists'
      });
    }
    
    const filterWord = new FilterWord({
      word: word.toLowerCase(),
      category: category || 'profanity',
      severity: severity || 'medium',
      action: action || 'flag',
      notes: notes || '',
      createdBy: req.user._id,
      isActive: true
    });
    
    await filterWord.save();
    
    // Send admin notification
    await AdminNotificationService.sendToAllAdmins(
      'admin_filter_word_added',
      'Filter Word Added',
      `New filter word added: ${word}`,
      {
        priority: 'low',
        sourceUserId: req.user._id,
        relatedEntityId: filterWord._id,
        relatedEntityType: 'FilterWord',
        actionUrl: '/admin/filter-words',
        metadata: {
          word: word,
          category: category,
          severity: severity,
          addedById: req.user._id.toString(),
          addedByName: req.user.name
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Filter word added successfully',
      filterWord: await filterWord.populate('createdBy', 'name email')
    });
    
  } catch (error) {
    console.error('Add filter word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update filter word
router.put('/filter-words/:id', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Don't allow changing the word itself (create new instead)
    if (updates.word) {
      delete updates.word;
    }
    
    const filterWord = await FilterWord.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');
    
    if (!filterWord) {
      return res.status(404).json({
        success: false,
        message: 'Filter word not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Filter word updated successfully',
      filterWord
    });
    
  } catch (error) {
    console.error('Update filter word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Delete filter word
router.delete('/filter-words/:id', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const filterWord = await FilterWord.findById(req.params.id);
    
    if (!filterWord) {
      return res.status(404).json({
        success: false,
        message: 'Filter word not found'
      });
    }
    
    await FilterWord.deleteOne({ _id: req.params.id });
    
    res.json({
      success: true,
      message: 'Filter word deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete filter word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Toggle filter word active status
router.post('/filter-words/:id/toggle', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const filterWord = await FilterWord.findById(req.params.id);
    
    if (!filterWord) {
      return res.status(404).json({
        success: false,
        message: 'Filter word not found'
      });
    }
    
    filterWord.isActive = !filterWord.isActive;
    await filterWord.save();
    
    res.json({
      success: true,
      message: `Filter word ${filterWord.isActive ? 'activated' : 'deactivated'}`,
      filterWord
    });
    
  } catch (error) {
    console.error('Toggle filter word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Import multiple filter words
router.post('/filter-words/import', requireAdmin, requirePermission('system_settings'), async (req, res) => {
  try {
    const { words, category, severity, action } = req.body;
    
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Words array is required'
      });
    }
    
    const results = {
      added: 0,
      skipped: 0,
      errors: 0,
      details: []
    };
    
    for (const word of words) {
      try {
        const trimmedWord = word.trim().toLowerCase();
        
        if (!trimmedWord) continue;
        
        // Check if word already exists
        const existingWord = await FilterWord.findOne({ word: trimmedWord });
        
        if (existingWord) {
          results.skipped++;
          results.details.push({
            word: trimmedWord,
            status: 'skipped',
            reason: 'Already exists'
          });
          continue;
        }
        
        const filterWord = new FilterWord({
          word: trimmedWord,
          category: category || 'profanity',
          severity: severity || 'medium',
          action: action || 'flag',
          createdBy: req.user._id,
          isActive: true
        });
        
        await filterWord.save();
        results.added++;
        results.details.push({
          word: trimmedWord,
          status: 'added',
          id: filterWord._id
        });
        
      } catch (wordError) {
        results.errors++;
        results.details.push({
          word: word,
          status: 'error',
          error: wordError.message
        });
      }
    }
    
    // Send admin notification for bulk import
    if (results.added > 0) {
      await AdminNotificationService.sendToAllAdmins(
        'admin_filter_word_added',
        'Filter Words Imported',
        `${results.added} filter words imported`,
        {
          priority: 'low',
          sourceUserId: req.user._id,
          actionUrl: '/admin/filter-words',
          metadata: {
            addedCount: results.added,
            skippedCount: results.skipped,
            errorCount: results.errors,
            importedBy: req.user.name
          }
        }
      );
    }
    
    res.json({
      success: true,
      message: `Imported ${results.added} words, skipped ${results.skipped}, errors: ${results.errors}`,
      results
    });
    
  } catch (error) {
    console.error('Import filter words error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== REPORTS MANAGEMENT =====

// Get all reports
router.get('/reports', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const status = req.query.status || 'all';
    const category = req.query.category || 'all';
    const priority = req.query.priority || 'all';
    const itemType = req.query.itemType || 'all';
    
    let query = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (category !== 'all') {
      query.category = category;
    }
    
    if (priority !== 'all') {
      query.priority = priority;
    }
    
    if (itemType !== 'all') {
      query.reportedItemType = itemType;
    }
    
    const reports = await Report.find(query)
      .populate('reporter', 'name email profilePicture')
      .populate('reportedUser', 'name email profilePicture')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Report.countDocuments(query);
    
    // Get report stats
    const stats = {
      total,
      pending: await Report.countDocuments({ status: 'pending' }),
      reviewing: await Report.countDocuments({ status: 'reviewing' }),
      resolved: await Report.countDocuments({ status: 'resolved' }),
      dismissed: await Report.countDocuments({ status: 'dismissed' }),
      byCategory: {
        inappropriate_content: await Report.countDocuments({ category: 'inappropriate_content' }),
        harassment: await Report.countDocuments({ category: 'harassment' }),
        hate_speech: await Report.countDocuments({ category: 'hate_speech' }),
        spam: await Report.countDocuments({ category: 'spam' }),
        fake_account: await Report.countDocuments({ category: 'fake_account' }),
        impersonation: await Report.countDocuments({ category: 'impersonation' }),
        privacy_violation: await Report.countDocuments({ category: 'privacy_violation' }),
        copyright: await Report.countDocuments({ category: 'copyright' }),
        other: await Report.countDocuments({ category: 'other' })
      }
    };
    
    res.json({
      success: true,
      reports,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalReports: total,
        limit
      },
      stats
    });
    
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get single report details
router.get('/reports/:reportId', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId)
      .populate('reporter', 'name email profilePicture')
      .populate('reportedUser', 'name email profilePicture')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name email')
      .populate('bannedBy', 'name email');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    res.json({
      success: true,
      report
    });
    
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update report status
router.put('/reports/:reportId', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, resolution, resolutionNotes, assignedTo, priority } = req.body;
    
    const updates = {};
    
    if (status) {
      updates.status = status;
      if (status === 'resolved' || status === 'dismissed') {
        updates.resolvedBy = req.user._id;
        updates.resolvedAt = new Date();
      } else if (status === 'reviewing') {
        updates.reviewedAt = new Date();
      }
    }
    
    if (resolution !== undefined) updates.resolution = resolution;
    if (resolutionNotes !== undefined) updates.resolutionNotes = resolutionNotes;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (priority !== undefined) updates.priority = priority;
    
    const report = await Report.findByIdAndUpdate(
      reportId,
      { $set: updates },
      { new: true, runValidators: true }
    )
    .populate('reporter', 'name email profilePicture')
    .populate('reportedUser', 'name email profilePicture')
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name email');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Send notification if report was resolved
    if (status === 'resolved') {
      await AdminNotificationService.notifyReportResolved(report, req.user);
    }
    
    res.json({
      success: true,
      message: 'Report updated successfully',
      report
    });
    
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Assign report to admin
router.post('/reports/:reportId/assign', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { assignTo } = req.body;
    
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    report.assignedTo = assignTo || req.user._id;
    report.status = 'reviewing';
    report.reviewedAt = new Date();
    
    await report.save();
    
    res.json({
      success: true,
      message: 'Report assigned successfully',
      report: await report.populate('assignedTo', 'name email')
    });
    
  } catch (error) {
    console.error('Assign report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Resolve report
router.post('/reports/:reportId/resolve', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { resolution, resolutionNotes } = req.body;
    
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    report.status = 'resolved';
    report.resolution = resolution || 'Resolved by admin';
    report.resolutionNotes = resolutionNotes || '';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    
    await report.save();
    
    // Send admin notification
    await AdminNotificationService.notifyReportResolved(report, req.user);
    
    res.json({
      success: true,
      message: 'Report resolved successfully',
      report: await report.populate('resolvedBy', 'name email')
    });
    
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Dismiss report
router.post('/reports/:reportId/dismiss', requireAdmin, requirePermission('view_reports'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { reason } = req.body;
    
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    report.status = 'dismissed';
    report.resolution = reason || 'Dismissed as invalid';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    
    await report.save();
    
    // Send admin notification
    await AdminNotificationService.sendToAllAdmins(
      'admin_report_resolved',
      'Report Dismissed',
      `${report.category} report dismissed by ${req.user.name}`,
      {
        priority: 'low',
        sourceUserId: req.user._id,
        relatedEntityId: report._id,
        relatedEntityType: 'Report',
        actionUrl: `/admin/reports/${report._id}`,
        metadata: {
          reportId: report._id.toString(),
          reportReason: report.reason,
          dismissedById: req.user._id.toString(),
          dismissedByName: req.user.name,
          dismissedAt: new Date(),
          dismissalReason: reason
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Report dismissed successfully',
      report: await report.populate('resolvedBy', 'name email')
    });
    
  } catch (error) {
    console.error('Dismiss report error:', error);
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
    
    // Get filter word stats
    const filterWordStats = await FilterWord.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } }
        }
      }
    ]);
    
    // Get report stats
    const reportStats = await Report.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get user activity stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const userActivity = {
      loggedInToday: await User.countDocuments({ lastLogin: { $gte: todayStart } }),
      newToday: await User.countDocuments({ createdAt: { $gte: todayStart } }),
      banned: await User.countDocuments({ isBanned: true }),
      suspended: await User.countDocuments({ isSuspended: true })
    };
    
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
        recentSignups,
        filterWords: filterWordStats.reduce((acc, stat) => {
          acc[stat._id] = { total: stat.count, active: stat.active };
          return acc;
        }, {}),
        reports: reportStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        userActivity
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

// Update admin profile (used by Admin Profile page)
// PUT /api/admin/me
router.put('/me', requireAdmin, async (req, res) => {
  try {
    const { name, email, location } = req.body || {};

    // Only allow safe fields to be updated via this endpoint
    const updates = {};
    if (typeof name === 'string') updates.name = name.trim();
    if (typeof email === 'string') updates.email = email.trim().toLowerCase();
    if (typeof location === 'string') updates.location = location.trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided to update'
      });
    }

    // Persist changes
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -verificationCode -resetToken');

    res.json({
      success: true,
      message: 'Profile updated',
      user: updated
    });
  } catch (error) {
    // Handle duplicate email nicely
    if (error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'That email is already in use'
      });
    }

    console.error('Update admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Send test notification
router.post('/test-notification', requireAdmin, async (req, res) => {
  try {
    const { type, title, message } = req.body;
    
    const notification = await AdminNotificationService.sendToAdmin(
      req.user._id,
      type || 'admin_new_user',
      title || 'Test Notification',
      message || 'This is a test notification from the admin panel',
      {
        priority: 'medium',
        actionUrl: '/admin/dashboard',
        metadata: { test: true, timestamp: new Date() }
      }
    );
    
    res.json({
      success: true,
      message: 'Test notification sent',
      notification
    });
    
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;