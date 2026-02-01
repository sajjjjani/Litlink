const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const User = require('../models/User');

// GET /api/chat/matches - returns real users (for WebSocket chat) or demo fallback
router.get('/matches', authenticate, async (req, res) => {
  try {
    const currentUserId = req.userId;
    const users = await User.find(
      { _id: { $ne: currentUserId }, isBanned: { $ne: true } }
    )
      .select('name profilePicture favoriteGenres')
      .limit(20)
      .lean();

    const matches = users.map((u, i) => ({
      id: u._id.toString(),
      name: u.name || 'User',
      avatar: u.profilePicture || `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
      genre: (u.favoriteGenres && u.favoriteGenres[0]) ? u.favoriteGenres[0] : 'Fiction',
      preview: '',
      online: false,
      notifications: 0,
      compatibility: 75 + Math.floor(Math.random() * 20)
    }));

    res.json({ success: true, matches });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ success: false, message: 'Error fetching matches' });
  }
});

// GET /api/chat/messages/:matchId
router.get('/messages/:matchId', authenticate, async (req, res) => {
  try {
    const demoMessages = [
      {
        id: 1,
        type: 'received',
        text: 'Hello! I noticed we have similar reading tastes.',
        time: '10:45 AM',
        timestamp: new Date().toISOString()
      },
      {
        id: 2,
        type: 'sent',
        text: 'Yes! What are you reading right now?',
        time: '10:46 AM',
        timestamp: new Date().toISOString()
      }
    ];
    
    res.json({ success: true, messages: demoMessages });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Error fetching messages' });
  }
});

// POST /api/chat/messages
router.post('/messages', authenticate, async (req, res) => {
  try {
    const { matchId, content, type = 'text' } = req.body;
    const userId = req.userId;
    
    const newMessage = {
      id: Date.now(),
      senderId: userId,
      matchId: matchId,
      content: content,
      type: type,
      timestamp: new Date().toISOString(),
      delivered: true,
      read: false
    };
    
    res.json({ success: true, message: newMessage });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Error sending message' });
  }
});

module.exports = router;

