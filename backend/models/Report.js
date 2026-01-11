const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedItemType: {
    type: String,
    enum: ['user', 'post', 'chat', 'profile', 'comment', 'voice_room'],
    required: true
  },
  reportedItemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      'inappropriate_content',
      'harassment',
      'hate_speech',
      'spam',
      'fake_account',
      'impersonation',
      'privacy_violation',
      'copyright',
      'other'
    ],
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: {
    type: String,
    default: ''
  },
  resolutionNotes: {
    type: String,
    default: ''
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  evidence: [{
    type: {
      type: String,
      enum: ['text', 'image', 'link', 'screenshot']
    },
    content: String
  }],
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Add indexes
reportSchema.index({ status: 1 });
reportSchema.index({ reportedUser: 1 });
reportSchema.index({ reporter: 1 });
reportSchema.index({ reportedItemType: 1 });
reportSchema.index({ priority: 1 });
reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema); // Fixed variable name