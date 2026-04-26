const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');

// Get latest activities
router.get('/', async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate('user', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ success: false, message: 'Server error fetching activities' });
  }
});

module.exports = router;
