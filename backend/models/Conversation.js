// models/Conversation.js – Chat conversations (user-to-user, admin-to-user)
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null }
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  messages: [messageSchema],
  lastMessage: { type: Date, default: null },
  lastMessagePreview: { type: String, default: '' },
  unreadCount: { type: mongoose.Schema.Types.Mixed, default: {} } // userId -> count
}, { timestamps: true });

conversationSchema.index({ lastMessage: -1 });
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
