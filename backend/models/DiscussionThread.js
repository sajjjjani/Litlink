// models/DiscussionThread.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null // For nested replies
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const discussionThreadSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  genre: {
    type: String,
    enum: ['Fantasy', 'Mystery', 'Romance', 'Sci-Fi', 'Historical', 'Thriller', 'Non-Fiction', 'Literary', 'Poetry', 'General'],
    default: 'General'
  },
  tags: [{
    type: String,
    trim: true
  }],
  bookReferences: [{
    bookId: String,
    title: String,
    author: String
  }],
  comments: [commentSchema],
  commentCount: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  lastCommentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastCommentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
discussionThreadSchema.index({ genre: 1, createdAt: -1 });
discussionThreadSchema.index({ tags: 1 });
discussionThreadSchema.index({ author: 1 });
discussionThreadSchema.index({ isFeatured: 1, createdAt: -1 });
discussionThreadSchema.index({ lastActivity: -1 });
discussionThreadSchema.index({ views: -1 });
discussionThreadSchema.index({ commentCount: -1 });
discussionThreadSchema.index({ likeCount: -1 });
discussionThreadSchema.index({ title: 'text', content: 'text' }); // For search

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

// Virtual for last activity time ago
discussionThreadSchema.virtual('lastActivityAgo').get(function() {
  if (!this.lastActivity) return 'No activity';
  
  const now = new Date();
  const diffMs = now - this.lastActivity;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return this.lastActivity.toLocaleDateString();
});

// Method to increment view count
discussionThreadSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

// Method to add comment
discussionThreadSchema.methods.addComment = async function(userId, content, parentCommentId = null) {
  const comment = {
    user: userId,
    content,
    parentComment: parentCommentId
  };
  
  this.comments.push(comment);
  this.commentCount += 1;
  this.lastActivity = new Date();
  this.lastCommentBy = userId;
  this.lastCommentAt = new Date();
  
  await this.save();
  
  // Return the newly created comment
  return this.comments[this.comments.length - 1];
};

// Method to like/unlike thread
discussionThreadSchema.methods.toggleLike = async function(userId) {
  const likeIndex = this.likes.indexOf(userId);
  
  if (likeIndex === -1) {
    this.likes.push(userId);
    this.likeCount += 1;
  } else {
    this.likes.splice(likeIndex, 1);
    this.likeCount -= 1;
  }
  
  return this.save();
};

// Method to get thread with populated data
discussionThreadSchema.methods.getPopulated = async function() {
  return this.populate('author', 'name username profilePicture')
    .populate('lastCommentBy', 'name username')
    .populate({
      path: 'comments',
      populate: {
        path: 'user',
        select: 'name username profilePicture'
      }
    })
    .execPopulate();
};

const DiscussionThread = mongoose.model('DiscussionThread', discussionThreadSchema);

module.exports = DiscussionThread;