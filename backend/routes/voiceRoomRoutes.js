const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const VoiceRoom = require('../models/VoiceRoom');
const RoomParticipant = require('../models/RoomParticipant');
const User = require('../models/User');
const AdminNotificationService = require('../services/adminNotificationService');
const UNS = require('../services/UserNotificationService');

// ── Helper: get live participants for a room ──────────────────────────────
async function getParticipantsForRoom(roomId) {
    const participants = await RoomParticipant.find({ roomId, leftAt: null })
        .populate('userId', 'name profilePicture');
    return participants.map(p => ({
        userId: p.userId._id,
        name: p.userName || p.userId.name,
        profilePicture: p.userId.profilePicture,
        isMuted: p.isMuted,
        handRaised: p.handRaised,
        joinedAt: p.joinedAt
    }));
}

// ── POST /rooms — Create a new voice room ─────────────────────────────────
// FIX: was missing genre and hostName (both required by VoiceRoom schema),
//      and was always setting status:'scheduled' instead of 'live' for instant rooms.
router.post('/rooms', authenticate, async (req, res) => {
    try {
        const { name, genre, description, maxParticipants, scheduledFor, isPublic } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Room name is required' });
        }
        if (!genre) {
            return res.status(400).json({ success: false, message: 'Genre is required' });
        }

        const host = await User.findById(req.userId).select('name profilePicture');
        if (!host) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isScheduled = !!scheduledFor;

        const room = new VoiceRoom({
            name: name.trim(),
            genre,                                          // FIX: was missing
            description: description || '',
            hostId: req.userId,
            hostName: host.name,                            // FIX: was missing, required by schema
            status: isScheduled ? 'scheduled' : 'live',    // FIX: was always 'scheduled'
            scheduledFor: isScheduled ? new Date(scheduledFor) : null,
            maxParticipants: maxParticipants || 50,
            isPrivate: isPublic === false,
            participantCount: 0,
            createdAt: new Date()
        });

        await room.save();
        await room.populate('hostId', 'name email profilePicture');

        // Notify admins (non-fatal)
        try {
            await AdminNotificationService.sendToAllAdmins(
                'voice_room_created',
                'New Voice Room Created',
                `${host.name} created a new voice room: ${name}`,
                {
                    priority: 'medium',
                    sourceUserId: req.userId,
                    relatedEntityId: room._id,
                    relatedEntityType: 'VoiceRoom',
                    actionUrl: `/voice-rooms/${room._id}`,
                    metadata: {
                        roomId: room._id.toString(),
                        roomName: name,
                        hostId: req.userId.toString(),
                        hostName: host.name
                    }
                }
            );
        } catch (notifErr) {
            console.warn('Admin notification failed (non-fatal):', notifErr.message);
        }

        // Broadcast new live room to the lobby via Socket.IO
        if (global.io && !isScheduled) {
            global.io.emit('room-created', {
                _id: room._id,
                name: room.name,
                genre: room.genre,
                description: room.description,
                hostId: { _id: req.userId, name: host.name },
                hostName: room.hostName,
                status: room.status,
                participantCount: 0
            });
        }

        // Notify followers when a host starts a live room.
        if (!isScheduled) {
            try {
                await UNS.onVoiceRoomStarted(host, room);
            } catch (unsErr) {
                console.error('[UNS] onVoiceRoomStarted error:', unsErr.message);
            }
        }

        res.json({ success: true, message: 'Voice room created successfully', room });

    } catch (error) {
        console.error('Error creating voice room:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /rooms/live ───────────────────────────────────────────────────────
router.get('/rooms/live', authenticate, async (req, res) => {
    try {
        const rooms = await VoiceRoom.find({
            status: 'live',
            $or: [{ isPrivate: { $ne: true } }, { hostId: req.userId }]
        })
            .populate('hostId', 'name email profilePicture')
            .sort({ participantCount: -1, createdAt: -1 });

        const roomsWithDetails = await Promise.all(rooms.map(async (room) => {
            const participants = await getParticipantsForRoom(room._id);
            return { ...room.toObject(), participants, participantCount: participants.length };
        }));

        res.json({ success: true, rooms: roomsWithDetails });

    } catch (error) {
        console.error('Error fetching live rooms:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /rooms/scheduled ──────────────────────────────────────────────────
router.get('/rooms/scheduled', authenticate, async (req, res) => {
    try {
        const rooms = await VoiceRoom.find({
            status: 'scheduled',
            scheduledFor: { $gt: new Date() },
            $or: [{ isPrivate: { $ne: true } }, { hostId: req.userId }]
        })
            .populate('hostId', 'name email profilePicture')
            .sort({ scheduledFor: 1 });

        res.json({ success: true, rooms });

    } catch (error) {
        console.error('Error fetching scheduled rooms:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /rooms/:roomId ────────────────────────────────────────────────────
router.get('/rooms/:roomId', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId)
            .populate('hostId', 'name email profilePicture');

        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        // FIX: was checking room.isPublic but schema field is isPrivate
        if (room.isPrivate && room.hostId._id.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const participants = await getParticipantsForRoom(room._id);

        res.json({
            success: true,
            room: { ...room.toObject(), participants, participantCount: participants.length }
        });

    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /rooms/:roomId/join ───────────────────────────────────────────────
router.post('/rooms/:roomId/join', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId);

        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        if (room.status !== 'live') {
            // Auto-start if scheduled time has passed
            if (room.status === 'scheduled' && room.scheduledFor && room.scheduledFor <= new Date()) {
                room.status = 'live';
                await room.save();
            } else if (room.status === 'scheduled') {
                return res.status(400).json({
                    success: false,
                    message: 'Room has not started yet',
                    scheduledFor: room.scheduledFor
                });
            } else {
                return res.status(400).json({ success: false, message: 'Room is not available' });
            }
        }

        // Check capacity
        const participantCount = await RoomParticipant.countDocuments({ roomId: room._id, leftAt: null });
        if (participantCount >= room.maxParticipants) {
            return res.status(400).json({ success: false, message: 'Room is full' });
        }

        // Check if already joined
        const existingParticipant = await RoomParticipant.findOne({
            roomId: room._id,
            userId: req.userId,
            leftAt: null
        });
        if (existingParticipant) {
            return res.status(400).json({ success: false, message: 'Already joined this room' });
        }

        const user = await User.findById(req.userId);

        const participant = new RoomParticipant({
            roomId: room._id,
            userId: req.userId,
            userName: user.name,
            joinedAt: new Date(),
            isMuted: false,
            handRaised: false
        });
        await participant.save();

        const newCount = participantCount + 1;
        await VoiceRoom.findByIdAndUpdate(room._id, { participantCount: newCount });

        if (global.io) {
            global.io.to(`room-${room._id}`).emit('user-joined', {
                userId: req.userId,
                userName: user.name,
                profilePicture: user.profilePicture,
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            message: 'Joined room successfully',
            room: {
                id: room._id,
                name: room.name,
                hostId: room.hostId,
                participantCount: newCount
            }
        });

    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /rooms/:roomId/leave ─────────────────────────────────────────────
router.post('/rooms/:roomId/leave', authenticate, async (req, res) => {
    try {
        const participant = await RoomParticipant.findOneAndUpdate(
            { roomId: req.params.roomId, userId: req.userId, leftAt: null },
            { leftAt: new Date() },
            { new: true }
        );

        if (!participant) {
            return res.status(404).json({ success: false, message: 'Not in this room' });
        }

        const remainingCount = await RoomParticipant.countDocuments({
            roomId: req.params.roomId,
            leftAt: null
        });
        await VoiceRoom.findByIdAndUpdate(req.params.roomId, { participantCount: remainingCount });

        if (remainingCount === 0) {
            const room = await VoiceRoom.findById(req.params.roomId);
            if (room) {
                room.status = 'completed';
                room.endedAt = new Date();
                room.duration = Math.round((room.endedAt - room.createdAt) / 60000) || 0;
                await room.save();
            }
        }

        if (global.io) {
            global.io.to(`room-${req.params.roomId}`).emit('user-left', {
                userId: req.userId,
                participantCount: remainingCount,
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Left room successfully' });

    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /rooms/:roomId/end — Host only ───────────────────────────────────
router.post('/rooms/:roomId/end', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId);

        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        // FIX: hostId may be a populated object or raw ObjectId — always compare as strings
        const hostId = room.hostId._id
            ? room.hostId._id.toString()
            : room.hostId.toString();

        const user = await User.findById(req.userId);
        const isAdmin = user && user.isAdmin;

        if (hostId !== req.userId && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Only the host can end this room' });
        }

        room.status = 'completed';
        room.endedAt = new Date();
        room.duration = Math.round((room.endedAt - room.createdAt) / 60000) || 0;
        await room.save();

        await RoomParticipant.updateMany(
            { roomId: room._id, leftAt: null },
            { leftAt: new Date() }
        );

        if (global.io) {
            // Notify everyone inside the room
            global.io.to(`room-${room._id}`).emit('room-ended', {
                roomId: room._id.toString(),
                message: 'Room ended by host',
                endedAt: new Date().toISOString()
            });
            // Also broadcast globally so lobby removes the card
            global.io.emit('room-ended', {
                roomId: room._id.toString(),
                message: 'Room ended by host'
            });
        }

        res.json({ success: true, message: 'Room ended successfully' });

    } catch (error) {
        console.error('Error ending room:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /rooms/stats — Admin only ─────────────────────────────────────────
router.get('/rooms/stats', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const totalRooms = await VoiceRoom.countDocuments();
        const liveRooms = await VoiceRoom.countDocuments({ status: 'live' });
        const scheduledRooms = await VoiceRoom.countDocuments({ status: 'scheduled' });
        const endedRooms = await VoiceRoom.countDocuments({ status: { $in: ['ended', 'completed'] } });
        const totalParticipants = await RoomParticipant.countDocuments();
        const activeParticipants = await RoomParticipant.countDocuments({ leftAt: null });

        const averageParticipants = await VoiceRoom.aggregate([
            { $match: { status: 'live' } },
            { $group: { _id: null, avg: { $avg: '$participantCount' } } }
        ]);

        const popularRooms = await VoiceRoom.find({ status: 'live' })
            .sort({ participantCount: -1 })
            .limit(5)
            .populate('hostId', 'name email');

        res.json({
            success: true,
            stats: {
                totalRooms,
                liveRooms,
                scheduledRooms,
                endedRooms,
                totalParticipants,
                activeParticipants,
                averageParticipants: averageParticipants[0]?.avg || 0,
                popularRooms
            }
        });

    } catch (error) {
        console.error('Error fetching room stats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /history — User's voice room history ────────────────────────
router.get('/rooms/history', authenticate, async (req, res) => {
    try {
        const participants = await RoomParticipant.find({ userId: req.userId })
            .populate('roomId', 'name description status hostId createdAt endedAt duration')
            .sort({ joinedAt: -1 })
            .limit(50);

        const history = participants.map(p => ({
            room: p.roomId,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            duration: p.roomId ? p.roomId.duration : (p.leftAt ? Math.round((p.leftAt - p.joinedAt) / 60000) : null),
            wasMuted: p.isMuted,
            raisedHand: p.handRaised
        }));

        res.json({ success: true, history });

    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /rooms/:roomId/participants/status — Mute / hand raise ────────────
router.put('/rooms/:roomId/participants/status', authenticate, async (req, res) => {
    try {
        const { isMuted, handRaised } = req.body;
        const update = {};

        if (isMuted !== undefined) update.isMuted = isMuted;
        if (handRaised !== undefined) update.handRaised = handRaised;

        const participant = await RoomParticipant.findOneAndUpdate(
            { roomId: req.params.roomId, userId: req.userId, leftAt: null },
            { $set: update },
            { new: true }
        );

        if (!participant) {
            return res.status(404).json({ success: false, message: 'Not in this room' });
        }

        if (global.io) {
            if (isMuted !== undefined) {
                global.io.to(`room-${req.params.roomId}`).emit('user-muted', {
                    userId: req.userId,
                    isMuted
                });
            }
            if (handRaised !== undefined) {
                global.io.to(`room-${req.params.roomId}`).emit('hand-raised', {
                    userId: req.userId,
                    raised: handRaised
                });
            }
        }

        res.json({ success: true, participant });

    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /rooms/:roomId/reminder ──────────────────────────────────────────
router.post('/rooms/:roomId/reminder', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }
        if (room.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: 'Can only set reminders for scheduled rooms' });
        }

        const userIdStr = req.userId.toString();
        
        // Initialize reminderUsers array if it doesn't exist
        if (!room.reminderUsers) {
            room.reminderUsers = [];
        }

        const hasReminder = room.reminderUsers.some(uid => uid.toString() === userIdStr);
        if (hasReminder) {
            return res.status(400).json({ success: false, message: 'Reminder already set for this room' });
        }

        room.reminderUsers.push(req.userId);
        await room.save();

        res.json({ success: true, message: 'Reminder set successfully' });
    } catch (error) {
        console.error('Error setting reminder:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;