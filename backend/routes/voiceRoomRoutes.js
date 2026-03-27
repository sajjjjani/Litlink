// routes/voiceRoomRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const VoiceRoom = require('../models/VoiceRoom');
const RoomParticipant = require('../models/RoomParticipant');
const User = require('../models/User');
const AdminNotificationService = require('../services/adminNotificationService');

// Create a new voice room
router.post('/rooms', authenticate, async (req, res) => {
    try {
        const { name, description, maxParticipants, scheduledStart, scheduledEnd, isPublic } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Room name is required'
            });
        }
        
        const room = new VoiceRoom({
            name,
            description: description || '',
            hostId: req.userId,
            maxParticipants: maxParticipants || 50,
            status: 'scheduled',
            isPublic: isPublic !== false,
            scheduledStart: scheduledStart ? new Date(scheduledStart) : new Date(),
            scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
            createdAt: new Date(),
            participantCount: 0
        });
        
        await room.save();
        
        // Populate host info
        await room.populate('hostId', 'name email profilePicture');
        
        // Notify admins
        const host = await User.findById(req.userId);
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
        
        res.json({
            success: true,
            message: 'Voice room created successfully',
            room
        });
        
    } catch (error) {
        console.error('Error creating voice room:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get all live rooms
router.get('/rooms/live', authenticate, async (req, res) => {
    try {
        const rooms = await VoiceRoom.find({ 
            status: 'live',
            $or: [
                { isPublic: true },
                { hostId: req.userId }
            ]
        })
        .populate('hostId', 'name email profilePicture')
        .sort({ participantCount: -1, createdAt: -1 });
        
        // Get participant count for each room
        const roomsWithDetails = await Promise.all(rooms.map(async (room) => {
            const participants = await RoomParticipant.find({
                roomId: room._id,
                leftAt: null
            }).populate('userId', 'name email profilePicture');
            
            return {
                ...room.toObject(),
                participants: participants.map(p => ({
                    userId: p.userId._id,
                    name: p.userId.name,
                    profilePicture: p.userId.profilePicture,
                    isMuted: p.isMuted,
                    handRaised: p.handRaised,
                    joinedAt: p.joinedAt
                })),
                participantCount: participants.length
            };
        }));
        
        res.json({
            success: true,
            rooms: roomsWithDetails
        });
        
    } catch (error) {
        console.error('Error fetching live rooms:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get scheduled rooms
router.get('/rooms/scheduled', authenticate, async (req, res) => {
    try {
        const rooms = await VoiceRoom.find({
            status: 'scheduled',
            scheduledStart: { $gt: new Date() },
            $or: [
                { isPublic: true },
                { hostId: req.userId }
            ]
        })
        .populate('hostId', 'name email profilePicture')
        .sort({ scheduledStart: 1 });
        
        res.json({
            success: true,
            rooms
        });
        
    } catch (error) {
        console.error('Error fetching scheduled rooms:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get room details
router.get('/rooms/:roomId', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId)
            .populate('hostId', 'name email profilePicture');
        
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }
        
        // Check access
        if (!room.isPublic && room.hostId._id.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const participants = await RoomParticipant.find({
            roomId: room._id,
            leftAt: null
        }).populate('userId', 'name email profilePicture');
        
        res.json({
            success: true,
            room: {
                ...room.toObject(),
                participants: participants.map(p => ({
                    userId: p.userId._id,
                    name: p.userId.name,
                    profilePicture: p.userId.profilePicture,
                    isMuted: p.isMuted,
                    handRaised: p.handRaised,
                    joinedAt: p.joinedAt
                })),
                participantCount: participants.length
            }
        });
        
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Join voice room
router.post('/rooms/:roomId/join', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId);
        
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }
        
        if (room.status !== 'live') {
            // If room is scheduled and start time has passed, start it
            if (room.status === 'scheduled' && room.scheduledStart <= new Date()) {
                room.status = 'live';
                await room.save();
            } else if (room.status === 'scheduled') {
                return res.status(400).json({
                    success: false,
                    message: 'Room has not started yet',
                    scheduledStart: room.scheduledStart
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Room is not available'
                });
            }
        }
        
        // Check participant limit
        const participantCount = await RoomParticipant.countDocuments({
            roomId: room._id,
            leftAt: null
        });
        
        if (participantCount >= room.maxParticipants) {
            return res.status(400).json({
                success: false,
                message: 'Room is full'
            });
        }
        
        // Check if already joined
        const existingParticipant = await RoomParticipant.findOne({
            roomId: room._id,
            userId: req.userId,
            leftAt: null
        });
        
        if (existingParticipant) {
            return res.status(400).json({
                success: false,
                message: 'Already joined this room'
            });
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
        
        // Update room participant count
        const newCount = participantCount + 1;
        await VoiceRoom.findByIdAndUpdate(room._id, { participantCount: newCount });
        
        // Emit WebSocket event
        const io = global.io;
        if (io) {
            io.to(`room-${room._id}`).emit('user-joined', {
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
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Leave voice room
router.post('/rooms/:roomId/leave', authenticate, async (req, res) => {
    try {
        const participant = await RoomParticipant.findOneAndUpdate(
            {
                roomId: req.params.roomId,
                userId: req.userId,
                leftAt: null
            },
            { leftAt: new Date() },
            { new: true }
        );
        
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: 'Not in this room'
            });
        }
        
        // Update room participant count
        const remainingCount = await RoomParticipant.countDocuments({
            roomId: req.params.roomId,
            leftAt: null
        });
        
        await VoiceRoom.findByIdAndUpdate(req.params.roomId, { participantCount: remainingCount });
        
        // If room is empty, end it
        if (remainingCount === 0) {
            await VoiceRoom.findByIdAndUpdate(req.params.roomId, {
                status: 'ended',
                endedAt: new Date()
            });
        }
        
        // Emit WebSocket event
        const io = global.io;
        if (io) {
            io.to(`room-${req.params.roomId}`).emit('user-left', {
                userId: req.userId,
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: 'Left room successfully'
        });
        
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// End voice room (host only)
router.post('/rooms/:roomId/end', authenticate, async (req, res) => {
    try {
        const room = await VoiceRoom.findById(req.params.roomId);
        
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }
        
        // Check if user is host or admin
        const user = await User.findById(req.userId);
        const isAdmin = user && user.isAdmin;
        
        if (room.hostId.toString() !== req.userId && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Only the host can end this room'
            });
        }
        
        room.status = 'ended';
        room.endedAt = new Date();
        await room.save();
        
        // Remove all participants
        await RoomParticipant.updateMany(
            { roomId: room._id, leftAt: null },
            { leftAt: new Date() }
        );
        
        // Emit WebSocket event
        const io = global.io;
        if (io) {
            io.to(`room-${room._id}`).emit('room-ended', {
                message: 'Room ended by host',
                endedAt: new Date()
            });
        }
        
        res.json({
            success: true,
            message: 'Room ended successfully'
        });
        
    } catch (error) {
        console.error('Error ending room:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get room statistics (admin only)
router.get('/rooms/stats', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        const totalRooms = await VoiceRoom.countDocuments();
        const liveRooms = await VoiceRoom.countDocuments({ status: 'live' });
        const scheduledRooms = await VoiceRoom.countDocuments({ status: 'scheduled' });
        const endedRooms = await VoiceRoom.countDocuments({ status: 'ended' });
        
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
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get user's voice room history
router.get('/rooms/history', authenticate, async (req, res) => {
    try {
        const participants = await RoomParticipant.find({
            userId: req.userId
        })
        .populate('roomId', 'name description status hostId createdAt endedAt')
        .sort({ joinedAt: -1 })
        .limit(50);
        
        const history = participants.map(p => ({
            room: p.roomId,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            duration: p.leftAt ? (p.leftAt - p.joinedAt) / 1000 / 60 : null, // minutes
            wasMuted: p.isMuted,
            raisedHand: p.handRaised
        }));
        
        res.json({
            success: true,
            history
        });
        
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Update participant status (mute/hand raise)
router.put('/rooms/:roomId/participants/status', authenticate, async (req, res) => {
    try {
        const { isMuted, handRaised } = req.body;
        const update = {};
        
        if (isMuted !== undefined) update.isMuted = isMuted;
        if (handRaised !== undefined) update.handRaised = handRaised;
        
        const participant = await RoomParticipant.findOneAndUpdate(
            {
                roomId: req.params.roomId,
                userId: req.userId,
                leftAt: null
            },
            { $set: update },
            { new: true }
        );
        
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: 'Not in this room'
            });
        }
        
        // Emit WebSocket event
        const io = global.io;
        if (io) {
            if (isMuted !== undefined) {
                io.to(`room-${req.params.roomId}`).emit('user-muted', {
                    userId: req.userId,
                    isMuted
                });
            }
            if (handRaised !== undefined) {
                io.to(`room-${req.params.roomId}`).emit('hand-raised', {
                    userId: req.userId,
                    raised: handRaised
                });
            }
        }
        
        res.json({
            success: true,
            participant
        });
        
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;