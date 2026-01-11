const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');

// GET /api/health
router.get('/health', async (req, res) => {
  try {
    const User = require('../models/User');
    const Verification = require('../models/Verification');
    const cache = require('../middleware/cache');
    
    const userCount = await User.countDocuments();
    const verificationCount = await Verification.countDocuments();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'MongoDB',
      usersCount: userCount,
      verificationsCount: verificationCount,
      emailConfigured: !!process.env.EMAIL_USER,
      cacheSize: cache.size()
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/connections/connect/:targetUserId
router.post('/connections/connect/:targetUserId', authenticate, async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.userId;
    
    if (userId === targetUserId) {
      return res.json({ success: false, message: 'Cannot connect with yourself' });
    }
    
    res.json({ success: true, message: 'Connected successfully' });
    
  } catch (error) {
    console.error('Connect error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/boards/join/:boardId
router.post('/boards/join/:boardId', authenticate, async (req, res) => {
  try {
    res.json({ success: true, message: 'Joined board successfully' });
  } catch (error) {
    console.error('Join board error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/voice-rooms/join/:roomId
router.post('/voice-rooms/join/:roomId', authenticate, async (req, res) => {
  try {
    res.json({ success: true, message: 'Joined voice room successfully' });
  } catch (error) {
    console.error('Join voice room error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

