const mongoose = require('mongoose');

const notificationPrefsSchema = new mongoose.Schema({
  emailNotifications: { type: Boolean, default: true },
  matchNotifications: { type: Boolean, default: true },
  messageNotifications: { type: Boolean, default: true },
  newDirectMessages: { type: Boolean, default: true },
  unreadAlerts: { type: Boolean, default: true },
  roomReminders: { type: Boolean, default: true },
  roomStartedAlerts: { type: Boolean, default: true },
  discussionLikes: { type: Boolean, default: true },
  discussionComments: { type: Boolean, default: true },
  discussionReplies: { type: Boolean, default: true },
  discussionMentions: { type: Boolean, default: true },
  newFollowers: { type: Boolean, default: true },
  followRequests: { type: Boolean, default: true },
  circleEventUpdates: { type: Boolean, default: true },
  circleSuggestedBooks: { type: Boolean, default: true },
  circleAnnouncements: { type: Boolean, default: true }
}, { _id: false });

const privacySettingsSchema = new mongoose.Schema({
  messagePrivacy: {
    type: String,
    enum: ['everyone', 'followers', 'none'],
    default: 'everyone'
  },
  profilePrivacy: {
    type: String,
    enum: ['everyone', 'followers', 'private'],
    default: 'everyone'
  }
}, { _id: false });

const primaryControlsSchema = new mongoose.Schema({
  notificationsEnabled: { type: Boolean, default: true },
  darkMode: { type: Boolean, default: false }
}, { _id: false });

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  notifications: { type: notificationPrefsSchema, default: () => ({}) },
  privacy: { type: privacySettingsSchema, default: () => ({}) },
  primary: { type: primaryControlsSchema, default: () => ({}) }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);

