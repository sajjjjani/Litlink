const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const User = require('../models/User');
const Conversation = require('../models/Conversation');

// ─── helpers ───────────────────────────────────────────────────────────────
function getUnread(conv, userId) {
  const uc = conv.unreadCount;
  if (!uc) return 0;
  return typeof uc.get === 'function' ? (uc.get(userId) || 0) : (uc[userId] || 0);
}

function setUnread(conv, userId, val) {
  if (typeof conv.unreadCount.set === 'function') {
    conv.unreadCount.set(userId, val);
  } else {
    conv.unreadCount[userId] = val;
    conv.markModified('unreadCount');
  }
}

function notifySocket(userIdStr, event, payload) {
  try {
    const ss = global.io && global.io._litlinkSocketServer;
    if (!ss) return;
    const sid = ss.userSockets.get(userIdStr);
    if (sid) global.io.to(sid).emit(event, payload);
  } catch (_) {}
}

// Helper to check if message is visible to user
function isMessageVisibleToUser(message, userId) {
  // If message is unsent, it's gone for everyone
  if (message.unsent) return false;
  // If user is in deletedFor list, it's hidden for them
  if (message.deletedFor && message.deletedFor.some(id => id.toString() === userId)) return false;
  return true;
}

// ─── GET /api/chat/matches ─────────────────────────────────────────────────
router.get('/matches', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();

    const users = await User.find({
      _id:     { $ne: me },
      isBanned: { $ne: true },
      isAdmin:  { $ne: true }
    }).select('name username profilePicture favoriteGenres favoriteBooks lastLogin').lean();

    const conversations = await Conversation.find({ participants: me }).sort({ lastMessage: -1 });

    const convMap = new Map();
    conversations.forEach(conv => {
      const other = conv.participants.find(p => p.toString() !== me);
      if (other) {
        // Get visible messages for current user
        const visibleMessages = conv.messages.filter(msg => isMessageVisibleToUser(msg, me));
        
        const lastMsg = visibleMessages[visibleMessages.length - 1];
        let preview = 'No messages yet';
        if (lastMsg) {
          if (lastMsg.content && lastMsg.content.trim()) {
            preview = lastMsg.content.length > 50 ? lastMsg.content.substring(0, 47) + '...' : lastMsg.content;
          } else if (lastMsg.attachment && lastMsg.attachment.data) {
            preview = lastMsg.attachment.category === 'image' ? '📷 Photo' : '📎 File';
          }
        }
        
        convMap.set(other.toString(), {
          conversationId:  conv._id,
          lastMessage:     preview,
          lastMessageTime: conv.lastMessage,
          unreadCount:     getUnread(conv, me)
        });
      }
    });

    const matches = users.map(user => {
      const info = convMap.get(user._id.toString()) || {};
      let compatibility = 70;
      if (req.user.favoriteGenres && user.favoriteGenres) {
        const shared = req.user.favoriteGenres.filter(g => user.favoriteGenres.includes(g));
        compatibility = 70 + Math.min(25, shared.length * 5);
      }
      return {
        _id:            user._id,
        id:             user._id,
        name:           user.name || 'User',
        username:       user.username,
        profilePicture: user.profilePicture,
        genre:          (user.favoriteGenres && user.favoriteGenres[0]) || 'Reader',
        preview:        info.lastMessage || 'No messages yet',
        online:         user.lastLogin ? (Date.now() - new Date(user.lastLogin) < 5 * 60 * 1000) : false,
        unreadCount:    info.unreadCount || 0,
        conversationId: info.conversationId,
        compatibility
      };
    }).sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return (b.compatibility || 0) - (a.compatibility || 0);
    });

    res.json({ success: true, matches });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).json({ success: false, message: 'Error fetching matches' });
  }
});

// ─── GET /api/chat/messages/:matchId ──────────────────────────────────────
router.get('/messages/:matchId', authenticate, async (req, res) => {
  try {
    const me    = req.user._id.toString();
    const limit = parseInt(req.query.limit) || 50;

    const conv = await Conversation.findOne({
      participants: { $all: [me, req.params.matchId], $size: 2 }
    }).populate('messages.sender', 'name profilePicture');

    if (!conv) return res.json({ success: true, messages: [], conversationId: null });

    // Mark unread messages as read (only visible ones)
    let marked = 0;
    conv.messages.forEach(msg => {
      const senderId = msg.sender._id ? msg.sender._id.toString() : msg.sender.toString();
      if (senderId !== me && !msg.read && !msg.unsent && !(msg.deletedFor && msg.deletedFor.includes(me))) {
        msg.read = true;
        msg.readAt = new Date();
        marked++;
      }
    });
    if (marked > 0) { 
      setUnread(conv, me, 0); 
      await conv.save();
    }

    // Filter visible messages for current user
    const visibleMessages = conv.messages.filter(msg => isMessageVisibleToUser(msg, me));

    const messages = visibleMessages
      .slice(-limit)
      .map(msg => {
        const hasRealAttachment = msg.attachment && msg.attachment.data;
        return {
          _id:        msg._id,
          sender:     msg.sender._id ? msg.sender._id.toString() : msg.sender.toString(),
          senderName: msg.sender.name,
          content:    msg.content,
          type:       msg.type,
          attachment: hasRealAttachment ? msg.attachment : null,
          read:       msg.read,
          readAt:     msg.readAt,
          createdAt:  msg.createdAt,
          unsent:     msg.unsent || false,
          deletedFor: msg.deletedFor || [],
          time:       new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        };
      });

    res.json({ success: true, messages: messages.reverse(), conversationId: conv._id });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ success: false, message: 'Error fetching messages' });
  }
});

// ─── POST /api/chat/messages — text message HTTP fallback ─────────────────
router.post('/messages', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const { matchId, content, type = 'text' } = req.body;

    if (!matchId)  return res.status(400).json({ success: false, message: 'Recipient ID required' });
    if (!content)  return res.status(400).json({ success: false, message: 'Message content required' });

    let conv = await Conversation.findOne({ participants: { $all: [me, matchId], $size: 2 } });
    if (!conv) {
      conv = new Conversation({ participants: [me, matchId], messages: [], unreadCount: {} });
    }

    const msg = { 
      _id: new mongoose.Types.ObjectId(), 
      sender: me, 
      content, 
      type, 
      read: false, 
      createdAt: new Date(),
      unsent: false,
      deletedFor: []
    };
    conv.messages.push(msg);
    conv.lastMessage = new Date();
    conv.lastMessagePreview = content.length > 50 ? content.substring(0, 47) + '...' : content;
    setUnread(conv, matchId, getUnread(conv, matchId) + 1);
    await conv.save();

    const sender = await User.findById(me).select('name profilePicture');
    res.json({ success: true, message: { _id: msg._id, sender: me, senderName: sender.name, content, type, read: false, createdAt: msg.createdAt }, conversationId: conv._id });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Error sending message' });
  }
});

// ─── POST /api/chat/messages/attachment — base64 attachment ───────────────
router.post('/messages/attachment', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const { recipientId, data, mimeType, filename, size, category, caption } = req.body;

    if (!recipientId) return res.status(400).json({ success: false, message: 'Recipient ID required' });
    if (!data || !mimeType) return res.status(400).json({ success: false, message: 'File data required' });
    if (data.length > 9 * 1024 * 1024) return res.status(400).json({ success: false, message: 'File too large (max 6 MB)' });

    let conv = await Conversation.findOne({ participants: { $all: [me, recipientId], $size: 2 } });
    if (!conv) {
      conv = new Conversation({ participants: [me, recipientId], messages: [], unreadCount: {} });
    }

    const msgType = category === 'image' ? 'image' : 'file';
    const msg = {
      _id:        new mongoose.Types.ObjectId(),
      sender:     me,
      content:    caption || '',
      type:       msgType,
      attachment: { data, mimeType, filename, size, category },
      read:       false,
      createdAt:  new Date(),
      unsent:     false,
      deletedFor: []
    };

    conv.messages.push(msg);
    conv.lastMessage = new Date();
    conv.lastMessagePreview = category === 'image' ? '📷 Sent a photo' : `📎 ${filename || 'File'}`;
    setUnread(conv, recipientId, getUnread(conv, recipientId) + 1);
    await conv.save();

    const sender = await User.findById(me).select('name profilePicture');

    // Real-time delivery to recipient (only if message is not unsent)
    notifySocket(recipientId.toString(), 'chat:message', {
      _id: msg._id, senderId: me, senderName: sender.name,
      content: caption || '', type: msgType,
      attachment: { data, mimeType, filename, size, category },
      createdAt: msg.createdAt, conversationId: conv._id, isFromOthers: true
    });

    res.json({
      success: true,
      message: { _id: msg._id, sender: me, content: caption || '', type: msgType, attachment: { data, mimeType, filename, size, category }, createdAt: msg.createdAt, conversationId: conv._id }
    });
  } catch (err) {
    console.error('Attachment error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to send attachment' });
  }
});

// ─── POST /api/chat/conversations — get or create conversation ────────────
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ success: false, message: 'Participant ID required' });

    let conv = await Conversation.findOne({ participants: { $all: [me, participantId], $size: 2 } });
    if (!conv) {
      conv = new Conversation({ participants: [me, participantId], messages: [], unreadCount: {} });
      await conv.save();
    }
    res.json({ success: true, conversation: { _id: conv._id, participants: conv.participants } });
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ success: false, message: 'Error creating conversation' });
  }
});

// ─── POST /api/chat/conversations/:id/messages ────────────────────────────
router.post('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const me   = req.user._id.toString();
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conv.participants.some(p => p.toString() === me)) return res.status(403).json({ success: false, message: 'Not authorized' });

    const { content } = req.body;
    const recipientId = conv.participants.find(p => p.toString() !== me);

    const msg = { 
      _id: new mongoose.Types.ObjectId(), 
      sender: me, 
      content: content || '', 
      type: 'text', 
      read: false, 
      createdAt: new Date(),
      unsent: false,
      deletedFor: []
    };
    conv.messages.push(msg);
    conv.lastMessage = new Date();
    conv.lastMessagePreview = content ? (content.length > 50 ? content.substring(0, 47) + '...' : content) : '';
    setUnread(conv, recipientId.toString(), getUnread(conv, recipientId.toString()) + 1);
    await conv.save();

    const sender = await User.findById(me).select('name profilePicture');
    res.json({ success: true, message: { _id: msg._id, sender: me, senderName: sender.name, content: content || '', type: 'text', read: false, createdAt: msg.createdAt } });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Error sending message' });
  }
});

// ─── DELETE /api/chat/messages/:id/delete-for-me — hide for current user ─
router.delete('/messages/:messageId/delete-for-me', authenticate, async (req, res) => {
  try {
    const me   = req.user._id.toString();
    const conv = await Conversation.findOne({ 'messages._id': req.params.messageId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msg = conv.messages.id(req.params.messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    // Don't allow deleting already unsent messages
    if (msg.unsent) {
      return res.status(400).json({ success: false, message: 'Message already unsent for everyone' });
    }

    // Initialize deletedFor array if it doesn't exist
    if (!msg.deletedFor) {
      msg.deletedFor = [];
    }

    // Add current user to deletedFor array if not already there
    const alreadyDeleted = msg.deletedFor.some(id => id.toString() === me);
    if (!alreadyDeleted) {
      msg.deletedFor.push(new mongoose.Types.ObjectId(me));
      console.log(`✅ Added user ${me} to deletedFor for message ${req.params.messageId}`);
    }

    // Update preview if the last visible message was deleted
    const visibleMessages = conv.messages.filter(m => isMessageVisibleToUser(m, me));
    
    if (visibleMessages.length > 0) {
      const lastMsg = visibleMessages[visibleMessages.length - 1];
      conv.lastMessagePreview = lastMsg.content ? 
        (lastMsg.content.length > 50 ? lastMsg.content.substring(0, 47) + '...' : lastMsg.content) :
        (lastMsg.attachment && lastMsg.attachment.data ? (lastMsg.attachment.category === 'image' ? '📷 Photo' : '📎 File') : 'No messages yet');
      conv.lastMessage = lastMsg.createdAt;
    } else {
      conv.lastMessagePreview = 'No messages yet';
      conv.lastMessage = null;
    }

    await conv.save();
    console.log(`✅ Saved conversation after delete-for-me. Message ${req.params.messageId} hidden for user ${me}`);

    // Notify current user about deletion
    notifySocket(me, 'chat:message:deleted', { 
      messageId: req.params.messageId, 
      conversationId: conv._id 
    });

    res.json({ success: true, message: 'Message deleted for you' });
  } catch (err) {
    console.error('Delete-for-me error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete message: ' + err.message });
  }
});

// ─── DELETE /api/chat/messages/:id/unsend — remove for EVERYONE ──────────
router.delete('/messages/:messageId/unsend', authenticate, async (req, res) => {
  try {
    const me  = req.user._id.toString();
    const conv = await Conversation.findOne({ 'messages._id': req.params.messageId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msg = conv.messages.id(req.params.messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    
    if (msg.sender.toString() !== me) {
      return res.status(403).json({ success: false, message: 'You can only unsend your own messages' });
    }

    // Mark as unsent and clear content
    msg.unsent = true;
    msg.content = '';
    msg.attachment = null;
    msg.deletedFor = []; // Clear deletedFor since it's unsent for everyone

    console.log(`✅ Marked message ${req.params.messageId} as unsent by user ${me}`);

    // Update preview from last visible message for each participant
    const allVisibleMessages = conv.messages.filter(m => !m.unsent);
    if (allVisibleMessages.length > 0) {
      const lastMsg = allVisibleMessages[allVisibleMessages.length - 1];
      conv.lastMessagePreview = lastMsg.content ? 
        (lastMsg.content.length > 50 ? lastMsg.content.substring(0, 47) + '...' : lastMsg.content) :
        (lastMsg.attachment && lastMsg.attachment.data ? (lastMsg.attachment.category === 'image' ? '📷 Photo' : '📎 File') : 'No messages yet');
      conv.lastMessage = lastMsg.createdAt;
    } else {
      conv.lastMessagePreview = 'No messages yet';
      conv.lastMessage = null;
    }

    await conv.save();

    // Notify all participants
    conv.participants.forEach(pid => {
      notifySocket(pid.toString(), 'chat:message:unsent', { 
        messageId: req.params.messageId, 
        conversationId: conv._id 
      });
    });

    res.json({ success: true, message: 'Message unsent for everyone' });
  } catch (err) {
    console.error('Unsend error:', err);
    res.status(500).json({ success: false, message: 'Failed to unsend: ' + err.message });
  }
});

module.exports = router;