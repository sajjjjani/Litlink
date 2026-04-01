const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  attachment: {
    data: { type: String, default: null },
    mimeType: { type: String, default: null },
    filename: { type: String, default: null },
    size: { type: Number, default: null },
    category: { type: String, enum: ['image', 'document'], default: null }
  },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  unsent: { type: Boolean, default: false },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  messages: [messageSchema],
  lastMessage: { type: Date, default: Date.now },
  lastMessagePreview: { type: String, default: 'No messages yet' },
  unreadCount: { type: Map, of: Number, default: {} }
}, {
  timestamps: true
});

// Index for faster queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessage: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);