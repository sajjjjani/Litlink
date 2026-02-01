const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    trim: true,
    sparse: true
  },
  password: {
    type: String,
    required: true
  },
  // ===== ADMIN FIELDS =====
  isAdmin: {
    type: Boolean,
    default: false
  },
  adminLevel: {
    type: String,
    enum: ['none', 'moderator', 'super_admin'],
    default: 'none'
  },
  adminPermissions: [{
    type: String,
    enum: ['manage_users', 'manage_posts', 'manage_chats', 'view_reports', 'system_settings']
  }],
  isBanned: {
    type: Boolean,
    default: false
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspensionEnds: {
    type: Date,
    default: null
  },
  banReason: {
    type: String,
    default: ''
  },
  bannedAt: {
    type: Date,
    default: null
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // ===== EXISTING FIELDS =====
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    default: null
  },
  verificationExpiry: {
    type: Date,
    default: null
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  profilePicture: {
    type: String,
    default: '📚'
  },
  bio: {
    type: String,
    default: 'Book lover and avid reader'
  },
  location: {
    type: String,
    default: ''
  },
  pronouns: {
    type: String,
    default: ''
  },
  favoriteGenres: [String],
  favoriteAuthors: [String],
  favoriteBooks: [String],
  readingHabit: String,
  readingGoal: Number,
  preferredFormats: [String],
  discussionPreferences: [String],
  receiveRecommendations: {
    type: Boolean,
    default: true
  },
  booksRead: [{
    bookId: String,
    title: String,
    author: String,
    readAt: Date,
    // Store a stable cover URL so profile/book lists can render real covers
    cover: String
  }],
  currentlyReading: [{
    bookId: String,
    title: String,
    author: String
  }],
  wantToRead: [{
    bookId: String,
    title: String,
    author: String
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Import admin notification service
const AdminNotificationService = require('../services/adminNotificationService');

// Post-save hook for new user signups
userSchema.post('save', async function(doc, next) {
  try {
    // Only create notification for new user signups
    if (doc.wasNew && !doc.isAdmin) {
      console.log(`👤 New user signup: ${doc.name} (${doc.email})`);
      
      // Create database notification
      await AdminNotificationService.notifyNewUserSignup(doc);
      
      // Emit WebSocket event to all connected admins
      try {
        const io = global.io;
        if (io) {
          io.broadcastToAdmins({
            type: 'admin-notification',
            notificationType: 'admin_new_user',
            title: 'New User Signup',
            message: `${doc.name} (${doc.email}) has joined Litlink`,
            timestamp: new Date(),
            priority: 'medium',
            metadata: {
              userId: doc._id.toString(),
              userName: doc.name,
              userEmail: doc.email,
              profilePicture: doc.profilePicture
            }
          });
          console.log(`📢 WebSocket notification sent for new user: ${doc.name}`);
        } else {
          console.log('⚠️ WebSocket server not available for new user notification');
        }
      } catch (socketError) {
        console.error('WebSocket error in user post-save:', socketError);
      }
    }
  } catch (error) {
    console.error('Error in user post-save notification:', error);
  }
  next();
});

// Post-update hook for user actions (ban/suspend)
userSchema.post('findOneAndUpdate', async function(doc, next) {
  try {
    if (doc) {
      // Check if user was just banned
      const update = this.getUpdate();
      
      if (update.$set) {
        // User banned
        if (update.$set.isBanned === true && !doc.isBanned) {
          console.log(`🚫 User banned: ${doc.name} (${doc.email})`);
          
          // Emit WebSocket event
          try {
            const io = global.io;
            if (io) {
              io.broadcastToAdmins({
                type: 'admin-notification',
                notificationType: 'admin_user_banned',
                title: 'User Banned',
                message: `${doc.name} has been banned`,
                timestamp: new Date(),
                priority: 'high',
                metadata: {
                  userId: doc._id.toString(),
                  userName: doc.name,
                  userEmail: doc.email,
                  banReason: update.$set.banReason || 'Not specified'
                }
              });
              console.log(`📢 WebSocket notification sent for banned user: ${doc.name}`);
            }
          } catch (socketError) {
            console.error('WebSocket error in user ban update:', socketError);
          }
        }
        
        // User suspended
        if (update.$set.isSuspended === true && !doc.isSuspended) {
          console.log(`⏸️ User suspended: ${doc.name} (${doc.email})`);
          
          // Emit WebSocket event
          try {
            const io = global.io;
            if (io) {
              io.broadcastToAdmins({
                type: 'admin-notification',
                notificationType: 'admin_user_suspended',
                title: 'User Suspended',
                message: `${doc.name} has been suspended`,
                timestamp: new Date(),
                priority: 'high',
                metadata: {
                  userId: doc._id.toString(),
                  userName: doc.name,
                  userEmail: doc.email
                }
              });
              console.log(`📢 WebSocket notification sent for suspended user: ${doc.name}`);
            }
          } catch (socketError) {
            console.error('WebSocket error in user suspension update:', socketError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in user update notification:', error);
  }
  next();
});

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ isSuspended: 1 });
userSchema.index({ lastLogin: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;