const mongoose = require('mongoose');

const circleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  circleId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: '📚'
  },
  genre: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member'
    }
  }],
  pendingRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    message: {
      type: String,
      default: ''
    }
  }],
  settings: {
    isPrivate: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: true
    },
    allowMemberPosts: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    memberCount: {
      type: Number,
      default: 0
    },
    threadCount: {
      type: Number,
      default: 0
    },
    activeToday: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update member count before save
circleSchema.pre('save', function(next) {
  this.stats.memberCount = this.members.length;
  this.updatedAt = new Date();
  next();
});

// Method to check if user is member
circleSchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

// Method to check if user is moderator
circleSchema.methods.isModerator = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member && (member.role === 'moderator' || member.role === 'admin');
};

// Method to add member
circleSchema.methods.addMember = async function(userId) {
  if (!this.isMember(userId)) {
    this.members.push({
      user: userId,
      joinedAt: new Date(),
      role: 'member'
    });
    
    // Remove from pending requests
    this.pendingRequests = this.pendingRequests.filter(
      req => req.user.toString() !== userId.toString()
    );
    
    await this.save();
    return true;
  }
  return false;
};

// Method to remove member
circleSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  await this.save();
};

// Method to request membership
circleSchema.methods.requestMembership = async function(userId, message = '') {
  if (this.isMember(userId)) {
    throw new Error('Already a member');
  }
  
  const existingRequest = this.pendingRequests.find(
    req => req.user.toString() === userId.toString()
  );
  
  if (existingRequest) {
    throw new Error('Request already pending');
  }
  
  this.pendingRequests.push({
    user: userId,
    requestedAt: new Date(),
    message
  });
  
  await this.save();
  return this.pendingRequests[this.pendingRequests.length - 1];
};

// Method to approve membership
circleSchema.methods.approveRequest = async function(userId, moderatorId) {
  const request = this.pendingRequests.find(
    req => req.user.toString() === userId.toString()
  );
  
  if (!request) {
    throw new Error('No pending request found');
  }
  
  if (!this.isModerator(moderatorId) && this.createdBy.toString() !== moderatorId.toString()) {
    throw new Error('Not authorized to approve requests');
  }
  
  await this.addMember(userId);
  return true;
};

// Method to decline request
circleSchema.methods.declineRequest = async function(userId, moderatorId) {
  const requestIndex = this.pendingRequests.findIndex(
    req => req.user.toString() === userId.toString()
  );
  
  if (requestIndex === -1) {
    throw new Error('No pending request found');
  }
  
  if (!this.isModerator(moderatorId) && this.createdBy.toString() !== moderatorId.toString()) {
    throw new Error('Not authorized to decline requests');
  }
  
  this.pendingRequests.splice(requestIndex, 1);
  await this.save();
  return true;
};

// Indexes
circleSchema.index({ circleId: 1 });
circleSchema.index({ name: 1 });
circleSchema.index({ genre: 1 });
circleSchema.index({ 'members.user': 1 });
circleSchema.index({ 'pendingRequests.user': 1 });

module.exports = mongoose.model('Circle', circleSchema);