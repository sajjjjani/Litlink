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
    readAt: Date
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

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ lastLogin: 1 });

module.exports = mongoose.model('User', userSchema);