const mongoose = require('mongoose');

const filterWordSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['profanity', 'hate_speech', 'harassment', 'spam', 'sexual', 'violent', 'other'],
    default: 'profanity'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  action: {
    type: String,
    enum: ['warn', 'flag', 'auto_delete', 'require_review'],
    default: 'flag'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    default: ''
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastTriggered: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Add indexes
filterWordSchema.index({ word: 1 });
filterWordSchema.index({ category: 1 });
filterWordSchema.index({ severity: 1 });
filterWordSchema.index({ isActive: 1 });

module.exports = mongoose.model('FilterWord', filterWordSchema);