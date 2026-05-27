const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');

function sanitizeSettings(settingsDoc) {
  if (!settingsDoc) return null;
  return {
    notifications: settingsDoc.notifications || {},
    privacy: settingsDoc.privacy || {},
    primary: settingsDoc.primary || {}
  };
}

// GET /api/user-settings/me
router.get('/me', authenticate, async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.userId });
    if (!settings) {
      settings = await UserSettings.create({ userId: req.userId });
    }

    res.json({ success: true, settings: sanitizeSettings(settings) });
  } catch (error) {
    console.error('Get user settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user-settings/me
router.put('/me', authenticate, async (req, res) => {
  try {
    const allowedNotificationKeys = new Set([
      'emailNotifications',
      'matchNotifications',
      'messageNotifications',
      'discussionNotifications'
    ]);
    const allowedPrivacyKeys = new Set(['messagePrivacy', 'profilePrivacy']);
    const allowedPrimaryKeys = new Set(['notificationsEnabled', 'darkMode']);

    const update = {};

    if (req.body && typeof req.body === 'object') {
      if (req.body.notifications && typeof req.body.notifications === 'object') {
        Object.keys(req.body.notifications).forEach((key) => {
          if (allowedNotificationKeys.has(key)) {
            update[`notifications.${key}`] = !!req.body.notifications[key];
          }
        });
      }

      if (req.body.privacy && typeof req.body.privacy === 'object') {
        Object.keys(req.body.privacy).forEach((key) => {
          if (allowedPrivacyKeys.has(key)) {
            update[`privacy.${key}`] = req.body.privacy[key];
          }
        });
      }

      if (req.body.primary && typeof req.body.primary === 'object') {
        Object.keys(req.body.primary).forEach((key) => {
          if (allowedPrimaryKeys.has(key)) {
            update[`primary.${key}`] = !!req.body.primary[key];
          }
        });
      }
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.userId },
      { $set: update, $setOnInsert: { userId: req.userId } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ success: true, message: 'Settings updated', settings: sanitizeSettings(settings) });
  } catch (error) {
    console.error('Update user settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

