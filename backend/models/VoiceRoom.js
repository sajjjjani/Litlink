const mongoose = require('mongoose');

const voiceRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genre: {
    type: String,
    required: true,
    enum: ['Fantasy', 'Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Poetry', 'Classic Literature', 'Non-Fiction', 'Other']
  },
  description: {
    type: String,
    default: ''
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hostName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['live', 'scheduled', 'ended'],
    default: 'live'
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  participantCount: {
    type: Number,
    default: 1
  },
  maxParticipants: {
    type: Number,
    default: 50
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  }
});

// Index for efficient queries
voiceRoomSchema.index({ status: 1, createdAt: -1 });
voiceRoomSchema.index({ hostId: 1 });
voiceRoomSchema.index({ genre: 1 });

module.exports = mongoose.model('VoiceRoom', voiceRoomSchema);