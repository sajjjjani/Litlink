const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/auth');
const Notification = require('../models/Notification');
const AdminNotificationService = require('../services/adminNotificationService');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/unread-count
// Declared before /:id routes to avoid Express treating the word as a param
// ─────────────────────────────────────────────────────────────────────────────
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.query; // optional: 'admin' | 'user'

    let query = { userId, read: false, archived: false };
    if (type === 'admin') {
      query.type = { $regex: '^admin_', $options: 'i' };
    } else if (type === 'user') {
      query.type = { $not: { $regex: '^admin_', $options: 'i' } };
    }

    const unreadCount = await Notification.countDocuments(query);

    if (type === 'admin') {
      const urgentCount = await Notification.countDocuments({
        userId, read: false, archived: false,
        type: { $regex: '^admin_', $options: 'i' },
        priority: 'urgent'
      });
      return res.json({ success: true, unreadCount, urgentCount });
    }

    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Error fetching unread count' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/admin
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin', authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { limit = 20, offset = 0, read, priority } = req.query;

    let query = { userId, archived: false, type: { $regex: '^admin_', $options: 'i' } };
    if (read !== undefined) query.read = read === 'true';
    if (priority) query.priority = priority;

    const notifications = await Notification.find(query)
      .populate('sourceUserId', 'name email profilePicture')
      .sort('-createdAt')
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total       = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      userId, read: false, archived: false,
      type: { $regex: '^admin_', $options: 'i' }
    });
    const urgentCount = await Notification.countDocuments({
      userId, read: false, archived: false,
      type: { $regex: '^admin_', $options: 'i' },
      priority: 'urgent'
    });

    const formattedNotifications = notifications.map(n => _format(n));

    res.json({ success: true, notifications: formattedNotifications, total, unreadCount, urgentCount });
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching admin notifications' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/admin/create-test
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/create-test', authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { type, title, message } = req.body;

    const notification = await AdminNotificationService.sendToAdmin(
      userId,
      type    || 'admin_new_user',
      title   || 'Test Admin Notification',
      message || 'This is a test admin notification',
      { priority: 'medium', actionUrl: '/admin/dashboard', metadata: { test: true } }
    );

    res.json({ success: true, message: 'Test admin notification created', notification });
  } catch (error) {
    console.error('Error creating test admin notification:', error);
    res.status(500).json({ success: false, message: 'Error creating test notification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications  –  paginated list for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      limit    = 20,
      offset   = 0,
      read,
      type,
      priority,
      sort     = '-createdAt'
    } = req.query;

    let query = { userId, archived: false };
    if (read !== undefined) query.read = read === 'true';
    if (priority) query.priority = priority;

    if (type) {
      if (type === 'admin') {
        query.type = { $regex: '^admin_', $options: 'i' };
      } else if (type === 'user') {
        query.type = { $not: { $regex: '^admin_', $options: 'i' } };
      } else {
        query.type = type;
      }
    }

    const notifications = await Notification.find(query)
      .populate('userId',       'name email profilePicture')
      .populate('sourceUserId', 'name email profilePicture')
      .sort(sort)
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total       = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId, read: false, archived: false });

    res.json({
      success: true,
      notifications: notifications.map(n => _format(n)),
      total,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/read-all
// ─────────────────────────────────────────────────────────────────────────────
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type } = req.body;

    let query = { userId, read: false };
    if (type === 'admin') {
      query.type = { $regex: '^admin_', $options: 'i' };
    } else if (type === 'user') {
      query.type = { $not: { $regex: '^admin_', $options: 'i' } };
    }

    await Notification.updateMany(query, { read: true, readAt: new Date() });

    const unreadCount = await Notification.countDocuments({ userId, read: false, archived: false });

    res.json({ success: true, message: 'All notifications marked as read', unreadCount });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notifications' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/create
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type, title, message, actionUrl, priority, metadata } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields: type, title, message' });
    }

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

    const opts = { priority: priority || 'medium', actionUrl: actionUrl || null, metadata: metadata || {} };

    const saved = type.startsWith('admin_')
      ? await Notification.createAdminNotification(userId, type, title, message, opts)
      : await Notification.createUserNotification(userId, type, title, message, opts);

    const populated = await Notification.findById(saved._id)
      .populate('userId', 'name email profilePicture');

    res.json({ success: true, message: 'Notification created', notification: populated });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, message: 'Error creating notification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/read/:id  –  mark a single notification read
// ─────────────────────────────────────────────────────────────────────────────
router.post('/read/:id', authenticate, async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.userId;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true, readAt: new Date() },
      { new: true }
    ).populate('sourceUserId', 'name email profilePicture');

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const unreadCount = await Notification.countDocuments({ userId, read: false, archived: false });

    res.json({ success: true, message: 'Notification marked as read', notification, unreadCount });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id  –  archive (soft-delete) a notification
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { archived: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification archived' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal formatter
// ─────────────────────────────────────────────────────────────────────────────
function _format(n) {
  const legacyTypeMap = {
    circle_request: 'circle_join_request',
    circle_accept: 'circle_accepted',
    thread_create: 'circle_new_thread',
    like: 'thread_liked',
    comment: 'thread_commented'
  };

  return {
    id:         n._id,
    type:       n.type,
    legacyType: legacyTypeMap[n.type] || n.type,
    title:      n.title,
    message:    n.message,
    timestamp:  n.formattedTime,
    read:       n.read,
    isRead:     n.read,
    icon:       n.icon,
    priority:   n.priority,
    actionUrl:  n.actionUrl,
    metadata:   n.metadata,
    referenceId: n.relatedEntityId || null,
    targetId:    n.relatedEntityId || null,
    referenceType: n.relatedEntityType || null,
    createdAt:  n.createdAt,
    sourceUser: n.sourceUserId
  };
}

module.exports = router;