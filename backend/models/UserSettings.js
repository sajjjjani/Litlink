const mongoose = require('mongoose');

const notificationPrefsSchema = new mongoose.Schema({
  emailNotifications: { type: Boolean, default: true },
  matchNotifications: { type: Boolean, default: true },
  messageNotifications: { type: Boolean, default: true },
  discussionNotifications: { type: Boolean, default: true }
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

