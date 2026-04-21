const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true
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
  wordTriggered: {
    type: String,
    required: true
  },
  context: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    enum: ['chat', 'discussion', 'voice_chat', 'profile', 'post'],
    default: 'chat'
  },
  sourceId: {
    type: String,
    default: ''
  },
  warningNumber: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

warningSchema.index({ userId: 1, createdAt: -1 });
warningSchema.index({ userId: 1, warningNumber: 1 });

warningSchema.statics.getWarningCount = async function(userId, timeWindowDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);
  
  return await this.countDocuments({
    userId: userId,
    createdAt: { $gte: cutoffDate }
  });
};

warningSchema.statics.getWarningHistory = async function(userId, limit = 10) {
  return await this.find({ userId: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Method to check if user should be suspended based on warning count
warningSchema.statics.checkAndSuspendIfNeeded = async function(userId, warningCount) {
  const SUSPENSION_THRESHOLD = 3;
  const SUSPENSION_DAYS = 7;
  
  if (warningCount >= SUSPENSION_THRESHOLD) {
    const User = require('./User');
    const user = await User.findById(userId);
    
    if (user && !user.isSuspended && !user.isBanned) {
      const suspensionEnds = new Date();
      suspensionEnds.setDate(suspensionEnds.getDate() + SUSPENSION_DAYS);
      
      user.isSuspended = true;
      user.suspensionEnds = suspensionEnds;
      user.suspensionReason = `Exceeded ${SUSPENSION_THRESHOLD} content warnings`;
      await user.save();
      
      return {
        suspended: true,
        suspensionEnds,
        daysLeft: SUSPENSION_DAYS,
        message: `⚠️ You have been suspended from Litlink for ${SUSPENSION_DAYS} days due to multiple content violations.`
      };
    }
  }
  
  return { suspended: false };
};

module.exports = mongoose.model('Warning', warningSchema);