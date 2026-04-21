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
      // ── Canonical user notification types (v2) ─────────────────────────────
      'follow', 'unfollow', 'circle_request', 'circle_accept',
      'thread_create', 'like', 'comment', 'voice_room_created', 'circle_created',

      // ── User social notifications ──────────────────────────────────────────
      'follow',               // Someone followed you
      'circle_new_thread',    // New thread posted in a circle you are in
      'circle_join_request',  // Someone requested to join your moderated circle
      'circle_accepted',      // You were accepted into a circle
      'thread_liked',         // Someone liked your thread
      'thread_commented',     // Someone commented on your thread

      // ── Legacy / general user notifications ───────────────────────────────
      'match', 'message', 'board', 'voice', 'achievement',
      'warning', 'info', 'success', 'error', 'system',

      // ── Admin notifications ────────────────────────────────────────────────
      'admin_new_user', 'admin_new_report', 'admin_user_banned',
      'admin_user_suspended', 'admin_warning_issued', 'admin_system_alert',
      'admin_filter_word_added', 'admin_voice_room_flagged',
      'admin_urgent_attention', 'admin_report_resolved'
    ],
    required: true
  },
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  actionUrl: { type: String, default: null },
  icon:      { type: String, default: '🔔' },
  read:      { type: Boolean, default: false },
  // Backward-compatible alias expected by newer clients.
  isRead:    { type: Boolean, default: undefined, select: false },
  readAt:    { type: Date, default: null },
  archived:  { type: Boolean, default: false },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Who triggered the notification (follower, commenter, liker, requester…)
  sourceUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Backward-compatible alias expected by newer clients.
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedEntityType: {
    type: String,
    enum: ['User', 'Report', 'FilterWord', 'ChatRoom', 'VoiceRoom', 'Post', 'Circle', 'Thread', null],
    default: null
  }
}, { timestamps: true });

// Keep `read` and `isRead` in sync when either is provided.
notificationSchema.pre('validate', function syncReadAliases(next) {
  if (typeof this.isRead === 'boolean') {
    this.read = this.isRead;
  } else {
    this.isRead = this.read;
  }

  if (this.referenceId && !this.relatedEntityId) {
    this.relatedEntityId = this.referenceId;
  }
  if (this.relatedEntityId && !this.referenceId) {
    this.referenceId = this.relatedEntityId;
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
notificationSchema.index({ userId: 1, read: 1, archived: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, read: 1 });
notificationSchema.index({ userId: 1, priority: 1, read: 1 });

// ── Virtual: human-readable timestamp ────────────────────────────────────────
notificationSchema.virtual('formattedTime').get(function () {
  const now     = new Date();
  const created = this.createdAt;
  const diffMs    = now - created;
  const diffMins  = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays  = Math.floor(diffMs / 86400000);

  if (diffMins  < 1)  return 'Just now';
  if (diffMins  < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays  < 7)  return `${diffDays}d ago`;
  return created.toLocaleDateString();
});

// ── Icon maps ─────────────────────────────────────────────────────────────────
const USER_ICON_MAP = {
  follow:              '👤',
  unfollow:            '👋',
  circle_request:      '🔔',
  circle_accept:       '✅',
  thread_create:       '💬',
  like:                '❤️',
  comment:             '💭',
  circle_new_thread:   '💬',
  circle_join_request: '🔔',
  circle_accepted:     '✅',
  thread_liked:        '❤️',
  thread_commented:    '💭',
  match:               '🤝',
  message:             '✉️',
  board:               '📋',
  voice:               '🎙️',
  voice_room_created:  '🎙️',
  circle_created:      '👥',
  achievement:         '🏆',
  warning:             '⚠️',
  info:                'ℹ️',
  success:             '✅',
  error:               '❌',
  system:              '⚙️'
};

const ADMIN_ICON_MAP = {
  admin_new_user:           '👤',
  admin_new_report:         '⚠️',
  admin_user_banned:        '🚫',
  admin_user_suspended:     '⏸️',
  admin_warning_issued:     '⚠️',
  admin_system_alert:       '🔧',
  admin_filter_word_added:  '🔤',
  admin_voice_room_flagged: '🎙️',
  admin_urgent_attention:   '🚨',
  admin_report_resolved:    '✅'
};

// ── Internal helpers ──────────────────────────────────────────────────────────
function _formatSocketPayload(saved) {
  return {
    id:        saved._id,
    type:      saved.type,
    legacyType: _toLegacyType(saved.type),
    title:     saved.title,
    message:   saved.message,
    icon:      saved.icon,
    priority:  saved.priority,
    actionUrl: saved.actionUrl,
    metadata:  saved.metadata,
    referenceId: saved.relatedEntityId || null,
    targetId: saved.relatedEntityId || null,
    referenceType: saved.relatedEntityType || null,
    isRead: saved.read,
    timestamp: saved.createdAt
  };
}

function _toLegacyType(type) {
  const map = {
    circle_request: 'circle_join_request',
    circle_accept: 'circle_accepted',
    thread_create: 'circle_new_thread',
    like: 'thread_liked',
    comment: 'thread_commented'
  };
  return map[type] || type;
}

async function _saveAndPush(doc, targetUserId, isAdmin = false) {
  const saved = await doc.save();

  try {
    if (isAdmin) {
      if (global.io && typeof global.io.broadcastToAdmins === 'function') {
        global.io.broadcastToAdmins(_formatSocketPayload(saved));
      }
    } else {
      if (global.io && typeof global.io.sendToUser === 'function') {
        global.io.sendToUser(targetUserId.toString(), _formatSocketPayload(saved));
      }
    }
  } catch (socketError) {
    // Never let a socket failure break the DB write
    console.error('⚠️  Socket emit error:', socketError.message);
  }

  return saved;
}

// ── Static: create a regular user notification ────────────────────────────────
notificationSchema.statics.createUserNotification = async function (
  userId, type, title, message, options = {}
) {
  const doc = new this({
    userId,
    type,
    title,
    message,
    icon:              options.icon || USER_ICON_MAP[type] || '🔔',
    priority:          options.priority || 'medium',
    actionUrl:         options.actionUrl || null,
    metadata:          options.metadata || {},
    sourceUserId:      options.sourceUserId || null,
    relatedEntityId:   options.relatedEntityId || null,
    relatedEntityType: options.relatedEntityType || null
  });

  return _saveAndPush(doc, userId, false);
};

// ── Static: create an admin notification ─────────────────────────────────────
notificationSchema.statics.createAdminNotification = async function (
  adminId, type, title, message, options = {}
) {
  const doc = new this({
    userId:            adminId,
    type,
    title,
    message,
    icon:              ADMIN_ICON_MAP[type] || '🔔',
    priority:          options.priority || 'medium',
    actionUrl:         options.actionUrl || null,
    metadata:          options.metadata || {},
    sourceUserId:      options.sourceUserId || null,
    relatedEntityId:   options.relatedEntityId || null,
    relatedEntityType: options.relatedEntityType || null
  });

  return _saveAndPush(doc, adminId, true);
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;