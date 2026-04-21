const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth');
const Circle = require('../models/Circle');
const CircleRequest = require('../models/CircleRequest');
const UserNotificationService = require('../services/UserNotificationService');

// GET /api/circle-requests
// Returns pending requests for circles created by current user.
router.get('/', authenticate, async (req, res) => {
  try {
    const creatorCircles = await Circle.find({
      $or: [{ creatorId: req.userId }, { createdBy: req.userId }]
    }).select('_id name circleId icon');

    if (creatorCircles.length === 0) {
      return res.json({ success: true, requests: [] });
    }

    const circleMap = new Map(
      creatorCircles.map(circle => [circle._id.toString(), circle])
    );

    const requests = await CircleRequest.find({
      circleId: { $in: creatorCircles.map(c => c._id) },
      status: 'pending'
    })
      .populate('senderId', 'name username profilePicture')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      requests: requests
        .filter(r => circleMap.has(r.circleId.toString()) && r.senderId)
        .map(r => {
          const circle = circleMap.get(r.circleId.toString());
          return {
            id: r._id,
            circleId: circle._id,
            circleSlug: circle.circleId,
            circleName: circle.name,
            circleIcon: circle.icon,
            sender: r.senderId,
            status: r.status,
            createdAt: r.createdAt
          };
        })
    });
  } catch (error) {
    console.error('Error fetching circle requests:', error);
    return res.status(500).json({ success: false, message: 'Error fetching requests' });
  }
});

async function handleCircleRequestDecision(req, res, decision) {
  try {
    const request = await CircleRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const circle = await Circle.findById(request.circleId);
    if (!circle) {
      return res.status(404).json({ success: false, message: 'Circle not found' });
    }

    const creatorId = (circle.creatorId || circle.createdBy)?.toString();
    // Critical authorization rule: only the circle creator can manage requests.
    if (!creatorId || creatorId !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle creator can manage requests'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.status}`
      });
    }

    request.status = decision;
    request.actedBy = req.userId;
    request.actedAt = new Date();
    await request.save();

    // Keep legacy pendingRequests array synchronized.
    circle.pendingRequests = (circle.pendingRequests || []).filter(
      pending => pending.user.toString() !== request.senderId.toString()
    );

    if (decision === 'accepted') {
      const isAlreadyMember = circle.members.some(
        m => m.user.toString() === request.senderId.toString()
      );
      if (!isAlreadyMember) {
        circle.members.push({
          user: request.senderId,
          joinedAt: new Date(),
          role: 'member'
        });
        circle.stats.memberCount += 1;
      }

      try {
        await UserNotificationService.onCircleAccepted(request.senderId, circle);
      } catch (error) {
        console.error('[UNS] onCircleAccepted error:', error.message);
      }

      if (global.io) {
        global.io.to(`user-${request.senderId}`).emit('circle-request-approved', {
          circleId: circle.circleId,
          circleName: circle.name,
          message: `Your request to join ${circle.name} has been approved!`
        });
      }
    }

    if (decision === 'rejected' && global.io) {
      global.io.to(`user-${request.senderId}`).emit('circle-request-declined', {
        circleId: circle.circleId,
        circleName: circle.name,
        message: `Your request to join ${circle.name} was declined.`
      });
    }

    await circle.save();

    return res.json({
      success: true,
      message: decision === 'accepted' ? 'Request accepted' : 'Request rejected',
      requestId: request._id,
      status: request.status
    });
  } catch (error) {
    console.error(`Error handling request ${decision}:`, error);
    return res.status(500).json({ success: false, message: 'Error updating request' });
  }
}

router.post('/:id/accept', authenticate, async (req, res) => {
  return handleCircleRequestDecision(req, res, 'accepted');
});

router.post('/:id/reject', authenticate, async (req, res) => {
  return handleCircleRequestDecision(req, res, 'rejected');
});

module.exports = router;
