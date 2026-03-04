const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const VoiceRoom = require('../models/VoiceRoom');
const RoomParticipant = require('../models/RoomParticipant');
const User = require('../models/User');

// Get all live rooms
router.get('/rooms/live', authenticate, async (req, res) => {
  try {
    const rooms = await VoiceRoom.find({ 
      status: 'live',
      $or: [
        { isPrivate: false },
        { allowedUsers: req.userId },
        { hostId: req.userId }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({
      success: true,
      rooms: rooms.map(room => ({
        id: room._id,
        name: room.name,
        genre: room.genre,
        description: room.description,
        hostId: room.hostId,
        hostName: room.hostName,
        participantCount: room.participantCount,
        isLive: true
      }))
    });
  } catch (error) {
    console.error('Error fetching live rooms:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get scheduled rooms
router.get('/rooms/scheduled', authenticate, async (req, res) => {
  try {
    const rooms = await VoiceRoom.find({ 
      status: 'scheduled',
      scheduledFor: { $gte: new Date() }
    })
    .sort({ scheduledFor: 1 })
    .limit(20);

    res.json({
      success: true,
      rooms: rooms.map(room => ({
        id: room._id,
        name: room.name,
        genre: room.genre,
        hostName: room.hostName,
        scheduledFor: room.scheduledFor,
        time: formatScheduledTime(room.scheduledFor)
      }))
    });
  } catch (error) {
    console.error('Error fetching scheduled rooms:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new room
router.post('/rooms', authenticate, async (req, res) => {
  try {
    const { name, genre, description, scheduledFor, isPrivate } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const room = new VoiceRoom({
      name,
      genre,
      description: description || '',
      hostId: user._id,
      hostName: user.name,
      status: scheduledFor ? 'scheduled' : 'live',
      scheduledFor: scheduledFor || null,
      isPrivate: isPrivate || false,
      participantCount: 1 // Host counts as participant
    });

    await room.save();

    // Add host as participant
    const participant = new RoomParticipant({
      roomId: room._id,
      userId: user._id,
      userName: user.name
    });
    await participant.save();

    // Emit via WebSocket if room is live
    if (room.status === 'live' && global.io) {
      global.io.emit('room-created', {
        id: room._id,
        name: room.name,
        genre: room.genre,
        hostName: user.name,
        participantCount: 1
      });
    }

    res.json({
      success: true,
      message: 'Room created successfully',
      room: {
        id: room._id,
        name: room.name,
        status: room.status
      }
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get room details
router.get('/rooms/:roomId', authenticate, async (req, res) => {
  try {
    const room = await VoiceRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    // Check access for private rooms
    if (room.isPrivate && 
        !room.allowedUsers.includes(req.userId) && 
        room.hostId.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const participants = await RoomParticipant.find({ 
      roomId: room._id,
      leftAt: null 
    }).select('userId userName isMuted handRaised joinedAt');

    res.json({
      success: true,
      room: {
        id: room._id,
        name: room.name,
        genre: room.genre,
        description: room.description,
        hostId: room.hostId,
        hostName: room.hostName,
        status: room.status,
        participantCount: participants.length,
        participants: participants.map(p => ({
          userId: p.userId,
          name: p.userName,
          isMuted: p.isMuted,
          handRaised: p.handRaised,
          joinedAt: p.joinedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// End room (host only)
router.post('/rooms/:roomId/end', authenticate, async (req, res) => {
  try {
    const room = await VoiceRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.hostId.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only host can end the room' });
    }

    room.status = 'ended';
    room.endedAt = new Date();
    await room.save();

    // Mark all participants as left
    await RoomParticipant.updateMany(
      { roomId: room._id, leftAt: null },
      { leftAt: new Date() }
    );

    // Notify all participants
    if (global.io) {
      global.io.to(`room-${room._id}`).emit('room-ended', {
        message: 'Room has been ended by host'
      });
    }

    res.json({ success: true, message: 'Room ended' });
  } catch (error) {
    console.error('Error ending room:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function
function formatScheduledTime(date) {
  const now = new Date();
  const diff = date - now;
  
  if (diff < 0) return 'Now';
  if (diff < 3600000) return `In ${Math.round(diff / 60000)} minutes`;
  if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
  return date.toLocaleDateString();
}

module.exports = router;