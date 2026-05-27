const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const User = require('../models/User');
const VoiceRoom = require('../models/VoiceRoom');
const DiscussionThread = require('../models/DiscussionThread');
const Circle = require('../models/Circle');
const Notification = require('../models/Notification');
const Conversation = require('../models/Conversation');

// GET /api/dashboard/:userId
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }
    
    const user = await User.findById(userId).select('-password -verificationCode -resetToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // 1. Get real notifications
    const realNotifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
      
    const notifications = realNotifications.map(n => ({
      id: n._id,
      type: n.type,
      title: n.title,
      message: n.message,
      timestamp: n.createdAt,
      read: n.read,
      icon: n.icon || (n.type === 'match' ? '🔗' : n.type === 'message' ? '💬' : '📌'),
      actionUrl: n.actionUrl || '#'
    }));

    // 2. Get real voice rooms
    const activeVoiceRooms = await VoiceRoom.find({ status: { $in: ['active', 'live'] } })
      .populate('host', 'name profilePicture')
      .limit(3)
      .lean();
      
    const voiceRooms = activeVoiceRooms.map(room => ({
      id: room._id,
      name: room.name,
      participants: room.participants?.length || 0,
      host: { 
        name: room.host?.name || 'Litlink Host', 
        image: room.host?.profilePicture || 'https://i.pravatar.cc/40?img=1' 
      },
      tags: [room.genre || 'General', room.isPrivate ? 'Private' : 'Public']
    }));

    // 3. Trending circles by real activity (posts, engagement, member activity, recency)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const circleActivity = await DiscussionThread.aggregate([
      {
        $match: {
          isDeleted: false,
          circleId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$circleId',
          activeDiscussions: {
            $sum: {
              $cond: [{ $gte: ['$lastActivity', sevenDaysAgo] }, 1, 0]
            }
          },
          latestPosts: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', oneDayAgo] }, 1, 0]
            }
          },
          recentEngagement: {
            $sum: {
              $add: [
                { $ifNull: ['$commentCount', 0] },
                { $ifNull: ['$likeCount', 0] },
                {
                  $cond: [
                    { $gte: ['$lastActivity', sevenDaysAgo] },
                    { $ifNull: ['$views', 0] },
                    0
                  ]
                }
              ]
            }
          },
          latestActivityAt: { $max: { $ifNull: ['$lastActivity', '$createdAt'] } },
          activeMemberSet: { $addToSet: '$author' }
        }
      },
      {
        $project: {
          activeDiscussions: 1,
          latestPosts: 1,
          recentEngagement: 1,
          latestActivityAt: 1,
          activeMembers: { $size: '$activeMemberSet' }
        }
      }
    ]);

    const activityByCircleId = new Map(
      circleActivity.map(item => [item._id.toString(), item])
    );

    const activityCircleIds = Array.from(activityByCircleId.keys()).map(
      id => new mongoose.Types.ObjectId(id)
    );

    const circleDocs = await Circle.find(
      activityCircleIds.length ? { _id: { $in: activityCircleIds } } : {}
    )
      .select('circleId name icon genre stats members createdAt')
      .lean();

    // If activity is sparse, backfill with largest circles so the section is never fake.
    if (circleDocs.length < 6) {
      const existingIds = new Set(circleDocs.map(circle => circle._id.toString()));
      const fallbackCircles = await Circle.find({
        _id: { $nin: Array.from(existingIds).map(id => new mongoose.Types.ObjectId(id)) }
      })
        .sort({ 'stats.memberCount': -1, createdAt: -1 })
        .limit(6 - circleDocs.length)
        .select('circleId name icon genre stats members createdAt')
        .lean();
      circleDocs.push(...fallbackCircles);
    }

    const trendingCircles = circleDocs.map(circle => {
      const activity = activityByCircleId.get(circle._id.toString()) || {};
      const memberCount = circle.stats?.memberCount || circle.members?.length || 0;
      const activeToday = circle.stats?.activeToday || 0;
      const activeDiscussions = activity.activeDiscussions || 0;
      const latestPosts = activity.latestPosts || 0;
      const recentEngagement = activity.recentEngagement || 0;
      const activeMembers = activity.activeMembers || 0;
      const lastActivityAt = activity.latestActivityAt || circle.createdAt;
      const hoursSinceLastActivity = lastActivityAt
        ? Math.max(0, (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60))
        : 168;
      const recencyBoost = Math.max(0, 72 - hoursSinceLastActivity);

      const activityScore = (
        (activeDiscussions * 8) +
        (latestPosts * 6) +
        (recentEngagement * 0.3) +
        (activeMembers * 4) +
        (activeToday * 5) +
        (memberCount * 0.5) +
        recencyBoost
      );

      return {
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        icon: circle.icon || '📚',
        genre: circle.genre || 'General',
        memberCount,
        activeDiscussions,
        recentEngagement: Math.round(recentEngagement),
        latestPosts,
        activeMembers,
        lastActivityAt,
        activityScore: Math.round(activityScore)
      };
    })
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 6);

    // 4. Get active chats
    const conversations = await Conversation.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate('participants', 'name profilePicture')
      .limit(3)
      .lean();
      
    const activeChats = conversations.map(conv => {
      const otherUser = conv.participants.find(p => p._id.toString() !== userId);
      return {
        id: conv._id,
        name: otherUser?.name || 'Chat',
        avatar: otherUser?.profilePicture || 'https://i.pravatar.cc/60?img=1',
        lastMessage: conv.lastMessagePreview || 'No messages yet',
        timestamp: conv.updatedAt,
        unreadCount: conv.unreadCount ? (conv.unreadCount[userId] || 0) : 0
      };
    });

    // 5. Get suggested circles (renamed from book clubs)
    const suggestedCircles = await Circle.find({ 'settings.isPrivate': false })
      .sort({ 'stats.memberCount': -1 })
      .limit(3)
      .lean();
      
    const suggestedClubs = suggestedCircles.map(circle => ({
      id: circle._id,
      name: circle.name,
      description: circle.description,
      icon: circle.icon || '📚',
      members: circle.stats?.memberCount || circle.members?.length || 0,
      currentBook: circle.currentBook || 'Reading session in progress'
    }));
    
    const dashboardData = {
      user: {
        name: user.name,
        email: user.email,
        username: user.username || user.email?.split('@')[0] || 'user',
        profilePicture: user.profilePicture || `https://i.pravatar.cc/80?img=1`,
        favoriteGenres: user.favoriteGenres || ['Magical Realism'],
        bio: user.bio,
        location: user.location,
        readingGoal: user.readingGoal || 12,
        completionPercentage: user.completionPercentage || 0
      },
      stats: {
        totalMatches: user.matches?.length || 0,
        activeChats: activeChats.length,
        joinedBoards: user.joinedCircles?.length || 0,
        booksRead: user.booksRead?.length || 0,
        unreadNotifications: notifications.filter(n => !n.read).length
      },
      notifications: notifications,
      topMatches: [], // Match logic is separate but can be added if needed
      trendingCircles: trendingCircles,
      // Backward-compat alias used by existing dashboard clients.
      trendingBoards: trendingCircles,
      activeChats: activeChats,
      voiceRooms: voiceRooms,
      suggestedClubs: suggestedClubs,
      recentActivity: [] // Can be fetched from UserActivity model if needed
    };
    
    res.json({ success: true, dashboard: dashboardData });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error loading dashboard' });
  }
});

module.exports = router;
