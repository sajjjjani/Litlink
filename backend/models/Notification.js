// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      // User notifications
      'match', 'message', 'board', 'voice', 'achievement', 'warning', 'info', 'success', 'error', 'system',
      // Admin notifications (new)
      'admin_new_user', 'admin_new_report', 'admin_user_banned', 'admin_user_suspended',
      'admin_warning_issued', 'admin_system_alert', 'admin_filter_word_added',
      'admin_voice_room_flagged', 'admin_urgent_attention', 'admin_report_resolved'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  actionUrl: {
    type: String,
    default: null
  },
  icon: {
    type: String,
    default: '🔔'
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  archived: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sourceUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedEntityType: {
    type: String,
    enum: ['User', 'Report', 'FilterWord', 'ChatRoom', 'Post'],
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
notificationSchema.index({ userId: 1, read: 1, archived: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, read: 1 });
notificationSchema.index({ userId: 1, priority: 1, read: 1 });

// Virtual for formatted timestamp
notificationSchema.virtual('formattedTime').get(function() {
  const now = new Date();
  const created = this.createdAt;
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return created.toLocaleDateString();
});

// Static method to create admin notification
notificationSchema.statics.createAdminNotification = async function(adminId, type, title, message, options = {}) {
  const iconMap = {
    'admin_new_user': '👤',
    'admin_new_report': '⚠️',
    'admin_user_banned': '🚫',
    'admin_user_suspended': '⏸️',
    'admin_warning_issued': '⚠️',
    'admin_system_alert': '🔧',
    'admin_filter_word_added': '🔤',
    'admin_voice_room_flagged': '🎙️',
    'admin_urgent_attention': '🚨',
    'admin_report_resolved': '✅'
  };
  
  const notification = new this({
    userId: adminId,
    type,
    title,
    message,
    icon: iconMap[type] || '🔔',
    priority: options.priority || 'medium',
    actionUrl: options.actionUrl || null,
    metadata: options.metadata || {},
    sourceUserId: options.sourceUserId || null,
    relatedEntityId: options.relatedEntityId || null,
    relatedEntityType: options.relatedEntityType || null
  });
  
  return await notification.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;