// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const Notification = require('../models/Notification');
const AdminNotificationService = require('../services/adminNotificationService');

// GET /api/notifications - Get user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const {
      limit = 20,
      offset = 0,
      read,
      type,
      priority,
      sort = '-createdAt'
    } = req.query;
    
    let query = { userId, archived: false };
    
    // Filter by read status
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    // Filter by type
    if (type) {
      if (type === 'admin') {
        // Filter for admin notifications only
        query.type = { $regex: '^admin_', $options: 'i' };
      } else if (type === 'user') {
        // Filter for user notifications only (non-admin)
        query.type = { $not: { $regex: '^admin_', $options: 'i' } };
      } else {
        query.type = type;
      }
    }
    
    // Filter by priority
    if (priority) {
      query.priority = priority;
    }
    
    // Get notifications
    const notifications = await Notification.find(query)
      .populate('userId', 'name email profilePicture')
      .populate('sourceUserId', 'name email profilePicture')
      .sort(sort)
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false,
      archived: false 
    });
    
    // Format response
    const formattedNotifications = notifications.map(notif => ({
      id: notif._id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      timestamp: notif.formattedTime,
      read: notif.read,
      icon: notif.icon,
      priority: notif.priority,
      actionUrl: notif.actionUrl,
      metadata: notif.metadata,
      createdAt: notif.createdAt,
      sourceUser: notif.sourceUserId
    }));
    
    res.json({ 
      success: true, 
      notifications: formattedNotifications,
      total,
      unreadCount
    });
    
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

// GET /api/notifications/admin - Get admin-specific notifications
router.get('/admin', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Check if user is admin
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const {
      limit = 20,
      offset = 0,
      read,
      priority
    } = req.query;
    
    let query = { 
      userId,
      archived: false,
      type: { $regex: '^admin_', $options: 'i' }
    };
    
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    if (priority) {
      query.priority = priority;
    }
    
    const notifications = await Notification.find(query)
      .populate('sourceUserId', 'name email profilePicture')
      .sort('-createdAt')
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false,
      archived: false,
      type: { $regex: '^admin_', $options: 'i' }
    });
    
    // Get urgent count
    const urgentCount = await Notification.countDocuments({
      userId,
      read: false,
      archived: false,
      type: { $regex: '^admin_', $options: 'i' },
      priority: 'urgent'
    });
    
    const formattedNotifications = notifications.map(notif => ({
      id: notif._id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      timestamp: notif.formattedTime,
      read: notif.read,
      icon: notif.icon,
      priority: notif.priority,
      actionUrl: notif.actionUrl,
      metadata: notif.metadata,
      createdAt: notif.createdAt,
      sourceUser: notif.sourceUserId
    }));
    
    res.json({
      success: true,
      notifications: formattedNotifications,
      total,
      unreadCount,
      urgentCount
    });
    
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching admin notifications' });
  }
});

// POST /api/notifications/read/:id - Mark single notification as read
router.post('/read/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: userId },
      { read: true, readAt: new Date() },
      { new: true }
    ).populate('sourceUserId', 'name email profilePicture');
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Get updated unread count
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false,
      archived: false 
    });
    
    res.json({
      success: true,
      message: 'Notification marked as read',
      notification,
      unreadCount
    });
    
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notification' });
  }
});

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.body; // Optional: 'all', 'admin', 'user'
    
    let query = { userId: userId, read: false };
    
    if (type === 'admin') {
      query.type = { $regex: '^admin_', $options: 'i' };
    } else if (type === 'user') {
      query.type = { $not: { $regex: '^admin_', $options: 'i' } };
    }
    
    await Notification.updateMany(
      query,
      { read: true, readAt: new Date() }
    );
    
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false,
      archived: false 
    });
    
    res.json({
      success: true,
      message: 'All notifications marked as read',
      unreadCount
    });
    
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notifications' });
  }
});

// POST /api/notifications/create - Create a new notification
router.post('/create', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type, title, message, actionUrl, priority, metadata } = req.body;
    
    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Check if creating admin notification requires admin access
    if (type.startsWith('admin_')) {
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user || !user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required for admin notifications'
        });
      }
    }
    
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      actionUrl: actionUrl || null,
      priority: priority || 'medium',
      metadata: metadata || {},
      read: false
    });
    
    await notification.save();
    
    const populatedNotification = await Notification.findById(notification._id)
      .populate('userId', 'name email profilePicture');

    // Emit real-time notification to the connected user
    // (Admin real-time notifications are handled separately via admin events / hooks.)
    try {
      const io = global.io;
      if (io && typeof io.sendToUser === 'function') {
        io.sendToUser(userId.toString(), {
          type: 'notification',
          notificationType: type,
          title,
          message,
          timestamp: new Date(),
          priority: priority || 'medium',
          actionUrl: actionUrl || null,
          metadata: metadata || {}
        });
      }
    } catch (socketError) {
      console.error('Error emitting user websocket notification:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Notification created',
      notification: populatedNotification
    });
    
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, message: 'Error creating notification' });
  }
});

// DELETE /api/notifications/:id - Delete/archive a notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: userId },
      { archived: true }
    );
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification archived'
    });
    
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

// GET /api/notifications/unread-count - Get only unread count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.query; // Optional: 'all', 'admin', 'user'
    
    let query = { userId, read: false, archived: false };
    
    if (type === 'admin') {
      query.type = { $regex: '^admin_', $options: 'i' };
    } else if (type === 'user') {
      query.type = { $not: { $regex: '^admin_', $options: 'i' } };
    }
    
    const unreadCount = await Notification.countDocuments(query);
    
    // For admin users, also get urgent count
    if (type === 'admin') {
      const urgentCount = await Notification.countDocuments({
        userId,
        read: false,
        archived: false,
        type: { $regex: '^admin_', $options: 'i' },
        priority: 'urgent'
      });
      
      return res.json({
        success: true,
        unreadCount,
        urgentCount
      });
    }
    
    res.json({
      success: true,
      unreadCount
    });
    
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Error fetching unread count' });
  }
});

// POST /api/notifications/admin/create-test - Create test admin notification
router.post('/admin/create-test', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Check if user is admin
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { type, title, message } = req.body;
    
    const notification = await AdminNotificationService.sendToAdmin(
      userId,
      type || 'admin_new_user',
      title || 'Test Admin Notification',
      message || 'This is a test admin notification',
      {
        priority: 'medium',
        actionUrl: '/admin/dashboard',
        metadata: { test: true, timestamp: new Date() }
      }
    );
    
    res.json({
      success: true,
      message: 'Test admin notification created',
      notification
    });
    
  } catch (error) {
    console.error('Error creating test admin notification:', error);
    res.status(500).json({ success: false, message: 'Error creating test notification' });
  }
});

module.exports = router;