const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const Notification = require('../models/Notification'); // You'll need to create this model

// GET /api/notifications - Get user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Check if Notification model exists, if not use mock data
    let notifications;
    let unreadCount = 0;
    
    if (Notification) {
      // Real database implementation
      notifications = await Notification.find({ 
        userId, 
        archived: false 
      })
      .sort({ createdAt: -1 })
      .limit(50);
      
      unreadCount = await Notification.countDocuments({ 
        userId, 
        read: false,
        archived: false 
      });
    } else {
      // Mock data fallback
      notifications = [
        { 
          _id: 'notif1',
          type: 'match',
          title: 'New Reader Match',
          message: 'Alex M. shares your interest in Fantasy novels',
          timestamp: '5m ago',
          read: false,
          icon: '🔗',
          actionUrl: '/chat/chat1',
          userId: userId,
          createdAt: new Date(Date.now() - 5 * 60000) // 5 minutes ago
        },
        { 
          _id: 'notif2',
          type: 'message',
          title: 'New Message',
          message: 'Sarah replied to your book suggestion',
          timestamp: '1h ago',
          read: false,
          icon: '💬',
          actionUrl: '/chat/chat2',
          userId: userId,
          createdAt: new Date(Date.now() - 60 * 60000) // 1 hour ago
        },
        { 
          _id: 'notif3',
          type: 'board',
          title: 'Board Update',
          message: 'New discussion started in Fantasy Worlds',
          timestamp: '3h ago',
          read: true,
          icon: '📌',
          actionUrl: '/board/board1',
          userId: userId,
          createdAt: new Date(Date.now() - 180 * 60000) // 3 hours ago
        },
        { 
          _id: 'notif4',
          type: 'voice',
          title: 'Voice Room Starting',
          message: 'Mystery Book Club voice chat starts in 10 minutes',
          timestamp: '5h ago',
          read: true,
          icon: '🎙️',
          actionUrl: '/voice/room1',
          userId: userId,
          createdAt: new Date(Date.now() - 300 * 60000) // 5 hours ago
        },
        { 
          _id: 'notif5',
          type: 'achievement',
          title: 'Achievement Unlocked!',
          message: 'You\'ve completed your weekly reading goal!',
          timestamp: '1d ago',
          read: true,
          icon: '🏆',
          actionUrl: '/profile#achievements',
          userId: userId,
          createdAt: new Date(Date.now() - 24 * 60 * 60000) // 1 day ago
        }
      ];
      
      unreadCount = notifications.filter(n => !n.read).length;
    }
    
    // Format timestamp for display
    const formattedNotifications = notifications.map(notif => {
      const timeDiff = Date.now() - new Date(notif.createdAt).getTime();
      let timestamp;
      
      if (timeDiff < 60000) timestamp = 'Just now';
      else if (timeDiff < 3600000) timestamp = `${Math.floor(timeDiff / 60000)}m ago`;
      else if (timeDiff < 86400000) timestamp = `${Math.floor(timeDiff / 3600000)}h ago`;
      else timestamp = `${Math.floor(timeDiff / 86400000)}d ago`;
      
      return {
        id: notif._id || notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        timestamp: timestamp,
        read: notif.read,
        icon: notif.icon || getIconByType(notif.type),
        actionUrl: notif.actionUrl
      };
    });
    
    res.json({ 
      success: true, 
      notifications: formattedNotifications,
      unreadCount: unreadCount
    });
    
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

// POST /api/notifications/read/:id - Mark single notification as read
router.post('/read/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    if (Notification) {
      // Update in database
      await Notification.findOneAndUpdate(
        { _id: id, userId: userId },
        { read: true, readAt: new Date() }
      );
    } else {
      // Mock implementation - store in localStorage on client side
      console.log(`Mock: Marking notification ${id} as read for user ${userId}`);
    }
    
    res.json({ success: true, message: 'Notification marked as read' });
    
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notification' });
  }
});

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (Notification) {
      // Update all in database
      await Notification.updateMany(
        { userId: userId, read: false },
        { read: true, readAt: new Date() }
      );
    } else {
      // Mock implementation
      console.log(`Mock: Marking all notifications as read for user ${userId}`);
    }
    
    res.json({ success: true, message: 'All notifications marked as read' });
    
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notifications' });
  }
});

// POST /api/notifications/create - Create a new notification (for testing)
router.post('/create', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { type, title, message, actionUrl } = req.body;
    
    if (!type || !title || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const notificationData = {
      userId,
      type,
      title,
      message,
      actionUrl: actionUrl || null,
      icon: getIconByType(type),
      read: false,
      archived: false,
      createdAt: new Date()
    };
    
    if (Notification) {
      // Save to database
      const notification = new Notification(notificationData);
      await notification.save();
      
      res.json({ 
        success: true, 
        message: 'Notification created',
        notification: notification
      });
    } else {
      // Mock response
      console.log(`Mock: Created notification for user ${userId}`);
      res.json({ 
        success: true, 
        message: 'Mock notification created (not saved to DB)',
        notification: notificationData
      });
    }
    
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
    
    if (Notification) {
      // Soft delete by archiving
      await Notification.findOneAndUpdate(
        { _id: id, userId: userId },
        { archived: true }
      );
    } else {
      // Mock implementation
      console.log(`Mock: Archiving notification ${id} for user ${userId}`);
    }
    
    res.json({ success: true, message: 'Notification archived' });
    
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

// GET /api/notifications/unread-count - Get only unread count (for polling)
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    let unreadCount;
    
    if (Notification) {
      unreadCount = await Notification.countDocuments({ 
        userId, 
        read: false,
        archived: false 
      });
    } else {
      // Mock count - in real app, this would come from localStorage on client
      unreadCount = 2; // Mock value
    }
    
    res.json({ success: true, unreadCount });
    
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Error fetching unread count' });
  }
});

// Helper function to get icon by notification type
function getIconByType(type) {
  const iconMap = {
    'match': '🔗',
    'message': '💬',
    'board': '📌',
    'voice': '🎙️',
    'achievement': '🏆',
    'warning': '⚠️',
    'info': 'ℹ️',
    'success': '✅',
    'error': '❌'
  };
  
  return iconMap[type] || '🔔';
}

module.exports = router;