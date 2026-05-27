const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const bookDiscussionThreadSchema = new mongoose.Schema(
  {
    bookId: { type: String, required: true, trim: true, index: true },
    title: { type: String, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 8000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    replies: { type: [replySchema], default: [] },
    replyCount: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

bookDiscussionThreadSchema.index({ bookId: 1, lastActivity: -1, createdAt: -1 });

bookDiscussionThreadSchema.pre('save', function (next) {
  this.replyCount = Array.isArray(this.replies) ? this.replies.length : 0;
  next();
});

module.exports = mongoose.model('BookDiscussionThread', bookDiscussionThreadSchema);
