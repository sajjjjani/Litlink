const mongoose = require('mongoose');

const roomParticipantSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VoiceRoom',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: {
    type: Date,
    default: null
  },
  isMuted: {
    type: Boolean,
    default: false
  },
  handRaised: {
    type: Boolean,
    default: false
  },
  isSpeaking: {
    type: Boolean,
    default: false
  },
  socketId: {
    type: String,
    default: null
  }
});

// Compound index to ensure a user can't be in the same room twice
roomParticipantSchema.index({ roomId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('RoomParticipant', roomParticipantSchema);