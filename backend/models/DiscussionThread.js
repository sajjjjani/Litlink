// models/DiscussionThread.js - Complete with Circle and Poll support
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  replies: [this],
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const discussionThreadSchema = new mongoose.Schema({
  // Core fields
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Circle support (NEW)
  circle: { type: String, required: false },
  isCircleThread: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  
  // Categorization
  genre: { type: String, default: 'General' },
  tags: [{ type: String }],
  category: { 
    type: String, 
    enum: ['literary', 'news', 'challenge', 'general', 'announcement', 'discussion', 'question', 'recommendation'],
    default: 'general'
  },
  type: { 
    type: String, 
    enum: ['discussion', 'question', 'recommendation', 'poll', 'event'],
    default: 'discussion'
  },
  
  // Poll support (NEW)
  poll: {
    question: String,
    options: [{
      text: String,
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }]
  },
  
  // Event support (NEW)
  event: {
    date: Date,
    duration: Number,
    type: String,
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  
  // Book references
  bookReferences: [{
    bookId: String,
    title: String,
    author: String,
    coverUrl: String
  }],
  
  // Engagement metrics
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  comments: [commentSchema],
  commentCount: { type: Number, default: 0 },
  
  // Activity tracking
  lastActivity: { type: Date, default: Date.now },
  lastCommentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Moderation
  isPinned: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for search
discussionThreadSchema.index({ title: 'text', content: 'text', tags: 'text' });

// Virtual for time ago
discussionThreadSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return this.createdAt.toLocaleDateString();
});

// Method to increment views
discussionThreadSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

// Method to toggle like
discussionThreadSchema.methods.toggleLike = async function(userId) {
  const index = this.likes.indexOf(userId);
  if (index === -1) {
    this.likes.push(userId);
    this.likeCount += 1;
  } else {
    this.likes.splice(index, 1);
    this.likeCount -= 1;
  }
  return this.save();
};

// Method to add comment
discussionThreadSchema.methods.addComment = async function(userId, content, parentCommentId = null) {
  const comment = {
    user: userId,
    content,
    likes: [],
    likeCount: 0,
    replies: []
  };

  if (parentCommentId) {
    // Find parent comment and add as reply
    const parentComment = this.comments.id(parentCommentId);
    if (parentComment) {
      parentComment.replies.push(comment);
    }
  } else {
    // Add as top-level comment
    this.comments.push(comment);
  }

  this.commentCount += 1;
  this.lastActivity = new Date();
  this.lastCommentBy = userId;
  
  await this.save();
  
  // Return the newly created comment
  return parentCommentId 
    ? this.comments.id(parentCommentId).replies[this.comments.id(parentCommentId).replies.length - 1]
    : this.comments[this.comments.length - 1];
};

// Method to vote in poll
discussionThreadSchema.methods.voteInPoll = async function(userId, optionIndex) {
  if (this.type !== 'poll' || !this.poll) {
    throw new Error('This thread is not a poll');
  }
  
  const option = this.poll.options[optionIndex];
  if (!option) {
    throw new Error('Invalid poll option');
  }
  
  // Remove user's vote from all options
  this.poll.options.forEach(opt => {
    const voteIndex = opt.votes.indexOf(userId);
    if (voteIndex > -1) {
      opt.votes.splice(voteIndex, 1);
    }
  });
  
  // Add vote to selected option
  option.votes.push(userId);
  
  await this.save();
  return this.poll;
};

// Method to RSVP to event
discussionThreadSchema.methods.rsvpToEvent = async function(userId) {
  if (this.type !== 'event' || !this.event) {
    throw new Error('This thread is not an event');
  }
  
  const index = this.event.attendees.indexOf(userId);
  if (index === -1) {
    this.event.attendees.push(userId);
  } else {
    this.event.attendees.splice(index, 1);
  }
  
  await this.save();
  return this.event;
};

// Pre-save middleware
discussionThreadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update comment counts for any modified comments
  if (this.comments) {
    this.commentCount = this.comments.filter(c => !c.isDeleted).length;
    
    // Update like counts for comments
    this.comments.forEach(comment => {
      comment.likeCount = comment.likes.length;
      if (comment.replies) {
        comment.replies.forEach(reply => {
          reply.likeCount = reply.likes.length;
        });
      }
    });
  }
  
  next();
});

module.exports = mongoose.model('DiscussionThread', discussionThreadSchema);