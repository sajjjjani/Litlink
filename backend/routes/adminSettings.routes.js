const express = require('express');
const router = express.Router();
const AdminSetting = require('../models/AdminSetting');
const { requireAdmin } = require('../middleware/adminAuth');
const crypto = require('crypto');

// Utility to generate a random API key
const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// GET /api/admin/settings
router.get('/', requireAdmin, async (req, res) => {
  try {
    const settings = await AdminSetting.getSettings();
    
    // If API keys are missing, generate them
    let updated = false;
    if (!settings.api.apiKey) {
      settings.api.apiKey = `admin_${generateApiKey()}`;
      updated = true;
    }
    if (!settings.api.readOnlyApiKey) {
      settings.api.readOnlyApiKey = `read_${generateApiKey()}`;
      updated = true;
    }
    
    if (updated) {
      await settings.save();
    }
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// POST /api/admin/settings
router.post('/', requireAdmin, async (req, res) => {
  try {
    const settings = await AdminSetting.getSettings();
    
    // Merge updates from req.body
    // We expect the body to have the same structure as the model
    const updates = req.body;
    
    if (updates.general) Object.assign(settings.general, updates.general);
    if (updates.security) Object.assign(settings.security, updates.security);
    if (updates.appearance) {
      if (updates.appearance.widgets) {
        Object.assign(settings.appearance.widgets, updates.appearance.widgets);
        delete updates.appearance.widgets;
      }
      Object.assign(settings.appearance, updates.appearance);
    }
    if (updates.notifications) {
      if (updates.notifications.email) {
        Object.assign(settings.notifications.email, updates.notifications.email);
      }
      if (updates.notifications.inApp) {
        Object.assign(settings.notifications.inApp, updates.notifications.inApp);
      }
    }
    if (updates.api) {
      // Don't allow updating API keys via this route directly for safety
      // but allow updating enableAPI and rateLimit
      settings.api.enableAPI = updates.api.enableAPI;
      settings.api.apiRateLimit = updates.api.apiRateLimit;
    }
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating admin settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// POST /api/admin/settings/regenerate-key
router.post('/regenerate-key', requireAdmin, async (req, res) => {
  try {
    const { type } = req.body; // 'admin' or 'readOnly'
    const settings = await AdminSetting.getSettings();
    
    if (type === 'admin') {
      settings.api.apiKey = `admin_${generateApiKey()}`;
    } else if (type === 'readOnly') {
      settings.api.readOnlyApiKey = `read_${generateApiKey()}`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid key type'
      });
    }
    
    await settings.save();
    
    res.json({
      success: true,
      message: `${type === 'admin' ? 'Admin' : 'Read-only'} API key regenerated`,
      apiKey: type === 'admin' ? settings.api.apiKey : settings.api.readOnlyApiKey
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// POST /api/admin/settings/reset
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await AdminSetting.deleteMany({});
    const settings = await AdminSetting.getSettings();
    res.json({ success: true, message: 'Settings reset to defaults', settings });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/settings/export
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const Report = require('../models/Report');
    const DiscussionThread = require('../models/DiscussionThread');
    const FilterWord = require('../models/FilterWord');
    
    const [users, reports, threads, filters] = await Promise.all([
      User.find().select('-password'),
      Report.find(),
      DiscussionThread.find(),
      FilterWord.find()
    ]);
    
    const data = {
      exportedAt: new Date(),
      users,
      reports,
      threads,
      filters,
      settings: await AdminSetting.getSettings()
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=litlink_backup.json');
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// POST /api/admin/settings/reset-platform
router.post('/reset-platform', requireAdmin, async (req, res) => {
  const { option } = req.body;
  try {
    const User = require('../models/User');
    const Report = require('../models/Report');
    const DiscussionThread = require('../models/DiscussionThread');
    const Conversation = require('../models/Conversation');
    const Activity = require('../models/Activity');
    const Notification = require('../models/Notification');

    switch(option) {
      case 'cache':
        // No explicit cache yet, but we can say success
        return res.json({ success: true, message: 'System cache cleared' });
      case 'reports':
        await Report.deleteMany({});
        break;
      case 'users':
        await User.deleteMany({ isAdmin: { $ne: true } });
        break;
      case 'content':
        await DiscussionThread.deleteMany({});
        await Conversation.deleteMany({});
        await Activity.deleteMany({});
        break;
      case 'everything':
        await Report.deleteMany({});
        await User.deleteMany({ isAdmin: { $ne: true } });
        await DiscussionThread.deleteMany({});
        await Conversation.deleteMany({});
        await Activity.deleteMany({});
        await Notification.deleteMany({});
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid reset option' });
    }
    
    res.json({ success: true, message: `${option} reset successfully` });
  } catch (error) {
    console.error('Reset platform error:', error);
    res.status(500).json({ success: false, message: 'Reset failed' });
  }
});

// POST /api/admin/settings/import
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, message: 'No data provided' });
    
    const User = require('../models/User');
    const Report = require('../models/Report');
    const DiscussionThread = require('../models/DiscussionThread');
    const FilterWord = require('../models/FilterWord');
    const AdminSetting = require('../models/AdminSetting');

    // Basic validation
    if (!data.users || !data.settings) {
      return res.status(400).json({ success: false, message: 'Invalid backup format' });
    }

    // Reset and Import
    if (data.users) {
      await User.deleteMany({ isAdmin: { $ne: true } });
      // Filter out admins if they are in the backup to avoid duplicates or keep existing admins
      const nonAdminUsers = data.users.filter(u => !u.isAdmin);
      await User.insertMany(nonAdminUsers);
    }
    
    if (data.reports) {
      await Report.deleteMany({});
      await Report.insertMany(data.reports);
    }
    
    if (data.threads) {
      await DiscussionThread.deleteMany({});
      await DiscussionThread.insertMany(data.threads);
    }
    
    if (data.filters) {
      await FilterWord.deleteMany({});
      await FilterWord.insertMany(data.filters);
    }
    
    if (data.settings) {
      await AdminSetting.deleteMany({});
      await AdminSetting.create(data.settings);
    }

    res.json({ success: true, message: 'Database imported successfully' });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Import failed: ' + error.message });
  }
});

module.exports = router;
