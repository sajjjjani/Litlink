const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DiscussionThread = require('../models/DiscussionThread');
const Circle = require('../models/Circle');
const CircleRequest = require('../models/CircleRequest');
const User = require('../models/User');
const Activity = require('../models/Activity');
const authMiddleware = require('../middleware/authMiddleware');
const FilterService = require('../services/filterService');
const UNS = require('../services/UserNotificationService');
const upload = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/publicUrl');

// Helper to check if user is suspended
async function isUserSuspended(userId) {
  const user = await User.findById(userId);
  if (!user) return false;
  if (user.isSuspended && user.suspensionEnds && new Date() < user.suspensionEnds) {
    return true;
  }
  if (user.isSuspended && user.suspensionEnds && new Date() >= user.suspensionEnds) {
    user.isSuspended = false;
    user.suspensionEnds = null;
    user.suspensionReason = null;
    await user.save();
    return false;
  }
  return false;
}

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

function normalizeThread(thread) {
  if (!thread) return null;
  
  const normalized = { ...thread };
  
  // Normalize attachments
  if (normalized.attachments && normalized.attachments.length > 0) {
    normalized.attachments = normalized.attachments.map(att => ({
      ...att,
      url: toAbsoluteUrl(att.url)
    }));
  }
  
  // Normalize author profile picture
  if (normalized.author && normalized.author.profilePicture) {
    normalized.author.profilePicture = toAbsoluteUrl(normalized.author.profilePicture);
  }

  normalized.timeAgo = getTimeAgo(normalized.createdAt);
  normalized.isCircleThread = !!normalized.circleId;
  normalized.commentCount = normalized.commentCount || 0;
  normalized.likeCount = normalized.likeCount || 0;
  
  return normalized;
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

router.get('/circles/all', authMiddleware, async (req, res) => {
  try {
    const circles = await Circle.find({})
      .populate('createdBy', 'name username')
      .lean();
    
    const userCircles = await Circle.find({ 'members.user': req.userId }).select('circleId');
    const userCircleIds = userCircles.map(c => c.circleId);
    
    const pendingRequests = await CircleRequest.find({
      senderId: req.userId,
      status: 'pending'
    }).select('circleId');
    const pendingCircleIds = new Set(pendingRequests.map(r => r.circleId.toString()));

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
      hasPendingRequest: pendingCircleIds.has(circle._id.toString()),
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

router.get('/user/circles', authMiddleware, async (req, res) => {
  try {
    const circles = await Circle.find({
      'members.user': req.userId
    }).populate('members.user', 'name username profilePicture');
    
    const pendingRequests = await CircleRequest.find({
      senderId: req.userId,
      status: 'pending'
    }).populate('circleId', 'name circleId description icon');
    
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
      pendingRequests: pendingRequests
        .filter(req => req.circleId)
        .map(req => ({
        circleId: req.circleId.circleId,
        name: req.circleId.name,
        description: req.circleId.description,
        icon: req.circleId.icon,
        requestedAt: req.createdAt
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
        pendingRequestsCount: circle.pendingRequests.length,
        members: circle.members
          .filter(m => m.user) // Ensure user object is not null
          .map(m => ({
            user: m.user,
            role: m.role,
            joinedAt: m.joinedAt
          }))
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


// ── Submit a join request to a circle ─────────────────────────────────────
// Called by the frontend: POST /api/discussions/circles/:circleId/request
router.post('/circles/:circleId/request', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { message = '' } = req.body;

    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId);
    } else {
      circle = await Circle.findOne({ circleId });
    }

    if (!circle) {
      return res.status(404).json({ success: false, message: 'Circle not found' });
    }

    if (circle.isMember(req.userId)) {
      return res.status(400).json({ success: false, message: 'You are already a member of this circle' });
    }

    const existingPendingRequest = await CircleRequest.findOne({
      senderId: req.userId,
      circleId: circle._id,
      status: 'pending'
    });
    if (existingPendingRequest) {
      return res.status(400).json({ success: false, message: 'Join request already pending' });
    }

    // If no approval needed, add directly
    if (!circle.settings.requireApproval) {
      circle.members.push({ user: req.userId, joinedAt: new Date(), role: 'member' });
      circle.stats.memberCount += 1;
      await circle.save();
      return res.json({ success: true, message: `You have joined "${circle.name}"!`, joined: true });
    }

    // Persist canonical request record
    const requester = await User.findById(req.userId).select('name profilePicture');
    const creatorId = (circle.creatorId || circle.createdBy).toString();
    const moderatorIds = [creatorId].filter(id => id !== req.userId.toString());

    if (moderatorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No moderator available to review this request'
      });
    }

    const requestDocs = await Promise.all(
      moderatorIds.map(modId => CircleRequest.create({
        senderId: req.userId,
        receiverId: modId,
        circleId: circle._id,
        status: 'pending',
        message: String(message || '').substring(0, 500)
      }))
    );

    // Keep legacy pendingRequests array in sync for existing UI consumers.
    await circle.requestMembership(req.userId, message);

    // Notify moderators — DB record + real-time socket
    const freshCircle = await Circle.findById(circle._id).populate('moderators', '_id');

    try {
      await UNS.onCircleJoinRequest(requester, freshCircle);
    } catch (unsErr) {
      console.error('[UNS] onCircleJoinRequest error:', unsErr.message);
    }

    try {
      const io = global.io;
      if (io) {
        const modIds = [
          ...freshCircle.moderators.map(m => m._id.toString()),
          freshCircle.createdBy.toString()
        ];
        [...new Set(modIds)].forEach(modId => {
          io.to(`user-${modId}`).emit('circle-join-request', {
            type: 'notification',
            notificationType: 'circle_join_request',
            title: 'New Join Request',
            message: `${requester.name} wants to join "${circle.name}"`,
            circleId: circle.circleId,
            circleName: circle.name,
            requesterId: req.userId,
            requesterName: requester.name,
            timestamp: new Date(),
            requestId: requestDocs[0]._id
          });
        });
      }
    } catch (socketError) {
      console.error('WebSocket error in circle join request:', socketError);
    }

    res.json({
      success: true,
      message: `Join request sent to "${circle.name}"!`,
      joined: false,
      pending: true
    });

  } catch (error) {
    console.error('Error submitting circle join request:', error);
    res.status(500).json({ success: false, message: error.message || 'Error sending join request' });
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
    
    const creatorId = (circle.creatorId || circle.createdBy).toString();
    if (creatorId !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the circle creator can approve requests' 
      });
    }
    
    let request = circle.pendingRequests.id(requestId);
    let canonicalRequest = null;
    if (!request) {
      canonicalRequest = await CircleRequest.findById(requestId);
      if (canonicalRequest && canonicalRequest.circleId.toString() === circle._id.toString()) {
        request = { user: canonicalRequest.senderId };
      }
    }
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }
    
    if (canonicalRequest) {
      await CircleRequest.updateMany(
        {
          senderId: canonicalRequest.senderId,
          circleId: circle._id,
          status: 'pending'
        },
        {
          $set: {
            status: 'accepted',
            actedBy: req.userId,
            actedAt: new Date()
          }
        }
      );
    } else {
      await CircleRequest.updateMany(
        {
          senderId: request.user,
          circleId: circle._id,
          status: 'pending'
        },
        {
          $set: {
            status: 'accepted',
            actedBy: req.userId,
            actedAt: new Date()
          }
        }
      );
    }

    await circle.approveRequest(request.user, req.userId);
    
    // ── Notify the approved user (DB record + real-time) ──────────────────
    try {
      await UNS.onCircleAccepted(request.user, circle);
    } catch (unsErr) {
      console.error('[UNS] onCircleAccepted error:', unsErr.message);
    }

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
    
    const creatorId = (circle.creatorId || circle.createdBy).toString();
    if (creatorId !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the circle creator can decline requests' 
      });
    }
    
    let request = circle.pendingRequests.id(requestId);
    let canonicalRequest = null;
    if (!request) {
      canonicalRequest = await CircleRequest.findById(requestId);
      if (canonicalRequest && canonicalRequest.circleId.toString() === circle._id.toString()) {
        request = { user: canonicalRequest.senderId };
      }
    }
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found' 
      });
    }
    
    if (canonicalRequest) {
      await CircleRequest.updateMany(
        {
          senderId: canonicalRequest.senderId,
          circleId: circle._id,
          status: 'pending'
        },
        {
          $set: {
            status: 'rejected',
            actedBy: req.userId,
            actedAt: new Date()
          }
        }
      );
    } else {
      await CircleRequest.updateMany(
        {
          senderId: request.user,
          circleId: circle._id,
          status: 'pending'
        },
        {
          $set: {
            status: 'rejected',
            actedBy: req.userId,
            actedAt: new Date()
          }
        }
      );
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

// ===== CIRCLE CREATION AND MANAGEMENT ROUTES =====

router.post('/circles/create', authMiddleware, async (req, res) => {
  try {
    const { name, description, icon, genre, settings } = req.body;
    
    if (!name || !description || !genre) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, and genre are required'
      });
    }
    
    const circleId = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const existingCircle = await Circle.findOne({ circleId });
    if (existingCircle) {
      return res.status(400).json({
        success: false,
        message: 'A circle with a similar name already exists'
      });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const circle = new Circle({
      name,
      circleId,
      description,
      icon: icon || '📚',
      genre,
      createdBy: req.userId,
      creatorId: req.userId,
      moderators: [req.userId],
      members: [{
        user: req.userId,
        joinedAt: new Date(),
        role: 'admin'
      }],
      settings: {
        isPrivate: settings?.isPrivate !== undefined ? settings.isPrivate : true,
        requireApproval: settings?.requireApproval !== undefined ? settings.requireApproval : true,
        allowMemberPosts: settings?.allowMemberPosts !== undefined ? settings.allowMemberPosts : true
      },
      stats: {
        memberCount: 1,
        threadCount: 0,
        activeToday: 1
      }
    });
    
    await circle.save();

    try {
      await Activity.create({
        type: 'CIRCLE_CREATED',
        user: req.userId,
        referenceId: circle.circleId,
        message: `Created circle "${circle.name}"`
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }
    
    try {
      const io = global.io;
      if (io) {
        io.to(`user-${req.userId}`).emit('circle-created', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `You successfully created "${circle.name}" circle!`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.status(201).json({
      success: true,
      message: 'Circle created successfully',
      circle: {
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        description: circle.description,
        icon: circle.icon,
        genre: circle.genre,
        memberCount: circle.stats.memberCount,
        isMember: true,
        userRole: 'admin',
        createdAt: circle.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating circle:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating circle'
    });
  }
});

router.get('/circles/my-circles', authMiddleware, async (req, res) => {
  try {
    const circles = await Circle.find({ createdBy: req.userId })
      .populate('members.user', 'name username profilePicture')
      .sort({ createdAt: -1 });
    
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
        pendingRequestsCount: circle.pendingRequests.length,
        userRole: 'admin',
        createdAt: circle.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching user\'s circles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching circles',
      error: error.message
    });
  }
});

router.get('/circles/pending-requests', authMiddleware, async (req, res) => {
  try {
    const creatorCircles = await Circle.find({
      $or: [{ creatorId: req.userId }, { createdBy: req.userId }]
    }).select('_id');
    const pendingRequests = await CircleRequest.find({
      circleId: { $in: creatorCircles.map(c => c._id) },
      status: 'pending'
    })
      .populate('senderId', 'name username profilePicture')
      .populate('circleId', 'circleId name icon')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      pendingRequests: pendingRequests
        .filter(request => request.circleId && request.senderId)
        .map(request => ({
          requestId: request._id,
          circleId: request.circleId.circleId,
          circleName: request.circleId.name,
          circleIcon: request.circleId.icon,
          user: request.senderId,
          message: request.message || '',
          requestedAt: request.createdAt
        }))
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching requests',
      error: error.message
    });
  }
});

router.get('/circles/:circleId/manage', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    
    let circle;
    if (mongoose.Types.ObjectId.isValid(circleId)) {
      circle = await Circle.findById(circleId)
        .populate('members.user', 'name username profilePicture')
        .populate('createdBy', 'name username profilePicture')
        .populate('moderators', 'name username profilePicture')
        .populate('pendingRequests.user', 'name username profilePicture');
    } else {
      circle = await Circle.findOne({ circleId: circleId })
        .populate('members.user', 'name username profilePicture')
        .populate('createdBy', 'name username profilePicture')
        .populate('moderators', 'name username profilePicture')
        .populate('pendingRequests.user', 'name username profilePicture');
    }
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    if (!circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle creator can manage this circle'
      });
    }
    
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
        members: circle.members.map(m => ({
          user: m.user,
          role: m.role,
          joinedAt: m.joinedAt
        })),
        pendingRequests: circle.pendingRequests.map(r => ({
          id: r._id,
          user: r.user,
          message: r.message,
          requestedAt: r.requestedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching circle management details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching circle details',
      error: error.message
    });
  }
});

router.put('/circles/:circleId/settings', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, description, icon, genre, settings } = req.body;
    
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
    
    if (!circle.isModerator(req.userId) && !circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update circle settings'
      });
    }
    
    if (name) circle.name = name;
    if (description) circle.description = description;
    if (icon) circle.icon = icon;
    if (genre) circle.genre = genre;
    if (settings) {
      circle.settings = {
        ...circle.settings,
        ...settings
      };
    }
    
    await circle.save();
    
    res.json({
      success: true,
      message: 'Circle settings updated successfully',
      circle: {
        id: circle._id,
        circleId: circle.circleId,
        name: circle.name,
        description: circle.description,
        icon: circle.icon,
        genre: circle.genre,
        settings: circle.settings
      }
    });
  } catch (error) {
    console.error('Error updating circle settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating circle settings',
      error: error.message
    });
  }
});

router.post('/circles/:circleId/members/:userId/promote', authMiddleware, async (req, res) => {
  try {
    const { circleId, userId } = req.params;
    
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
    
    if (!circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle creator can promote members'
      });
    }
    
    await circle.promoteToModerator(userId, req.userId);
    
    try {
      const io = global.io;
      if (io) {
        const promotedUser = await User.findById(userId);
        io.to(`user-${userId}`).emit('promoted-to-moderator', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `You have been promoted to moderator in "${circle.name}"`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Member promoted to moderator successfully'
    });
  } catch (error) {
    console.error('Error promoting member:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error promoting member'
    });
  }
});

router.post('/circles/:circleId/members/:userId/demote', authMiddleware, async (req, res) => {
  try {
    const { circleId, userId } = req.params;
    
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
    
    if (!circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle creator can demote moderators'
      });
    }
    
    await circle.demoteToMember(userId, req.userId);
    
    res.json({
      success: true,
      message: 'Moderator demoted to member successfully'
    });
  } catch (error) {
    console.error('Error demoting moderator:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error demoting member'
    });
  }
});

router.delete('/circles/:circleId/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { circleId, userId } = req.params;
    
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
    
    if (!circle.isModerator(req.userId) && !circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove members'
      });
    }
    
    await circle.removeMember(userId, req.userId);
    
    try {
      const io = global.io;
      if (io) {
        io.to(`user-${userId}`).emit('removed-from-circle', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `You have been removed from "${circle.name}"`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error removing member'
    });
  }
});

router.delete('/circles/:circleId', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    
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
    
    if (!circle.isCreator(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle creator can delete the circle'
      });
    }
    
    await DiscussionThread.deleteMany({ circleId: circle._id });
    await Circle.deleteOne({ _id: circle._id });
    
    try {
      const io = global.io;
      if (io) {
        for (const member of circle.members) {
          io.to(`user-${member.user}`).emit('circle-deleted', {
            circleId: circle.circleId,
            circleName: circle.name,
            message: `The circle "${circle.name}" has been deleted`
          });
        }
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }
    
    res.json({
      success: true,
      message: 'Circle deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting circle:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting circle',
      error: error.message
    });
  }
});

// ===== CIRCLE THREAD ROUTES =====

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
      threads: threads.map(thread => ({ ...normalizeThread(thread), circleName: circle.name })),
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

// Create a new circle thread (with filter and image support)
router.post('/circles/threads', authMiddleware, upload.array('images', 4), async (req, res) => {
  try {
    const { 
      title, 
      content, 
      type, 
      circleId,
      circleName, 
      tags, 
      poll, 
      event,
      bookReferences,
      genre,
      censorIndices // New: stringified array of indices to censor, e.g., "[0, 2]"
    } = req.body;

    console.log('Circle thread creation request:', { title, content, type, circleId, circleName, hasFiles: req.files?.length });

    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    // Check if user is suspended
    const isSuspended = await isUserSuspended(req.userId);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(req.userId);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended. You cannot create discussions.',
        suspended: true
      });
    }

    // Filter thread title
    const titleFilterResult = await FilterService.checkAndProcess(title, req.userId, 'discussion', circleId || circleName);
    if (!titleFilterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: titleFilterResult.message,
        warningIssued: titleFilterResult.warningIssued,
        warningCount: titleFilterResult.warningCount,
        suspended: titleFilterResult.suspended
      });
    }
    const filteredTitle = titleFilterResult.hasViolation ? titleFilterResult.censoredText : title;

    // Filter thread content
    const contentFilterResult = await FilterService.checkAndProcess(content, req.userId, 'discussion', circleId || circleName);
    if (!contentFilterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: contentFilterResult.message,
        warningIssued: contentFilterResult.warningIssued,
        warningCount: contentFilterResult.warningCount,
        suspended: contentFilterResult.suspended
      });
    }
    const filteredContent = contentFilterResult.hasViolation ? contentFilterResult.censoredText : content;

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

    const creatorId = (circle.creatorId || circle.createdBy).toString();
    const canPostAsCreator = creatorId === req.userId.toString();
    if (!circle.isMember(req.userId) && !canPostAsCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be a member of this circle to post' 
      });
    }

    // Process attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      try {
        const censors = censorIndices ? JSON.parse(censorIndices) : [];
        req.files.forEach((file, index) => {
          attachments.push({
            url: file.path, // Full Cloudinary URL
            isCensored: censors.includes(index)
          });
        });
      } catch (parseError) {
        console.error('Error parsing censorIndices:', parseError);
        // Continue without censoring if parsing fails
        req.files.forEach((file) => {
          attachments.push({
            url: file.path,
            isCensored: false
          });
        });
      }
    }

    // Parse tags if it's a string
    let parsedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    // Parse bookReferences if it's a string
    let parsedBookReferences = [];
    if (bookReferences) {
      try {
        parsedBookReferences = typeof bookReferences === 'string' ? JSON.parse(bookReferences) : bookReferences;
      } catch (e) {
        console.error('Error parsing bookReferences:', e);
      }
    }

    const thread = new DiscussionThread({
      title: filteredTitle,
      content: filteredContent,
      author: req.userId,
      circle: circle.name,
      circleId: circle._id,
      type: (type === 'discussion' || !type) ? 'book' : type,
      tags: parsedTags,
      isCircleThread: true,
      isPublic: false,
      genre: genre || circle.genre,
      attachments,
      bookReferences: parsedBookReferences
    });

    if (type === 'poll' && poll) {
      try {
        const pollData = typeof poll === 'string' ? JSON.parse(poll) : poll;
        // Filter poll question if present
        if (pollData.question) {
          const pollFilterResult = await FilterService.checkOnly(pollData.question);
          if (pollFilterResult.hasViolation) {
            pollData.question = pollFilterResult.censoredText;
          }
        }
        thread.poll = {
          question: pollData.question,
          options: pollData.options.map(opt => ({ 
            text: opt, 
            votes: [] 
          }))
        };
      } catch (pollError) {
        console.error('Error parsing poll data:', pollError);
        return res.status(400).json({
          success: false,
          message: 'Invalid poll data format'
        });
      }
    }

    if (type === 'event' && event) {
      try {
        const eventData = typeof event === 'string' ? JSON.parse(event) : event;
        thread.event = {
          date: new Date(eventData.date),
          duration: eventData.duration,
          type: eventData.type,
          attendees: []
        };
      } catch (eventError) {
        console.error('Error parsing event data:', eventError);
        return res.status(400).json({
          success: false,
          message: 'Invalid event data format'
        });
      }
    }

    await thread.save();

    circle.stats.threadCount += 1;
    await circle.save();

    await thread.populate('author', 'name username profilePicture');

    try {
      await Activity.create({
        type: 'POST_CREATED',
        user: req.userId,
        referenceId: thread._id.toString(),
        message: `Posted in circle "${circle.name}": "${filteredTitle}"`
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }
    // ── Notify circle members (DB record + real-time) ─────────────────────
    const author = await User.findById(req.userId).select('name profilePicture');
    try {
      await UNS.onCircleNewThread(author, circle, thread);
    } catch (unsErr) {
      console.error('[UNS] onCircleNewThread error:', unsErr.message);
    }

    try {
      const io = global.io;
      if (io) {
        const memberUserIds = circle.members
          .map(m => m.user.toString())
          .filter(id => id !== req.userId.toString());

        memberUserIds.forEach(userId => {
          io.to(`user-${userId}`).emit('new-circle-thread', {
            thread: {
              ...thread.toObject(),
              isCircleThread: true,
              circleName: circle.name
            },
            circleId: circle.circleId,
            circleName: circle.name,
            message: `New ${type} in ${circle.name}: "${filteredTitle}"`
          });
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    const responseData = {
      success: true,
      message: 'Circle thread created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0,
        isCircleThread: true
      }
    };
    
    if (titleFilterResult.warningIssued || contentFilterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = titleFilterResult.message || contentFilterResult.message;
      responseData.warningCount = titleFilterResult.warningCount || contentFilterResult.warningCount;
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Error creating circle thread:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating thread: ' + error.message,
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

    // Check if user is suspended
    const isSuspended = await isUserSuspended(req.userId);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(req.userId);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended.',
        suspended: true
      });
    }

    // Filter poll question
    const questionFilterResult = await FilterService.checkAndProcess(question, req.userId, 'discussion', circleId || circleName);
    if (!questionFilterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: questionFilterResult.message,
        warningIssued: questionFilterResult.warningIssued,
        warningCount: questionFilterResult.warningCount,
        suspended: questionFilterResult.suspended
      });
    }
    const filteredQuestion = questionFilterResult.hasViolation ? questionFilterResult.censoredText : question;

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

    const creatorId = (circle.creatorId || circle.createdBy).toString();
    const canCreateAsCreator = creatorId === req.userId.toString();
    if (!circle.isMember(req.userId) && !canCreateAsCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be a member of this circle to create a poll' 
      });
    }

    const thread = new DiscussionThread({
      title: `📊 POLL: ${filteredQuestion}`,
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
        question: filteredQuestion,
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

    const responseData = {
      success: true,
      message: 'Poll created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0,
        isCircleThread: true
      }
    };
    
    if (questionFilterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = questionFilterResult.message;
      responseData.warningCount = questionFilterResult.warningCount;
    }
    
    res.status(201).json(responseData);
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

// GET /api/discussions/recent-activity
router.get('/recent-activity', authMiddleware, async (req, res) => {
  try {
    const activities = await DiscussionThread.find({ isDeleted: false })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate('author', 'name profilePicture')
      .lean();

    const formattedActivities = activities.map(thread => ({
      userAvatar: thread.author?.profilePicture,
      userName: thread.author?.name,
      action: thread.isCircleThread ? 'posted in circle' : 'started a discussion',
      target: thread.title,
      targetId: thread._id,
      targetType: 'thread',
      timeAgo: getTimeAgo(thread.updatedAt)
    }));

    res.json({ success: true, activities: formattedActivities });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ success: false, message: 'Error fetching recent activity' });
  }
});

// GET /api/discussions/community-picks
router.get('/community-picks', authMiddleware, async (req, res) => {
  try {
    const threads = await DiscussionThread.find({ isDeleted: false, isCommunityPick: true })
      .sort({ createdAt: -1 })
      .populate('author', 'name username profilePicture')
      .lean();

    res.json({ 
      success: true, 
      threads: threads.map(t => normalizeThread(t)) 
    });
  } catch (error) {
    console.error('Community picks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching community picks' });
  }
});

// PATCH /api/discussions/:id/community-pick
router.patch('/:id/community-pick', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const thread = await DiscussionThread.findById(req.params.id);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    thread.isCommunityPick = !thread.isCommunityPick;
    await thread.save();

    res.json({ 
      success: true, 
      message: `Thread ${thread.isCommunityPick ? 'marked as' : 'removed from'} community picks`,
      isCommunityPick: thread.isCommunityPick
    });
  } catch (error) {
    console.error('Toggle community pick error:', error);
    res.status(500).json({ success: false, message: 'Error updating community pick status' });
  }
});

// ===== PUBLIC DISCUSSION ROUTES =====

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
      threads: threads.map(thread => normalizeThread(thread)),
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
        ...normalizeThread(thread),
        isPublic: !thread.circleId
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
        ...normalizeThread(thread),
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
        ...normalizeThread(thread),
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

// Create new thread (public discussion) with filter and image support
router.post('/threads', authMiddleware, upload.array('images', 4), async (req, res) => {
  try {
    const { 
      title, 
      content, 
      type,
      genre, 
      tags, 
      bookReferences, 
      category,
      censorIndices 
    } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    // Check if user is suspended
    const isSuspended = await isUserSuspended(req.userId);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(req.userId);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended. You cannot create discussions.',
        suspended: true
      });
    }

    // Filter thread title
    const titleFilterResult = await FilterService.checkAndProcess(title, req.userId, 'discussion');
    if (!titleFilterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: titleFilterResult.message,
        warningIssued: titleFilterResult.warningIssued,
        warningCount: titleFilterResult.warningCount,
        suspended: titleFilterResult.suspended
      });
    }
    const filteredTitle = titleFilterResult.hasViolation ? titleFilterResult.censoredText : title;

    // Filter thread content
    const contentFilterResult = await FilterService.checkAndProcess(content, req.userId, 'discussion');
    if (!contentFilterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: contentFilterResult.message,
        warningIssued: contentFilterResult.warningIssued,
        warningCount: contentFilterResult.warningCount,
        suspended: contentFilterResult.suspended
      });
    }
    const filteredContent = contentFilterResult.hasViolation ? contentFilterResult.censoredText : content;

    // Process attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      const censors = censorIndices ? JSON.parse(censorIndices) : [];
      req.files.forEach((file, index) => {
        attachments.push({
          url: file.path, // Full Cloudinary URL
          isCensored: censors.includes(index)
        });
      });
    }

    const thread = new DiscussionThread({
      title: filteredTitle,
      content: filteredContent,
      author: req.userId,
      type: (type === 'discussion' || !type) ? 'book' : type,
      genre: genre || 'General',
      tags: tags || [],
      bookReferences: bookReferences || [],
      category: category || 'general',
      isPublic: true,
      isCircleThread: false,
      attachments
    });

    await thread.save();
    await thread.populate('author', 'name username profilePicture');

    try {
      await Activity.create({
        type: 'DISCUSSION_CREATED',
        user: req.userId,
        referenceId: thread._id.toString(),
        message: `Started a discussion: "${thread.title}"`
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }

    try {
      const io = global.io;
      if (io) {
        io.emit('new-thread', {
          thread,
          message: `New public discussion: "${filteredTitle}"`
        });
      }
    } catch (socketError) {
      console.error('WebSocket error:', socketError);
    }

    const responseData = {
      success: true,
      message: 'Discussion created successfully',
      thread: {
        ...thread.toObject(),
        timeAgo: getTimeAgo(thread.createdAt),
        commentCount: 0,
        likeCount: 0
      }
    };
    
    if (titleFilterResult.warningIssued || contentFilterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = titleFilterResult.message || contentFilterResult.message;
      responseData.warningCount = titleFilterResult.warningCount || contentFilterResult.warningCount;
    }
    
    res.status(201).json(responseData);
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

    const thread = await DiscussionThread.findById(threadId).populate('likes', '_id');
    
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

    // Filter updated title if provided
    if (title) {
      const titleFilterResult = await FilterService.checkAndProcess(title, req.userId, 'discussion', threadId);
      if (!titleFilterResult.allowed) {
        return res.status(403).json({
          success: false,
          message: titleFilterResult.message,
          warningIssued: titleFilterResult.warningIssued,
          warningCount: titleFilterResult.warningCount
        });
      }
      thread.title = titleFilterResult.hasViolation ? titleFilterResult.censoredText : title;
    }
    
    // Filter updated content if provided
    if (content) {
      const contentFilterResult = await FilterService.checkAndProcess(content, req.userId, 'discussion', threadId);
      if (!contentFilterResult.allowed) {
        return res.status(403).json({
          success: false,
          message: contentFilterResult.message,
          warningIssued: contentFilterResult.warningIssued,
          warningCount: contentFilterResult.warningCount
        });
      }
      thread.content = contentFilterResult.hasViolation ? contentFilterResult.censoredText : content;
    }
    
    if (genre) thread.genre = genre;
    if (tags) thread.tags = tags;

    thread.updatedAt = new Date();
    await thread.save();

    // Notify users who liked this post
    if (thread.likes && thread.likes.length > 0) {
      const Notification = require('../models/Notification');
      const notificationPromises = thread.likes.map(async (likerId) => {
        if (likerId.toString() !== req.userId) {
          try {
            await Notification.createUserNotification(
              likerId,
              'thread_edited',
              'Post Updated',
              'A post you liked was edited.',
              {
                priority: 'low',
                actionUrl: `/discussions/thread/${thread._id}`,
                sourceUserId: req.userId,
                relatedEntityId: thread._id,
                relatedEntityType: 'Thread',
                metadata: {
                  threadId: thread._id,
                  threadTitle: thread.title
                }
              }
            );
          } catch (notifError) {
            console.error('Error sending edit notification:', notifError);
          }
        }
      });
      await Promise.allSettled(notificationPromises);
    }

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

    const thread = await DiscussionThread.findById(threadId).populate('likes', '_id');
    
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

    // Notify users who liked this post
    if (thread.likes && thread.likes.length > 0) {
      const Notification = require('../models/Notification');
      const notificationPromises = thread.likes.map(async (likerId) => {
        if (likerId.toString() !== req.userId) {
          try {
            await Notification.createUserNotification(
              likerId,
              'thread_deleted',
              'Post Deleted',
              'A post you liked was deleted.',
              {
                priority: 'low',
                sourceUserId: req.userId,
                relatedEntityId: thread._id,
                relatedEntityType: 'Thread',
                metadata: {
                  threadId: thread._id,
                  threadTitle: thread.title
                }
              }
            );
          } catch (notifError) {
            console.error('Error sending delete notification:', notifError);
          }
        }
      });
      await Promise.allSettled(notificationPromises);
    }

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

    // ── Notify thread author when someone likes (not unlikes) ─────────────
    if (likeIndex === -1) {
      try {
        const liker = await User.findById(req.userId).select('name profilePicture');
        await UNS.onThreadLiked(liker, thread);
      } catch (unsErr) {
        console.error('[UNS] onThreadLiked error:', unsErr.message);
      }
    }

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

// Add comment to thread (with filter)
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

    // Check if user is suspended
    const isSuspended = await isUserSuspended(req.userId);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(req.userId);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended. You cannot post comments.',
        suspended: true
      });
    }

    // Filter comment content
    const filterResult = await FilterService.checkAndProcess(content, req.userId, 'discussion', threadId);
    if (!filterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: filterResult.message,
        warningIssued: filterResult.warningIssued,
        warningCount: filterResult.warningCount,
        suspended: filterResult.suspended
      });
    }
    const filteredContent = filterResult.hasViolation ? filterResult.censoredText : content;

    const thread = await DiscussionThread.findById(threadId);
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: 'Thread not found' 
      });
    }

    const comment = {
      user: req.userId,
      content: filteredContent,
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

    try {
      await Activity.create({
        type: 'COMMENT_ADDED',
        user: req.userId,
        referenceId: thread._id.toString(),
        message: `Commented on discussion: "${thread.title}"`
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }

    // ── Notify thread author about new comment ────────────────────────────
    try {
      const commenter = await User.findById(req.userId).select('name profilePicture');
      await UNS.onThreadCommented(commenter, thread, filteredContent);
    } catch (unsErr) {
      console.error('[UNS] onThreadCommented error:', unsErr.message);
    }

    let newComment;
    if (parentCommentId) {
      const parentComment = thread.comments.id(parentCommentId);
      newComment = parentComment.replies[parentComment.replies.length - 1];
    } else {
      newComment = thread.comments[thread.comments.length - 1];
    }

    const user = await User.findById(req.userId).select('name username profilePicture');
    newComment.user = user;

    const responseData = {
      success: true,
      message: 'Comment added successfully',
      comment: newComment,
      commentCount: thread.commentCount
    };
    
    if (filterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = filterResult.message;
      responseData.warningCount = filterResult.warningCount;
    }
    
    res.status(201).json(responseData);
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
      threads: threads.map(thread => normalizeThread(thread)),
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

// ===== FILTER CHECK ENDPOINT =====
router.post('/check-content', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.json({ success: true, hasViolation: false, censoredText: content });
    }
    
    const result = await FilterService.checkOnly(content);
    
    res.json({
      success: true,
      hasViolation: result.hasViolation,
      censoredText: result.censoredText,
      matches: result.matches.map(m => ({ word: m.word, severity: m.severity, category: m.category }))
    });
  } catch (error) {
    console.error('Check content error:', error);
    res.status(500).json({ success: false, message: 'Error checking content' });
  }
});

// ===== GET USER WARNINGS =====
router.get('/my-warnings', authMiddleware, async (req, res) => {
  try {
    const warnings = await FilterService.getUserWarnings(req.userId);
    const warningCount = await FilterService.getWarningCount(req.userId);
    const suspension = await FilterService.getSuspensionMessage(req.userId);
    
    res.json({
      success: true,
      warnings,
      warningCount,
      suspension: suspension ? {
        isSuspended: true,
        message: suspension.message,
        suspensionEnds: suspension.suspensionEnds,
        daysLeft: suspension.daysLeft
      } : { isSuspended: false }
    });
  } catch (error) {
    console.error('Error fetching warnings:', error);
    res.status(500).json({ success: false, message: 'Error fetching warnings' });
  }
});

module.exports = router;
