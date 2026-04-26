const mongoose = require('mongoose');

const adminSettingSchema = new mongoose.Schema({
  general: {
    siteName: { type: String, default: 'Litlink' },
    siteUrl: { type: String, default: 'https://litlink.com' },
    adminEmail: { type: String, default: 'admin@litlink.com' },
    timezone: { type: String, default: 'UTC' },
    autoModeration: { type: Boolean, default: true },
    requireEmailVerification: { type: Boolean, default: true },
    allowRegistration: { type: Boolean, default: true },
    enableReporting: { type: Boolean, default: true }
  },
  security: {
    sessionTimeout: { type: Number, default: 60 },
    maxLoginAttempts: { type: Number, default: 5 },
    require2FA: { type: Boolean, default: true },
    strongPasswords: { type: Boolean, default: true },
    forceHTTPS: { type: Boolean, default: true },
    ipWhitelist: { type: Boolean, default: false },
    auditLogging: { type: Boolean, default: true },
    logRetention: { type: Number, default: 90 }
  },
  appearance: {
    primaryColor: { type: String, default: '#d4a574' },
    themeMode: { type: String, default: 'dark' },
    enableAnimations: { type: Boolean, default: true },
    compactMode: { type: Boolean, default: false },
    widgets: {
      users: { type: Boolean, default: true },
      activity: { type: Boolean, default: true },
      reports: { type: Boolean, default: true },
      system: { type: Boolean, default: true },
      analytics: { type: Boolean, default: false }
    }
  },
  notifications: {
    email: {
      systemAlerts: { type: Boolean, default: true },
      userReports: { type: Boolean, default: true },
      newUsers: { type: Boolean, default: false },
      securityEvents: { type: Boolean, default: true }
    },
    inApp: {
      desktopNotifications: { type: Boolean, default: false },
      notificationSound: { type: String, default: 'none' }
    }
  },
  api: {
    enableAPI: { type: Boolean, default: true },
    apiRateLimit: { type: Number, default: 100 },
    apiKey: { type: String, default: '' },
    readOnlyApiKey: { type: String, default: '' }
  }
}, { timestamps: true });

// Ensure only one settings document exists
adminSettingSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('AdminSetting', adminSettingSchema);
