const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');

// GET /api/chat/matches
router.get('/matches', authenticate, async (req, res) => {
  try {
    const demoMatches = [
      {
        id: 'match_1',
        name: 'Eleanor Vance',
        avatar: 'https://i.pravatar.cc/150?img=45',
        genre: 'Horror • Gothic',
        preview: 'Have you reached the part wit...',
        online: true,
        notifications: 2,
        compatibility: 85
      },
      {
        id: 'match_2',
        name: 'Julian Blackthorn',
        avatar: 'https://i.pravatar.cc/150?img=12',
        genre: 'Literary Fiction • Mystery',
        preview: 'The ending completely destroy...',
        online: true,
        notifications: 0,
        compatibility: 78
      }
    ];
    
    res.json({ success: true, matches: demoMatches });
    
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

