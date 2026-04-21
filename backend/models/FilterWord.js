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
    default: 'warn'
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

filterWordSchema.index({ word: 1 });
filterWordSchema.index({ category: 1 });
filterWordSchema.index({ severity: 1 });
filterWordSchema.index({ isActive: 1 });

filterWordSchema.statics.checkText = async function(text) {
  if (!text || typeof text !== 'string') return { hasViolation: false, matches: [] };
  
  const lowerText = text.toLowerCase();
  const activeWords = await this.find({ isActive: true });
  const matches = [];
  
  for (const filterWord of activeWords) {
    // Create regex that matches whole words or word boundaries
    // Handle special characters in filter words
    const escapedWord = filterWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordPattern = new RegExp(`\\b${escapedWord}\\b|${escapedWord}(?=\\s|$)|(?<=^|\\s)${escapedWord}`, 'gi');
    if (wordPattern.test(lowerText)) {
      matches.push(filterWord);
    }
  }
  
  return {
    hasViolation: matches.length > 0,
    matches: matches
  };
};

// Method to get all active filter words (cached)
let cachedFilterWords = null;
let lastCacheUpdate = null;
const CACHE_TTL = 60000; // 1 minute

filterWordSchema.statics.getActiveFilterWords = async function(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedFilterWords && lastCacheUpdate && (now - lastCacheUpdate) < CACHE_TTL) {
    return cachedFilterWords;
  }
  
  cachedFilterWords = await this.find({ isActive: true });
  lastCacheUpdate = now;
  return cachedFilterWords;
};

// Method to clear cache (call when filter words are added/updated/deleted)
filterWordSchema.statics.clearCache = function() {
  cachedFilterWords = null;
  lastCacheUpdate = null;
};

module.exports = mongoose.model('FilterWord', filterWordSchema);