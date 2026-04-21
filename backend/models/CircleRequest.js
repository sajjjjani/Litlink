const mongoose = require('mongoose');

const circleRequestSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Deprecated: kept optional for backward compatibility with existing docs.
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
    default: null
  },
  circleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    index: true
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  actedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

circleRequestSchema.index(
  { senderId: 1, circleId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('CircleRequest', circleRequestSchema);
