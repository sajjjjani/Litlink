// models/UserActivity.js
const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: () => new Date().setHours(0, 0, 0, 0)
  },
  // Activity counts for the day
  loginCount: {
    type: Number,
    default: 0
  },
  messagesSent: {
    type: Number,
    default: 0
  },
  discussionsCreated: {
    type: Number,
    default: 0
  },
  discussionReplies: {
    type: Number,
    default: 0
  },
  voiceRoomJoined: {
    type: Number,
    default: 0
  },
  voiceRoomDuration: {
    type: Number, // in minutes
    default: 0
  },
  matchesMade: {
    type: Number,
    default: 0
  },
  booksAdded: {
    type: Number,
    default: 0
  },
  // Total activity score for the day
  activityScore: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
userActivitySchema.index({ userId: 1, date: 1 }, { unique: true });
userActivitySchema.index({ date: 1 });
userActivitySchema.index({ activityScore: -1 });

// Calculate activity score before saving
userActivitySchema.pre('save', function(next) {
  this.activityScore = 
    (this.loginCount * 5) +
    (this.messagesSent * 1) +
    (this.discussionsCreated * 10) +
    (this.discussionReplies * 3) +
    (this.voiceRoomJoined * 2) +
    (this.voiceRoomDuration * 0.5) +
    (this.matchesMade * 8) +
    (this.booksAdded * 4);
  next();
});

const UserActivity = mongoose.model('UserActivity', userActivitySchema);

module.exports = UserActivity;