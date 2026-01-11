const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const User = require('../models/User');

// GET /api/dashboard/:userId
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }
    
    const user = await User.findById(userId).select('-password -verificationCode -resetToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Get user's notifications from the database (if implemented)
    // For now, we'll use mock notifications
    const notifications = [
      { 
        id: 'notif1',
        type: 'match',
        title: 'New Reader Match',
        message: 'Alex M. shares your interest in Fantasy novels',
        timestamp: '5m ago',
        read: false,
        icon: '🔗',
        actionUrl: '/chat/chat1'
      },
      { 
        id: 'notif2',
        type: 'message',
        title: 'New Message',
        message: 'Sarah replied to your book suggestion',
        timestamp: '1h ago',
        read: false,
        icon: '💬',
        actionUrl: '/chat/chat2'
      },
      { 
        id: 'notif3',
        type: 'board',
        title: 'Board Update',
        message: 'New discussion started in Fantasy Worlds',
        timestamp: '3h ago',
        read: true,
        icon: '📌',
        actionUrl: '/board/board1'
      },
      { 
        id: 'notif4',
        type: 'voice',
        title: 'Voice Room Starting',
        message: 'Mystery Book Club voice chat starts in 10 minutes',
        timestamp: '5h ago',
        read: true,
        icon: '🎙️',
        actionUrl: '/voice/room1'
      },
      { 
        id: 'notif5',
        type: 'achievement',
        title: 'Achievement Unlocked!',
        message: 'You\'ve completed your weekly reading goal!',
        timestamp: '1d ago',
        read: true,
        icon: '🏆',
        actionUrl: '/profile#achievements'
      }
    ];
    
    const dashboardData = {
      user: {
        name: user.name,
        email: user.email,
        username: user.username || user.email?.split('@')[0] || 'user',
        profilePicture: user.profilePicture || `https://i.pravatar.cc/80?img=1`,
        favoriteGenres: user.favoriteGenres || ['Magical Realism'],
        bio: user.bio,
        location: user.location,
        readingGoal: user.readingGoal || 12
      },
      stats: {
        totalMatches: 4,
        activeChats: 3,
        joinedBoards: 2,
        booksRead: user.booksRead?.length || 0,
        unreadNotifications: notifications.filter(n => !n.read).length
      },
      notifications: notifications,
      topMatches: [
        { id: 'match1', name: 'Elena R.', profileImage: 'https://i.pravatar.cc/150?img=5', tags: ['Fantasy', 'Sci-Fi'], sharedBooks: 32, isConnected: false },
        { id: 'match2', name: 'Marcus Chen', profileImage: 'https://i.pravatar.cc/150?img=12', tags: ['Mystery', 'Thriller'], sharedBooks: 28, isConnected: false },
        { id: 'match3', name: 'Sarah J.', profileImage: 'https://i.pravatar.cc/150?img=9', tags: ['Romance', 'YA'], sharedBooks: 25, isConnected: false },
        { id: 'match4', name: 'David K.', profileImage: 'https://i.pravatar.cc/150?img=14', tags: ['History', 'Biographies'], sharedBooks: 21, isConnected: false }
      ],
      trendingBoards: [
        { id: 'board1', name: 'Fantasy Worlds', icon: '✨', color: 'purple', activeUsers: 15000, isJoined: false },
        { id: 'board2', name: 'Modern Romance', icon: '💕', color: 'pink', activeUsers: 9000, isJoined: false },
        { id: 'board3', name: 'Mystery & Thriller', icon: '🔍', color: 'blue', activeUsers: 21000, isJoined: false },
        { id: 'board4', name: 'Literary Fiction', icon: '✒️', color: 'brown', activeUsers: 6000, isJoined: false },
        { id: 'board5', name: 'Young Adult', icon: '🌹', color: 'teal', activeUsers: 12000, isJoined: false },
        { id: 'board6', name: 'Sci-Fi Classics', icon: '🚀', color: 'indigo', activeUsers: 8000, isJoined: false }
      ],
      activeChats: [
        { id: 'chat1', name: 'The Midnight Library Club', avatar: 'https://i.pravatar.cc/60?img=20', lastMessage: 'Has anyone finished chapter 5 yet?', timestamp: '2m ago', unreadCount: 3 },
        { id: 'chat2', name: 'James Wilson', avatar: 'https://i.pravatar.cc/60?img=33', lastMessage: "I think you'd love 'Project Hail Mary'!", timestamp: '1h ago', unreadCount: 0 },
        { id: 'chat3', name: 'Sci-Fi Enthusiasts', avatar: 'https://i.pravatar.cc/60?img=47', lastMessage: 'Meeting is scheduled for Friday at 8pm 📚', timestamp: 'yesterday', unreadCount: 0 }
      ],
      voiceRooms: [
        { id: 'room1', name: 'Romance Readers Hangout', participants: 12, host: { name: 'Bella S.', image: 'https://i.pravatar.cc/40?img=25' }, tags: ['💕 Hot', 'Discussion'] },
        { id: 'room2', name: 'Mystery Ch. 4 Deep Dive', participants: 8, host: { name: 'The Book Detectives', image: 'https://i.pravatar.cc/40?img=32' }, tags: ['🔍 Mystery', 'Deep'] },
        { id: 'room3', name: 'Writing Sprint: 25min', participants: 15, host: { name: 'Author Circle', image: 'https://i.pravatar.cc/40?img=41' }, tags: ['Creative', 'Write'] }
      ],
      recentActivity: [
        { id: 'activity1', icon: '📚', description: 'Sarah posted in Fantasy Board', timestamp: '3h ago' },
        { id: 'activity2', icon: '📖', description: 'New Voice Room "Sci-Fi Talk"', timestamp: '5h ago' },
        { id: 'activity3', icon: '🔗', description: '3 readers matched with you', timestamp: '8h ago' }
      ],
      suggestedUsers: [
        { id: 'user1', name: 'Alex M.', profilePicture: 'https://i.pravatar.cc/50?img=16', tags: ['Fantasy'], isFavorited: false },
        { id: 'user2', name: 'Jordan T.', profilePicture: 'https://i.pravatar.cc/50?img=28', tags: ['Sci-Fi'], isFavorited: false },
        { id: 'user3', name: 'Casey L.', profilePicture: 'https://i.pravatar.cc/50?img=35', tags: ['Mystery'], isFavorited: false }
      ]
    };
    
    res.json({ success: true, dashboard: dashboardData });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error loading dashboard' });
  }
});

module.exports = router;