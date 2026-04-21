// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const UserActivity = require('../models/UserActivity');
const { requireAdmin } = require('../middleware/adminAuth');

// GET /api/analytics/activity - Get real user activity data
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    // Get all activity records in date range
    const activities = await UserActivity.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$date',
          totalUsers: { $sum: 1 },
          totalLogins: { $sum: '$loginCount' },
          totalMessages: { $sum: '$messagesSent' },
          totalDiscussions: { $sum: '$discussionsCreated' },
          totalReplies: { $sum: '$discussionReplies' },
          totalVoiceJoins: { $sum: '$voiceRoomJoined' },
          totalMatches: { $sum: '$matchesMade' },
          totalBooksAdded: { $sum: '$booksAdded' },
          avgActivityScore: { $avg: '$activityScore' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get daily new user counts
    const newUsers = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get daily active users (users who logged in that day)
    const activeUsers = await UserActivity.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          loginCount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: '$date',
          activeUsers: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get cumulative user growth
    const cumulativeUsers = [];
    let cumulative = 0;
    const newUsersMap = new Map(newUsers.map(u => [u._id, u.count]));
    const activeUsersMap = new Map(activeUsers.map(u => [u._id.toISOString().split('T')[0], u.activeUsers]));
    const activityMap = new Map(activities.map(a => [a._id.toISOString().split('T')[0], a]));
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const newCount = newUsersMap.get(dateStr) || 0;
      cumulative += newCount;
      
      cumulativeUsers.push({
        date: dateStr,
        newUsers: newCount,
        cumulativeUsers: cumulative,
        activeUsers: activeUsersMap.get(dateStr) || 0,
        activity: activityMap.get(dateStr) || {
          totalMessages: 0,
          totalDiscussions: 0,
          totalReplies: 0,
          totalVoiceJoins: 0,
          avgActivityScore: 0
        }
      });
    }
    
    // Calculate trends
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - days);
    
    const previousPeriodUsers = await User.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    });
    
    const currentPeriodUsers = cumulative;
    const userGrowthPercent = previousPeriodUsers > 0 
      ? ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100 
      : 0;
    
    // Calculate engagement rate (active users / total users)
    const totalUsers = await User.countDocuments();
    const avgActiveUsers = cumulativeUsers.reduce((sum, day) => sum + day.activeUsers, 0) / days;
    const engagementRate = totalUsers > 0 ? (avgActiveUsers / totalUsers) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        dailyData: cumulativeUsers,
        summary: {
          totalUsers,
          totalActiveUsers: cumulativeUsers.reduce((sum, day) => sum + day.activeUsers, 0),
          avgDailyActiveUsers: avgActiveUsers,
          totalNewUsers: cumulative,
          userGrowthPercent: userGrowthPercent.toFixed(1),
          engagementRate: engagementRate.toFixed(1),
          periodDays: days
        },
        metrics: {
          totalMessages: activities.reduce((sum, a) => sum + a.totalMessages, 0),
          totalDiscussions: activities.reduce((sum, a) => sum + a.totalDiscussions, 0),
          totalReplies: activities.reduce((sum, a) => sum + a.totalReplies, 0),
          totalVoiceJoins: activities.reduce((sum, a) => sum + a.totalVoiceJoins, 0),
          totalMatches: activities.reduce((sum, a) => sum + a.totalMatches, 0),
          totalBooksAdded: activities.reduce((sum, a) => sum + a.totalBooksAdded, 0)
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching activity data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity data'
    });
  }
});

// GET /api/analytics/activity/top-users - Get most active users
router.get('/activity/top-users', requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    const topUsers = await UserActivity.aggregate([
      {
        $match: {
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalActivityScore: { $sum: '$activityScore' },
          totalLogins: { $sum: '$loginCount' },
          totalMessages: { $sum: '$messagesSent' },
          totalDiscussions: { $sum: '$discussionsCreated' },
          totalReplies: { $sum: '$discussionReplies' },
          totalVoiceJoins: { $sum: '$voiceRoomJoined' },
          activeDays: { $sum: 1 }
        }
      },
      {
        $sort: { totalActivityScore: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Get user details
    const userIds = topUsers.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email profilePicture favoriteGenres booksRead');
    
    const usersMap = new Map(users.map(u => [u._id.toString(), u]));
    
    const results = topUsers.map(tu => ({
      user: usersMap.get(tu._id.toString()),
      stats: {
        activityScore: tu.totalActivityScore,
        logins: tu.totalLogins,
        messages: tu.totalMessages,
        discussions: tu.totalDiscussions,
        replies: tu.totalReplies,
        voiceJoins: tu.totalVoiceJoins,
        activeDays: tu.activeDays
      }
    }));
    
    res.json({
      success: true,
      users: results
    });
    
  } catch (error) {
    console.error('Error fetching top users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching top users'
    });
  }
});

module.exports = router;