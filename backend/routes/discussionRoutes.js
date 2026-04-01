const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DiscussionThread = require('../models/DiscussionThread');
const Circle = require('../models/Circle');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

// ===== HELPER FUNCTIONS =====

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

async function getCommunityHighlights() {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const mostDiscussed = await DiscussionThread.findOne({
      createdAt: { $gte: oneWeekAgo },
      isDeleted: false
    })
      .sort({ commentCount: -1 })
      .select('title commentCount views');

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const genreStats = await DiscussionThread.aggregate([
      {
        $match: {
          createdAt: { $gte: threeDaysAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$genre',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const activeUsers = await DiscussionThread.aggregate([
      {
        $match: {
          lastActivity: { $gte: oneDayAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          uniqueUsers: { $addToSet: '$lastCommentBy' }
        }
      },
      {
        $project: {
          count: { $size: '$uniqueUsers' }
        }
      }
    ]);

    return {
      mostDiscussed: mostDiscussed ? {
        title: mostDiscussed.title,
        comments: mostDiscussed.commentCount,
        views: mostDiscussed.views
      } : null,
      trendingGenre: genreStats[0] ? {
        genre: genreStats[0]._id,
        threadCount: genreStats[0].count
      } : null,
      activeUsers: activeUsers[0]?.count || 0,
      totalThreads: await DiscussionThread.countDocuments({ isDeleted: false }),
      totalComments: await DiscussionThread.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$commentCount' } } }
      ]).then(result => result[0]?.total || 0)
    };
  } catch (error) {
    console.error('Error getting highlights:', error);
    return {
      mostDiscussed: null,
      trendingGenre: null,
      activeUsers: 0,
      totalThreads: 0,
      totalComments: 0
    };
  }
}

// ===== CIRCLE DISCOVERY ROUTES =====

// Get all available circles for discovery
router.get('/circles/all', authMiddleware, async (req, res) => {
  try {
    const circles = await Circle.find({})
      .populate('createdBy', 'name username')
      .lean();
    
    // Get circles user is already a member of
    const userCircles = await Circle.find({ 'members.user': req.userId }).select('circleId');
    const userCircleIds = userCircles.map(c => c.circleId);
    
    const circlesWithStatus = circles.map(circle => ({
      id: circle._id,
      circleId: circle.circleId,
      name: circle.name,
      description: circle.description,
      icon: circle.icon,
      genre: circle.genre,
      memberCount: circle.stats.memberCount,
      threadCount: circle.stats.threadCount,
      isMember: userCircleIds.includes(circle.circleId),
      hasPendingRequest: circle.pendingRequests.some(req => req.user.toString() === req.userId),
      createdBy: circle.createdBy,
      createdAt: circle.createdAt
    }));
    
    res.json({
      success: true,
      circles: circlesWithStatus
    });
  } catch (error) {
    console.error('Error fetching all circles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching circles',
      error: error.message 
    });
  }
});

// Get recommended circles based on user's reading preferences
router.get('/circles/recommended', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('favoriteGenres');
    const userGenres = user?.favoriteGenres || [];
    
    let recommendedCircles = [];
    
    if (userGenres.length > 0) {
      recommendedCircles = await Circle.find({
        genre: { $in: userGenres },
        'members.user': { $ne: req.userId }
      })
        .limit(5)
        .lean();
    }
    
    if (recommendedCircles.length < 5) {
      const popularCircles = await Circle.find({
        'members.user': { $ne: req.userId }
      })
        .sort({ 'stats.memberCount': -1 })
        .limit(5 - recommendedCircles.length)
        .lean();
      
      recommendedCircles = [...recommendedCircles, ...popularCircles];
    }
    
    res.json({
      success: true,
      circles: recommendedCircles.map(circle => ({
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        description: circle.description,
        icon: circle.icon,
        genre: circle.genre,
        memberCount: circle.stats.memberCount,
        threadCount: circle.stats.threadCount
      }))
    });
  } catch (error) {
    console.error('Error fetching recommended circles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching recommendations',
      error: error.message 
    });
  }
});

// ===== CIRCLE MEMBERSHIP ROUTES =====

// Get user's circles
router.get('/user/circles', authMiddleware, async (req, res) => {
  try {
    const circles = await Circle.find({
      'members.user': req.userId
    }).populate('members.user', 'name username profilePicture');
    
    const pendingRequests = await Circle.find({
      'pendingRequests.user': req.userId
    }).select('name circleId description icon');
    
    res.json({
      success: true,
      circles: circles.map(circle => ({
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        description: circle.description,
        icon: circle.icon,
        genre: circle.genre,
        memberCount: circle.stats.memberCount,
        threadCount: circle.stats.threadCount,
        role: circle.members.find(m => m.user._id.toString() === req.userId)?.role || 'member',
        joinedAt: circle.members.find(m => m.user._id.toString() === req.userId)?.joinedAt
      })),
      pendingRequests: pendingRequests.map(req => ({
        circleId: req.circleId,
        name: req.name,
        description: req.description,
        icon: req.icon,
        requestedAt: req.pendingRequests.find(r => r.user.toString() === req.userId)?.requestedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching user circles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching circles',
      error: error.message 
    });
  }
});

// Get circle details
router.get('/circles/:circleId/details', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    
    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId)
        .populate('members.user', 'name username profilePicture')
        .populate('createdBy', 'name username profilePicture')
        .populate('moderators', 'name username profilePicture');
    } else {
      circle = await Circle.findOne({ circleId: circleId })
        .populate('members.user', 'name username profilePicture')
        .populate('createdBy', 'name username profilePicture')
        .populate('moderators', 'name username profilePicture');
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }
    
    const isMember = circle.isMember(req.userId);
    const pendingRequest = circle.pendingRequests.find(r => r.user.toString() === req.userId);
    const userRole = circle.members.find(m => m.user._id.toString() === req.userId)?.role;
    
    res.json({
      success: true,
      circle: {
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        description: circle.description,
        icon: circle.icon,
        genre: circle.genre,
        createdBy: circle.createdBy,
        moderators: circle.moderators,
        settings: circle.settings,
        stats: circle.stats,
        createdAt: circle.createdAt,
        isMember,
        userRole,
        pendingRequest: !!pendingRequest,
        members: circle.members.map(m => ({
          user: m.user,
          role: m.role,
          joinedAt: m.joinedAt
        })),
        pendingRequestsCount: circle.pendingRequests.length
      }
    });
  } catch (error) {
    console.error('Error fetching circle details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching circle details',
      error: error.message 
    });
  }
});

// Request to join circle
router.post('/circles/:circleId/request', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { message } = req.body;
    
    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }
    
    if (circle.isMember(req.userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'You are already a member of this circle' 
      });
    }
    
    const request = await circle.requestMembership(req.userId, message);
    
    try {
      const io = global.io;
      if (io) {
        const user = await User.findById(req.userId).select('name profilePicture');
        const moderatorIds = circle.members
          .filter(m => m.role === 'moderator' || m.user.toString() === circle.createdBy.toString())
          .map(m => m.user.toString());
        
        moderatorIds.forEach(modId => {
          io.to(`user-${modId}`).emit('circle-join-request', {
            circleId: circle.circleId,
            circleName: circle.name,
            userId: req.userId,
            userName: user.name,
            userAvatar: user.profilePicture,
            message: message,
            requestId: request._id
          });
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Join request sent successfully',
      request
    });
  } catch (error) {
    console.error('Error requesting circle membership:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error requesting membership'
    });
  }
});

// Approve circle request
router.post('/circles/:circleId/requests/:requestId/approve', authMiddleware, async (req, res) => {
  try {
    const { circleId, requestId } = req.params;
    
    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }
    
    if (!circle.isModerator(req.userId) && circle.createdBy.toString() !== req.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to approve requests' 
      });
    }
    
    const request = circle.pendingRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }
    
    await circle.approveRequest(request.user, req.userId);
    
    try {
      const io = global.io;
      if (io) {
        io.to(`user-${request.user}`).emit('circle-request-approved', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `Your request to join ${circle.name} has been approved!`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Request approved successfully'
    });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error approving request'
    });
  }
});

// Decline circle request
router.post('/circles/:circleId/requests/:requestId/decline', authMiddleware, async (req, res) => {
  try {
    const { circleId, requestId } = req.params;
    
    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }
    
    if (!circle.isModerator(req.userId) && circle.createdBy.toString() !== req.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to decline requests' 
      });
    }
    
    const request = circle.pendingRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }
    
    await circle.declineRequest(request.user, req.userId);
    
    try {
      const io = global.io;
      if (io) {
        io.to(`user-${request.user}`).emit('circle-request-declined', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `Your request to join ${circle.name} was declined.`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Request declined'
    });
  } catch (error) {
    console.error('Error declining request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error declining request'
    });
  }
});

// ===== CIRCLE THREAD ROUTES =====

// Get threads for a specific circle
router.get('/circles/:circleId/threads', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const {
      page = 1,
      limit = 10,
      sort = 'latest'
    } = req.query;

    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }

    if (!circle.isMember(req.userId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be a member to view circle discussions' 
      });
    }

    const query = { 
      circleId: circle._id,
      isDeleted: false 
    };

    let sortOption = {};
    switch (sort) {
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'replies':
        sortOption = { commentCount: -1 };
        break;
      case 'views':
        sortOption = { views: -1 };
        break;
      case 'likes':
        sortOption = { likeCount: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const threads = await DiscussionThread.find(query)
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DiscussionThread.countDocuments(query);

    res.json({
      success: true,
      threads: threads.map(thread => ({
        ...thread,
        isCircleThread: true,
        circleName: circle.name,
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: thread.commentCount || 0,
        likeCount: thread.likeCount || 0
      })),
      circle: {
        id: circle._id,
        name: circle.name,
        circleId: circle.circleId,
        description: circle.description,
        memberCount: circle.stats.memberCount,
        isMember: true
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + threads.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching circle threads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching circle threads',
      error: error.message 
    });
  }
});

// Create a new circle thread
router.post('/circles/threads', authMiddleware, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      type, 
      circleId,
      circleName, 
      tags, 
      poll, 
      event 
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    let circle;
    if (circleId && mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId || circleName?.toLowerCase().replace(/\s+/g, '-') });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }

    if (!circle.isMember(req.userId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be a member of this circle to post' 
      });
    }

    const thread = new DiscussionThread({
      title,
      content,
      author: req.userId,
      circle: circle.name,
      circleId: circle._id,
      type: type || 'discussion',
      tags: tags || [],
      isCircleThread: true,
      isPublic: false,
      genre: circle.genre
    });

    if (type === 'poll' && poll) {
      thread.poll = {
        question: poll.question,
        options: poll.options.map(opt => ({ 
          text: opt, 
          votes: [] 
        }))
      };
    }

    if (type === 'event' && event) {
      thread.event = {
        date: new Date(event.date),
        duration: event.duration,
        type: event.type,
        attendees: []
      };
    }

    await thread.save();

    circle.stats.threadCount += 1;
    await circle.save();

    await thread.populate('author', 'name username profilePicture');

    try {
      const io = global.io;
      if (io) {
        const memberUserIds = circle.members.map(m => m.user.toString());
        
        memberUserIds.forEach(userId => {
          io.to(`user-${userId}`).emit('new-circle-thread', {
            thread: {
              ...thread.toObject(),
              isCircleThread: true,
              circleName: circle.name
            },
            circleId: circle.circleId,
            circleName: circle.name,
            message: `New ${type} in ${circle.name}: "${title}"`
          });
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    res.status(201).json({
      success: true,
      message: 'Circle thread created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0,
        isCircleThread: true
      }
    });
  } catch (error) {
    console.error('Error creating circle thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating circle thread',
      error: error.message 
    });
  }
});

// Create a circle poll
router.post('/circles/polls', authMiddleware, async (req, res) => {
  try {
    const { circleId, circleName, question, options } = req.body;

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Question and at least 2 options are required' 
      });
    }

    let circle;
    if (circleId && mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId: circleId || circleName?.toLowerCase().replace(/\s+/g, '-') });
    }
    
    if (!circle) {
      return res.status(404).json({ 
        success: false, 
        message: 'Circle not found' 
      });
    }

    if (!circle.isMember(req.userId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be a member of this circle to create a poll' 
      });
    }

    const thread = new DiscussionThread({
      title: `📊 POLL: ${question}`,
      content: `Cast your vote in this ${circle.name} poll!`,
      author: req.userId,
      circle: circle.name,
      circleId: circle._id,
      type: 'poll',
      tags: ['poll'],
      isCircleThread: true,
      isPublic: false,
      genre: circle.genre,
      poll: {
        question,
        options: options.map(opt => ({ 
          text: opt, 
          votes: [] 
        }))
      }
    });

    await thread.save();

    circle.stats.threadCount += 1;
    await circle.save();

    await thread.populate('author', 'name username profilePicture');

    res.status(201).json({
      success: true,
      message: 'Poll created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0,
        isCircleThread: true
      }
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating poll',
      error: error.message 
    });
  }
});

// Vote in a poll
router.post('/threads/:threadId/poll/vote', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { optionIndex } = req.body;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    if (thread.type !== 'poll') {
      return res.status(400).json({ 
        success: false, 
        message: 'This thread is not a poll' 
      });
    }

    await thread.voteInPoll(req.userId, optionIndex);

    const totalVotes = thread.poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const results = thread.poll.options.map(opt => ({
      text: opt.text,
      votes: opt.votes.length,
      percentage: totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0
    }));

    res.json({
      success: true,
      message: 'Vote recorded',
      results,
      totalVotes
    });
  } catch (error) {
    console.error('Error voting in poll:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error voting in poll',
      error: error.message 
    });
  }
});

// RSVP to event
router.post('/threads/:threadId/event/rsvp', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    if (thread.type !== 'event') {
      return res.status(400).json({ 
        success: false, 
        message: 'This thread is not an event' 
      });
    }

    await thread.rsvpToEvent(req.userId);

    res.json({
      success: true,
      message: 'RSVP updated',
      attendees: thread.event.attendees.length,
      isAttending: thread.event.attendees.includes(req.userId)
    });
  } catch (error) {
    console.error('Error RSVPing to event:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error RSVPing to event',
      error: error.message 
    });
  }
});

// ===== PUBLIC DISCUSSION ROUTES =====

// Get public discussions
router.get('/public', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'latest',
      genre,
      tag,
      search
    } = req.query;

    const query = { 
      isDeleted: false,
      isPublic: true,
      circleId: { $exists: false }
    };
    
    if (genre && genre !== 'All Genres') {
      query.genre = genre;
    }
    
    if (tag) {
      query.tags = tag;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    let sortOption = {};
    switch (sort) {
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'replies':
        sortOption = { commentCount: -1 };
        break;
      case 'views':
        sortOption = { views: -1 };
        break;
      case 'likes':
        sortOption = { likeCount: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const threads = await DiscussionThread.find(query)
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DiscussionThread.countDocuments(query);

    res.json({
      success: true,
      threads: threads.map(thread => ({
        ...thread,
        isPublic: true,
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: thread.commentCount || 0,
        likeCount: thread.likeCount || 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + threads.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching public discussions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching public discussions',
      error: error.message 
    });
  }
});

// Get all activity (mix of circle and public)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'latest'
    } = req.query;

    const query = { isDeleted: false };
    
    let sortOption = {};
    switch (sort) {
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'replies':
        sortOption = { commentCount: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const threads = await DiscussionThread.find(query)
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DiscussionThread.countDocuments(query);

    res.json({
      success: true,
      threads: threads.map(thread => ({
        ...thread,
        isCircleThread: !!thread.circleId,
        isPublic: !thread.circleId,
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: thread.commentCount || 0,
        likeCount: thread.likeCount || 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + threads.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching all activity:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching all activity',
      error: error.message 
    });
  }
});

// Get highlights only
router.get('/highlights', authMiddleware, async (req, res) => {
  try {
    const highlights = await getCommunityHighlights();
    res.json({
      success: true,
      highlights
    });
  } catch (error) {
    console.error('Error fetching highlights:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching highlights',
      error: error.message 
    });
  }
});

// ===== THREAD ROUTES =====

// Get all threads with filtering, sorting, and pagination
router.get('/threads', authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'latest',
      genre,
      tag,
      search,
      featured,
      userId
    } = req.query;

    const query = { isDeleted: false };
    
    if (genre && genre !== 'All Genres') {
      query.genre = genre;
    }
    
    if (tag) {
      query.tags = tag;
    }
    
    if (featured === 'true') {
      query.isFeatured = true;
    }
    
    if (userId) {
      query.author = userId;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    let sortOption = {};
    switch (sort) {
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'activity':
        sortOption = { lastActivity: -1 };
        break;
      case 'popular':
        sortOption = { views: -1, likeCount: -1, commentCount: -1 };
        break;
      case 'mostReplies':
        sortOption = { commentCount: -1 };
        break;
      case 'mostLikes':
        sortOption = { likeCount: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const pinnedThreads = await DiscussionThread.find({ ...query, isPinned: true })
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .limit(parseInt(limit))
      .lean();

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const regularThreads = await DiscussionThread.find({ ...query, isPinned: false })
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const threads = [...pinnedThreads, ...regularThreads];
    const total = await DiscussionThread.countDocuments(query);
    const pinnedCount = await DiscussionThread.countDocuments({ ...query, isPinned: true });

    const highlights = await getCommunityHighlights();

    res.json({
      success: true,
      threads: threads.map(thread => ({
        ...thread,
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: thread.commentCount || 0,
        likeCount: thread.likeCount || 0,
        isCircleThread: !!thread.circleId,
        isPublic: !thread.circleId
      })),
      highlights,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        pinnedCount
      }
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching threads',
      error: error.message 
    });
  }
});

// Get single thread by ID
router.get('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid thread ID' 
      });
    }

    const thread = await DiscussionThread.findById(threadId)
      .populate('author', 'name username profilePicture')
      .populate('lastCommentBy', 'name username')
      .populate({
        path: 'comments',
        populate: [
          {
            path: 'user',
            select: 'name username profilePicture'
          },
          {
            path: 'replies',
            populate: {
              path: 'user',
              select: 'name username profilePicture'
            }
          }
        ],
        options: { sort: { createdAt: -1 } }
      })
      .lean();

    if (!thread || thread.isDeleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    await DiscussionThread.findByIdAndUpdate(threadId, { $inc: { views: 1 } });

    const isLiked = thread.likes && thread.likes.includes(req.userId);

    let pollResults = null;
    if (thread.type === 'poll' && thread.poll) {
      const totalVotes = thread.poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
      pollResults = {
        question: thread.poll.question,
        options: thread.poll.options.map(opt => ({
          text: opt.text,
          votes: opt.votes?.length || 0,
          percentage: totalVotes > 0 ? Math.round(((opt.votes?.length || 0) / totalVotes) * 100) : 0,
          userVoted: opt.votes?.includes(req.userId) || false
        })),
        totalVotes
      };
    }

    res.json({
      success: true,
      thread: {
        ...thread,
        timeAgo: getTimeAgo(thread.createdAt),
        isCircleThread: !!thread.circleId,
        poll: pollResults
      },
      isLiked
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching thread',
      error: error.message 
    });
  }
});

// Create new thread (public discussion)
router.post('/threads', authMiddleware, async (req, res) => {
  try {
    const { title, content, genre, tags, bookReferences, category } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    const thread = new DiscussionThread({
      title,
      content,
      author: req.userId,
      genre: genre || 'General',
      tags: tags || [],
      bookReferences: bookReferences || [],
      category: category || 'general',
      isPublic: true,
      isCircleThread: false
    });

    await thread.save();
    await thread.populate('author', 'name username profilePicture');

    try {
      const io = global.io;
      if (io) {
        io.emit('new-thread', {
          thread,
          message: `New public discussion: "${title}"`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    res.status(201).json({
      success: true,
      message: 'Discussion created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0
      }
    });
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating thread',
      error: error.message 
    });
  }
});

// Update thread
router.put('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { title, content, genre, tags } = req.body;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    if (thread.author.toString() !== req.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to edit this thread' 
      });
    }

    if (title) thread.title = title;
    if (content) thread.content = content;
    if (genre) thread.genre = genre;
    if (tags) thread.tags = tags;

    thread.updatedAt = new Date();
    await thread.save();

    res.json({
      success: true,
      message: 'Thread updated successfully',
      thread
    });
  } catch (error) {
    console.error('Error updating thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating thread',
      error: error.message 
    });
  }
});

// Delete thread (soft delete)
router.delete('/threads/:threadId', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const user = await User.findById(req.userId);
    if (thread.author.toString() !== req.userId && !user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this thread' 
      });
    }

    thread.isDeleted = true;
    thread.deletedAt = new Date();
    await thread.save();

    res.json({
      success: true,
      message: 'Thread deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting thread',
      error: error.message 
    });
  }
});

// Like/unlike thread
router.post('/threads/:threadId/like', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const likeIndex = thread.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      thread.likes.push(req.userId);
      thread.likeCount += 1;
    } else {
      thread.likes.splice(likeIndex, 1);
      thread.likeCount -= 1;
    }

    await thread.save();

    res.json({
      success: true,
      message: 'Thread like toggled',
      likeCount: thread.likeCount,
      isLiked: thread.likes.includes(req.userId)
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling like',
      error: error.message 
    });
  }
});

// ===== COMMENT ROUTES =====

// Add comment to thread
router.post('/threads/:threadId/comments', authMiddleware, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, parentCommentId } = req.body;

    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Comment content is required' 
      });
    }

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const comment = {
      user: req.userId,
      content,
      likes: [],
      likeCount: 0,
      replies: [],
      createdAt: new Date()
    };

    if (parentCommentId) {
      const parentComment = thread.comments.id(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Parent comment not found' 
        });
      }
      parentComment.replies.push(comment);
    } else {
      thread.comments.push(comment);
    }

    thread.commentCount += 1;
    thread.lastActivity = new Date();
    thread.lastCommentBy = req.userId;
    
    await thread.save();

    let newComment;
    if (parentCommentId) {
      const parentComment = thread.comments.id(parentCommentId);
      newComment = parentComment.replies[parentComment.replies.length - 1];
    } else {
      newComment = thread.comments[thread.comments.length - 1];
    }

    const user = await User.findById(req.userId).select('name username profilePicture');
    newComment.user = user;

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: newComment,
      commentCount: thread.commentCount
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding comment',
      error: error.message 
    });
  }
});

// Like/unlike comment
router.post('/threads/:threadId/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const { threadId, commentId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const comment = thread.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    const likeIndex = comment.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      comment.likes.push(req.userId);
      comment.likeCount += 1;
    } else {
      comment.likes.splice(likeIndex, 1);
      comment.likeCount -= 1;
    }

    await thread.save();

    res.json({
      success: true,
      message: 'Comment like toggled',
      likeCount: comment.likeCount,
      isLiked: comment.likes.includes(req.userId)
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error toggling comment like',
      error: error.message 
    });
  }
});

// Delete comment
router.delete('/threads/:threadId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { threadId, commentId } = req.params;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const comment = thread.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    const user = await User.findById(req.userId);
    if (comment.user.toString() !== req.userId && !user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this comment' 
      });
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.content = '[deleted]';
    
    thread.commentCount -= 1;
    await thread.save();

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting comment',
      error: error.message 
    });
  }
});

// ===== STATS ROUTES =====

// Get genre stats
router.get('/stats/genres', authMiddleware, async (req, res) => {
  try {
    const genreStats = await DiscussionThread.aggregate([
      {
        $match: { isDeleted: false }
      },
      {
        $group: {
          _id: '$genre',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalComments: { $sum: '$commentCount' },
          totalLikes: { $sum: '$likeCount' }
        }
      },
      {
        $project: {
          genre: '$_id',
          count: 1,
          totalViews: 1,
          totalComments: 1,
          totalLikes: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      genreStats
    });
  } catch (error) {
    console.error('Error getting genre stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting genre stats',
      error: error.message 
    });
  }
});

// Get user's threads
router.get('/user/:userId/threads', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const threads = await DiscussionThread.find({ 
      author: userId,
      isDeleted: false 
    })
      .populate('author', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await DiscussionThread.countDocuments({ 
      author: userId,
      isDeleted: false 
    });

    res.json({
      success: true,
      threads: threads.map(thread => ({
        ...thread,
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: thread.commentCount || 0,
        likeCount: thread.likeCount || 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user threads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user threads',
      error: error.message 
    });
  }
});

module.exports = router;