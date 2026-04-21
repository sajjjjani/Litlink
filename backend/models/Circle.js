const mongoose = require('mongoose');

const circleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  circleId: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  icon: { type: String, default: '📚' },
  genre: { type: String, required: true },
  
  // Creator and moderators
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Canonical creator field used by circle-request authorization flow.
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Members
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' }
  }],
  
  // Pending join requests
  pendingRequests: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now },
    message: { type: String, maxlength: 500 }
  }],
  
  // Settings
  settings: {
    isPrivate: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: true },
    allowMemberPosts: { type: Boolean, default: true }
  },
  
  // Stats
  stats: {
    memberCount: { type: Number, default: 1 },
    threadCount: { type: Number, default: 0 },
    activeToday: { type: Number, default: 0 }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Check if user is member
circleSchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

// Check if user is moderator
circleSchema.methods.isModerator = function(userId) {
  return this.members.some(member => 
    member.user.toString() === userId.toString() && 
    (member.role === 'moderator' || member.role === 'admin')
  );
};

// Check if user is creator
circleSchema.methods.isCreator = function(userId) {
  return this.createdBy.toString() === userId.toString();
};

// Get user role in circle
circleSchema.methods.getUserRole = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

// Add join request
circleSchema.methods.requestMembership = async function(userId, message = '') {
  if (this.isMember(userId)) {
    throw new Error('Already a member of this circle');
  }
  
  if (this.pendingRequests.some(req => req.user.toString() === userId.toString())) {
    throw new Error('Join request already pending');
  }
  
  this.pendingRequests.push({
    user: userId,
    requestedAt: new Date(),
    message: message.substring(0, 500)
  });
  
  await this.save();
  return this.pendingRequests[this.pendingRequests.length - 1];
};

// Approve join request
circleSchema.methods.approveRequest = async function(userId, approvedBy) {
  const requestIndex = this.pendingRequests.findIndex(
    req => req.user.toString() === userId.toString()
  );
  
  if (requestIndex === -1) {
    throw new Error('No pending request found');
  }
  
  this.pendingRequests.splice(requestIndex, 1);
  
  // Add as member
  this.members.push({
    user: userId,
    joinedAt: new Date(),
    role: 'member'
  });
  
  this.stats.memberCount += 1;
  await this.save();
  
  return true;
};

// Decline join request
circleSchema.methods.declineRequest = async function(userId, declinedBy) {
  const requestIndex = this.pendingRequests.findIndex(
    req => req.user.toString() === userId.toString()
  );
  
  if (requestIndex === -1) {
    throw new Error('No pending request found');
  }
  
  this.pendingRequests.splice(requestIndex, 1);
  await this.save();
  
  return true;
};

// Remove member
circleSchema.methods.removeMember = async function(userId, removedBy) {
  const memberIndex = this.members.findIndex(
    member => member.user.toString() === userId.toString()
  );
  
  if (memberIndex === -1) {
    throw new Error('Member not found');
  }
  
  // Don't allow removing the creator
  if (this.members[memberIndex].user.toString() === this.createdBy.toString()) {
    throw new Error('Cannot remove the circle creator');
  }
  
  this.members.splice(memberIndex, 1);
  this.stats.memberCount -= 1;
  await this.save();
  
  return true;
};

// Promote member to moderator
circleSchema.methods.promoteToModerator = async function(userId, promotedBy) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  
  if (!member) {
    throw new Error('Member not found');
  }
  
  if (member.role === 'admin') {
    throw new Error('Cannot change admin role');
  }
  
  member.role = 'moderator';
  
  if (!this.moderators.includes(userId)) {
    this.moderators.push(userId);
  }
  
  await this.save();
  return true;
};

// Demote moderator to member
circleSchema.methods.demoteToMember = async function(userId, demotedBy) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  
  if (!member) {
    throw new Error('Member not found');
  }
  
  if (member.role === 'admin') {
    throw new Error('Cannot demote the circle admin');
  }
  
  member.role = 'member';
  
  const moderatorIndex = this.moderators.findIndex(m => m.toString() === userId.toString());
  if (moderatorIndex !== -1) {
    this.moderators.splice(moderatorIndex, 1);
  }
  
  await this.save();
  return true;
};

// Pre-save middleware
circleSchema.pre('save', function(next) {
  if (!this.creatorId && this.createdBy) {
    this.creatorId = this.createdBy;
  }
  if (!this.createdBy && this.creatorId) {
    this.createdBy = this.creatorId;
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Circle', circleSchema);