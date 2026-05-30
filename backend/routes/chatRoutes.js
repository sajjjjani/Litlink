const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');
const Conversation = require('../models/Conversation');
const FilterService = require('../services/filterService');

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
    const sids = ss.userSockets.get(userIdStr);
    if (sids) {
      for (const sid of sids) {
        global.io.to(sid).emit(event, payload);
      }
    }
  } catch (_) {}
}

// Helper to check if message is visible to user
function isMessageVisibleToUser(message, userId) {
  if (message.unsent) return false;
  if (message.deletedFor && message.deletedFor.some(id => id.toString() === userId)) return false;
  return true;
}

// Helper to check if user is blocked
async function isBlocked(userId, targetId) {
  const user = await User.findById(userId).select('blockedUsers');
  if (!user) return false;
  return user.blockedUsers && user.blockedUsers.some(id => id.toString() === targetId);
}

// Helper to check message privacy — returns true if sender is allowed to message recipient
async function canMessageUser(senderId, recipientId) {
  const settings = await UserSettings.findOne({ userId: recipientId });
  if (!settings || !settings.privacy) return true;
  const privacy = settings.privacy.messagePrivacy || 'everyone';
  if (privacy === 'everyone') return true;
  if (privacy === 'none') return false;
  if (privacy === 'followers') {
    const recipient = await User.findById(recipientId).select('followers');
    if (!recipient) return false;
    return recipient.followers && recipient.followers.some(id => id.toString() === senderId);
  }
  return true;
}

// Helper to check profile visibility — returns { allowed, reason }
async function checkProfileVisibility(viewerId, targetUserId) {
  if (viewerId === targetUserId) return { allowed: true };
  const settings = await UserSettings.findOne({ userId: targetUserId });
  if (!settings || !settings.privacy) return { allowed: true };
  const privacy = settings.privacy.profilePrivacy || 'everyone';
  if (privacy === 'everyone') return { allowed: true };
  if (privacy === 'private') {
    return { allowed: false, reason: 'This profile is private.' };
  }
  if (privacy === 'followers') {
    const target = await User.findById(targetUserId).select('followers');
    if (!target) return { allowed: false, reason: 'User not found.' };
    const isFollower = target.followers && target.followers.some(id => id.toString() === viewerId);
    if (!isFollower) {
      return { allowed: false, reason: 'This profile is only visible to followers.' };
    }
    return { allowed: true };
  }
  return { allowed: true };
}

// Helper to check if user is suspended
async function isUserSuspended(userId) {
  const user = await User.findById(userId);
  if (!user) return false;
  if (user.isSuspended && user.suspensionEnds && new Date() < user.suspensionEnds) {
    return true;
  }
  if (user.isSuspended && user.suspensionEnds && new Date() >= user.suspensionEnds) {
    user.isSuspended = false;
    user.suspensionEnds = null;
    user.suspensionReason = null;
    await user.save();
    return false;
  }
  return false;
}

// ─── GET /api/chat/unread-count ────────────────────────────────────────────
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();

    const conversations = await Conversation.find({ participants: me }).lean();

    let totalUnread = 0;
    conversations.forEach(conv => {
      if (conv.unreadCount) {
        totalUnread += (conv.unreadCount.get ? (conv.unreadCount.get(me) || 0) : (conv.unreadCount[me] || 0));
      }
    });

    res.json({ success: true, unreadCount: totalUnread });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/chat/matches ─────────────────────────────────────────────────
router.get('/matches', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();

    const currentUser = await User.findById(me).select('favoriteGenres discussionPreferences readingHabit blockedUsers');
    const blockedUserIds = (currentUser && currentUser.blockedUsers) ? 
      currentUser.blockedUsers.map(id => id.toString()) : [];

    const users = await User.find({
      _id: { $ne: me, $nin: blockedUserIds },
      blockedUsers: { $ne: me },
      isBanned: { $ne: true },
      isAdmin: { $ne: true }
    }).select('name username profilePicture favoriteGenres discussionPreferences readingHabit favoriteBooks lastLogin').lean();

    const conversations = await Conversation.find({ participants: me }).sort({ lastMessage: -1 });

    const convMap = new Map();
    conversations.forEach(conv => {
      const other = conv.participants.find(p => p.toString() !== me);
      if (other) {
        const visibleMessages = conv.messages.filter(msg => isMessageVisibleToUser(msg, me));
        
        const lastMsg = visibleMessages[visibleMessages.length - 1];
        let preview = 'No messages yet';
        if (lastMsg) {
          if (lastMsg.content && lastMsg.content.trim()) {
            let contentText = lastMsg.content.replace(/\[SPOILER\]([\s\S]*?)\[\/SPOILER\]/gi, '[Spoiler]');
            preview = contentText.length > 50 ? contentText.substring(0, 47) + '...' : contentText;
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

    // Try to get AI match scores
    let aiMatchesMap = new Map();
    try {
      const axios = require('axios');
      const FASTAPI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const userProfileForAI = await User.findById(me).select('-password -resetToken -resetTokenExpiry');
      const aiResponse = await axios.post(`${FASTAPI_URL}/match`, {
        userProfile: userProfileForAI.toObject(),
        currentUserId: me
      });
      if (aiResponse.data && Array.isArray(aiResponse.data)) {
        aiResponse.data.forEach(match => {
          aiMatchesMap.set(match.userId.toString(), match.score);
        });
      }
    } catch (e) {
      console.warn('Chat AI matching fallback used due to error:', e.message);
    }

    const matches = users.map(user => {
      const info = convMap.get(user._id.toString()) || {};
      
      let compatibility = 70;
      if (aiMatchesMap.has(user._id.toString())) {
        let score = aiMatchesMap.get(user._id.toString());
        if (score > 0 && score <= 1) {
          compatibility = Math.round(score * 100);
        } else if (score > 1 && score <= 100) {
          compatibility = Math.round(score);
        } else if (score > 100) {
          if (score % 100 === 0 && score <= 10000) {
            compatibility = Math.round(score / 100);
          } else {
            compatibility = Math.round(score % 100);
          }
        }
      } else if (currentUser.favoriteGenres && user.favoriteGenres) {
        const shared = currentUser.favoriteGenres.filter(g => user.favoriteGenres.includes(g));
        compatibility = Math.min(100, 70 + (shared.length * 5));
      }
      compatibility = Math.floor(compatibility);

      // Generate Explanation
      const commonGenres = (currentUser.favoriteGenres || []).filter(g => (user.favoriteGenres || []).includes(g));
      const commonDiscussion = (currentUser.discussionPreferences || []).filter(d => (user.discussionPreferences || []).includes(d));
      const commonHabit = currentUser.readingHabit && user.readingHabit && currentUser.readingHabit === user.readingHabit ? currentUser.readingHabit : null;

      let explanationParts = [];
      if (commonGenres.length > 0) {
          explanationParts.push(`enjoy ${commonGenres[0]}`);
      }
      if (commonDiscussion.length > 0) {
          const styleStr = commonDiscussion[0].toLowerCase().includes('discussion') ? commonDiscussion[0].toLowerCase() : `${commonDiscussion[0].toLowerCase()} discussions`;
          explanationParts.push(`prefer ${styleStr}`);
      }
      if (commonHabit && explanationParts.length < 2) {
          explanationParts.push(`are both ${commonHabit.toLowerCase()} readers`);
      }

      let explanation = "You have similar reading interests.";
      if (explanationParts.length === 1) {
          explanation = `You both ${explanationParts[0]}.`;
      } else if (explanationParts.length >= 2) {
          explanation = `You both ${explanationParts[0]} and ${explanationParts[1]}.`;
      }

      return {
        _id:            user._id,
        id:             user._id,
        name:           user.name || 'User',
        username:       user.username,
        profilePicture: user.profilePicture,
        genre:          (user.favoriteGenres && user.favoriteGenres[0]) || 'Reader',
        preview:        info.lastMessage || 'No messages yet',
        explanation:    explanation,
        online:         user.lastLogin ? (Date.now() - new Date(user.lastLogin) < 5 * 60 * 1000) : false,
        unreadCount:    info.unreadCount || 0,
        conversationId: info.conversationId,
        compatibility,
        lastMessageTime: info.lastMessageTime || null
      };
    }).sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return (a.name || '').localeCompare(b.name || '');
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

    const isMatchBlocked = await isBlocked(me, req.params.matchId);
    if (isMatchBlocked) {
      return res.json({ success: true, messages: [], conversationId: null, blocked: true });
    }

    const conv = await Conversation.findOne({
      participants: { $all: [me, req.params.matchId], $size: 2 }
    }).populate('messages.sender', 'name profilePicture');

    if (!conv) return res.json({ success: true, messages: [], conversationId: null });

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

    res.json({ success: true, messages: messages, conversationId: conv._id });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ success: false, message: 'Error fetching messages' });
  }
});

// ─── POST /api/chat/messages — text message HTTP fallback with filter ─────
router.post('/messages', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const { matchId, content, type = 'text' } = req.body;

    if (!matchId)  return res.status(400).json({ success: false, message: 'Recipient ID required' });
    if (!content)  return res.status(400).json({ success: false, message: 'Message content required' });

    // Check if user is suspended
    const isSuspended = await isUserSuspended(me);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(me);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended. You cannot send messages.',
        suspended: true
      });
    }

    // Check if recipient is blocked
    const isRecipientBlocked = await isBlocked(me, matchId);
    if (isRecipientBlocked) {
      return res.status(403).json({ success: false, message: 'You cannot message a blocked user' });
    }

    // Check if current user is blocked by recipient
    const isBlockedByRecipient = await isBlocked(matchId, me);
    if (isBlockedByRecipient) {
      return res.status(403).json({ success: false, message: 'You cannot message this user' });
    }

    // Check recipient's message privacy setting
    const canMsg = await canMessageUser(me, matchId);
    if (!canMsg) {
      const recipientSettings = await UserSettings.findOne({ userId: matchId });
      const msgPrivacy = recipientSettings?.privacy?.messagePrivacy || 'everyone';
      let msg;
      if (msgPrivacy === 'none') {
        msg = 'This user is not accepting messages.';
      } else {
        msg = 'This user only accepts messages from followers.';
      }
      return res.status(403).json({ success: false, message: msg, privacyBlocked: true });
    }

    // Apply content filtering
    const filterResult = await FilterService.checkAndProcess(content, me, 'chat', matchId);
    
    if (!filterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: filterResult.message,
        warningIssued: filterResult.warningIssued,
        warningCount: filterResult.warningCount,
        suspended: filterResult.suspended
      });
    }

    let conv = await Conversation.findOne({ participants: { $all: [me, matchId], $size: 2 } });
    if (!conv) {
      conv = new Conversation({ participants: [me, matchId], messages: [], unreadCount: {} });
    }

    // Use censored text if there was a violation
    const finalContent = filterResult.hasViolation ? filterResult.censoredText : content;
    const wasFiltered = filterResult.hasViolation;

    const msg = { 
      _id: new mongoose.Types.ObjectId(), 
      sender: me, 
      content: finalContent, 
      type, 
      read: false, 
      createdAt: new Date(),
      unsent: false,
      deletedFor: [],
      wasFiltered: wasFiltered
    };
    conv.messages.push(msg);
    conv.lastMessage = new Date();
    conv.lastMessagePreview = finalContent.length > 50 ? finalContent.substring(0, 47) + '...' : finalContent;
    setUnread(conv, matchId, getUnread(conv, matchId) + 1);
    await conv.save();

    const sender = await User.findById(me).select('name profilePicture');
    
    const responseMessage = {
      _id: msg._id,
      sender: me,
      senderName: sender.name,
      content: finalContent,
      type,
      read: false,
      createdAt: msg.createdAt,
      wasFiltered: wasFiltered
    };
    
    if (filterResult.warningIssued) {
      responseMessage.warning = filterResult.message;
      responseMessage.warningCount = filterResult.warningCount;
    }
    
    res.json({ 
      success: true, 
      message: responseMessage,
      conversationId: conv._id,
      warningIssued: filterResult.warningIssued,
      warningMessage: filterResult.message
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Error sending message' });
  }
});

// ─── POST /api/chat/messages/attachment — base64 attachment with filter ───
router.post('/messages/attachment', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const { recipientId, data, mimeType, filename, size, category, caption } = req.body;

    if (!recipientId) return res.status(400).json({ success: false, message: 'Recipient ID required' });
    if (!data || !mimeType) return res.status(400).json({ success: false, message: 'File data required' });
    if (data.length > 9 * 1024 * 1024) return res.status(400).json({ success: false, message: 'File too large (max 6 MB)' });

    // Check if user is suspended
    const isSuspended = await isUserSuspended(me);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(me);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended.',
        suspended: true
      });
    }

    // Check if recipient is blocked
    const isRecipientBlocked = await isBlocked(me, recipientId);
    if (isRecipientBlocked) {
      return res.status(403).json({ success: false, message: 'You cannot message a blocked user' });
    }

    // Check if current user is blocked by recipient
    const isBlockedByRecipient = await isBlocked(recipientId, me);
    if (isBlockedByRecipient) {
      return res.status(403).json({ success: false, message: 'You cannot message this user' });
    }

    // Check recipient's message privacy setting
    const canMsg = await canMessageUser(me, recipientId);
    if (!canMsg) {
      const recipientSettings = await UserSettings.findOne({ userId: recipientId });
      const msgPrivacy = recipientSettings?.privacy?.messagePrivacy || 'everyone';
      let msg;
      if (msgPrivacy === 'none') {
        msg = 'This user is not accepting messages.';
      } else {
        msg = 'This user only accepts messages from followers.';
      }
      return res.status(403).json({ success: false, message: msg, privacyBlocked: true });
    }

    // Apply content filtering to caption if present
    let finalCaption = caption || '';
    let filterResult = null;
    
    if (finalCaption && finalCaption.trim()) {
      filterResult = await FilterService.checkAndProcess(finalCaption, me, 'chat', recipientId);
      if (!filterResult.allowed) {
        return res.status(403).json({
          success: false,
          message: filterResult.message,
          warningIssued: filterResult.warningIssued,
          warningCount: filterResult.warningCount,
          suspended: filterResult.suspended
        });
      }
      finalCaption = filterResult.hasViolation ? filterResult.censoredText : finalCaption;
    }

    let conv = await Conversation.findOne({ participants: { $all: [me, recipientId], $size: 2 } });
    if (!conv) {
      conv = new Conversation({ participants: [me, recipientId], messages: [], unreadCount: {} });
    }

    const msgType = category === 'image' ? 'image' : 'file';
    const msg = {
      _id:        new mongoose.Types.ObjectId(),
      sender:     me,
      content:    finalCaption,
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

    notifySocket(recipientId.toString(), 'chat:message', {
      _id: msg._id, senderId: me, senderName: sender.name,
      content: finalCaption, type: msgType,
      attachment: { data, mimeType, filename, size, category },
      createdAt: msg.createdAt, conversationId: conv._id, isFromOthers: true
    });

    const responseData = {
      success: true,
      message: { _id: msg._id, sender: me, content: finalCaption, type: msgType, attachment: { data, mimeType, filename, size, category }, createdAt: msg.createdAt, conversationId: conv._id }
    };
    
    if (filterResult && filterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = filterResult.message;
      responseData.warningCount = filterResult.warningCount;
    }
    
    res.json(responseData);
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

    const isParticipantBlocked = await isBlocked(me, participantId);
    if (isParticipantBlocked) {
      return res.status(403).json({ success: false, message: 'Cannot create conversation with blocked user' });
    }

    // Check if current user is blocked by the participant
    const isBlockedByParticipant = await isBlocked(participantId, me);
    if (isBlockedByParticipant) {
      return res.status(403).json({ success: false, message: 'You cannot message this user' });
    }

    // Check message privacy setting
    const canMsg = await canMessageUser(me, participantId);
    if (!canMsg) {
      const settings = await UserSettings.findOne({ userId: participantId });
      const msgPrivacy = settings?.privacy?.messagePrivacy || 'everyone';
      const msg = msgPrivacy === 'none'
        ? 'This user is not accepting messages.'
        : 'This user only accepts messages from followers.';
      return res.status(403).json({ success: false, message: msg });
    }

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

// ─── POST /api/chat/conversations/:id/messages with filter ────────────────
router.post('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const me   = req.user._id.toString();
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conv.participants.some(p => p.toString() === me)) return res.status(403).json({ success: false, message: 'Not authorized' });

    const recipientId = conv.participants.find(p => p.toString() !== me).toString();

    // Check if user is suspended
    const isSuspended = await isUserSuspended(me);
    if (isSuspended) {
      const suspensionMsg = await FilterService.getSuspensionMessage(me);
      return res.status(403).json({ 
        success: false, 
        message: suspensionMsg?.message || 'Your account is suspended.',
        suspended: true
      });
    }

    const isRecipientBlocked = await isBlocked(me, recipientId);
    if (isRecipientBlocked) {
      return res.status(403).json({ success: false, message: 'You cannot message a blocked user' });
    }

    // Check recipient's message privacy setting
    const canMsg = await canMessageUser(me, recipientId);
    if (!canMsg) {
      const recipientSettings = await UserSettings.findOne({ userId: recipientId });
      const msgPrivacy = recipientSettings?.privacy?.messagePrivacy || 'everyone';
      let msg;
      if (msgPrivacy === 'none') {
        msg = 'This user is not accepting messages.';
      } else {
        msg = 'This user only accepts messages from followers.';
      }
      return res.status(403).json({ success: false, message: msg, privacyBlocked: true });
    }

    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, message: 'Message content required' });
    }

    // Apply content filtering
    const filterResult = await FilterService.checkAndProcess(content, me, 'chat', recipientId);
    
    if (!filterResult.allowed) {
      return res.status(403).json({
        success: false,
        message: filterResult.message,
        warningIssued: filterResult.warningIssued,
        warningCount: filterResult.warningCount,
        suspended: filterResult.suspended
      });
    }

    const finalContent = filterResult.hasViolation ? filterResult.censoredText : content;

    const msg = { 
      _id: new mongoose.Types.ObjectId(), 
      sender: me, 
      content: finalContent, 
      type: 'text', 
      read: false, 
      createdAt: new Date(),
      unsent: false,
      deletedFor: []
    };
    conv.messages.push(msg);
    conv.lastMessage = new Date();
    conv.lastMessagePreview = finalContent.length > 50 ? finalContent.substring(0, 47) + '...' : finalContent;
    setUnread(conv, recipientId, getUnread(conv, recipientId) + 1);
    await conv.save();

    const sender = await User.findById(me).select('name profilePicture');
    
    const responseData = { 
      success: true, 
      message: { _id: msg._id, sender: me, senderName: sender.name, content: finalContent, type: 'text', read: false, createdAt: msg.createdAt } 
    };
    
    if (filterResult.warningIssued) {
      responseData.warningIssued = true;
      responseData.warningMessage = filterResult.message;
      responseData.warningCount = filterResult.warningCount;
    }
    
    res.json(responseData);
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Error sending message' });
  }
});

// ─── DELETE /api/chat/messages/:id/delete-for-me ──────────────────────────
router.delete('/messages/:messageId/delete-for-me', authenticate, async (req, res) => {
  try {
    const me   = req.user._id.toString();
    const conv = await Conversation.findOne({ 'messages._id': req.params.messageId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msg = conv.messages.id(req.params.messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (msg.unsent) {
      return res.status(400).json({ success: false, message: 'Message already unsent for everyone' });
    }

    if (!msg.deletedFor) {
      msg.deletedFor = [];
    }

    const alreadyDeleted = msg.deletedFor.some(id => id.toString() === me);
    if (!alreadyDeleted) {
      msg.deletedFor.push(new mongoose.Types.ObjectId(me));
    }

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

// ─── DELETE /api/chat/messages/:id/unsend ──────────────────────────────────
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

    msg.unsent = true;
    msg.content = '';
    msg.attachment = null;
    msg.deletedFor = [];

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

// ─── POST /api/chat/block/:userId ─────────────────────────────────────────
router.post('/block/:userId', authenticate, async (req, res) => {
  try {
    const me       = req.user._id.toString();
    const targetId = req.params.userId;

    if (me === targetId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    const target = await User.findById(targetId).select('name email profilePicture');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const currentUser = await User.findById(me);
    
    if (currentUser.blockedUsers && currentUser.blockedUsers.includes(targetId)) {
      return res.status(400).json({ success: false, message: 'User is already blocked' });
    }

    if (!currentUser.blockedUsers) currentUser.blockedUsers = [];
    currentUser.blockedUsers.push(targetId);
    await currentUser.save();

    try {
      const io = global.io;
      if (io && io.broadcastToAdmins) {
        io.broadcastToAdmins({
          type: 'admin-notification',
          notificationType: 'admin_user_blocked',
          title: 'User Blocked',
          message: `${currentUser.name} has blocked ${target.name}`,
          timestamp: new Date(),
          priority: 'low',
          metadata: {
            blockerId: me,
            blockerName: currentUser.name,
            blockedId: targetId,
            blockedName: target.name
          }
        });
      }
    } catch (socketErr) {
      console.error('Block WebSocket notify error:', socketErr);
    }

    res.json({ success: true, message: `You have blocked ${target.name}` });
  } catch (err) {
    console.error('Block user error:', err);
    res.status(500).json({ success: false, message: 'Failed to block user' });
  }
});

// ─── DELETE /api/chat/unblock/:userId ─────────────────────────────────────
router.delete('/unblock/:userId', authenticate, async (req, res) => {
  try {
    const me       = req.user._id.toString();
    const targetId = req.params.userId;

    const currentUser = await User.findById(me);
    
    if (!currentUser.blockedUsers || !currentUser.blockedUsers.includes(targetId)) {
      return res.status(400).json({ success: false, message: 'User is not blocked' });
    }

    currentUser.blockedUsers = currentUser.blockedUsers.filter(id => id.toString() !== targetId);
    await currentUser.save();

    const target = await User.findById(targetId);
    const targetName = target ? target.name : 'User';

    res.json({ success: true, message: `You have unblocked ${targetName}` });
  } catch (err) {
    console.error('Unblock user error:', err);
    res.status(500).json({ success: false, message: 'Failed to unblock user' });
  }
});

// ─── GET /api/chat/blocked/list ───────────────────────────────────────────
router.get('/blocked/list', authenticate, async (req, res) => {
  try {
    const me = req.user._id.toString();
    
    const currentUser = await User.findById(me).populate('blockedUsers', 'name username profilePicture favoriteGenres');
    
    const blockedList = currentUser.blockedUsers || [];
    
    res.json({
      success: true,
      blockedUsers: blockedList,
      total: blockedList.length
    });
  } catch (err) {
    console.error('Get blocked users error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch blocked users' });
  }
});

// ─── POST /api/chat/report/:userId ────────────────────────────────────────
router.post('/report/:userId', authenticate, async (req, res) => {
  try {
    const me       = req.user._id.toString();
    const targetId = req.params.userId;

    if (me === targetId) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself' });
    }

    const { reason, category = 'harassment', description = '' } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required' });
    }

    const target = await User.findById(targetId).select('name email profilePicture');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const Report = require('../models/Report');

    const duplicate = await Report.findOne({
      reporter: me,
      reportedUser: targetId,
      status: 'pending'
    });
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'You already have a pending report against this user' });
    }

    const validCategories = [
      'inappropriate_content', 'harassment', 'hate_speech',
      'spam', 'fake_account', 'impersonation',
      'privacy_violation', 'copyright', 'other'
    ];
    const safeCategory = validCategories.includes(category) ? category : 'other';

    const report = new Report({
      reporter:         me,
      reportedUser:     targetId,
      reportedItemId:   targetId,
      reportedItemType: 'user',
      reason:           reason.trim(),
      category:         safeCategory,
      description:      description.trim(),
      status:           'pending',
      priority:         'medium'
    });
    report.wasNew = true;
    await report.save();

    res.json({ success: true, message: 'Report submitted. Our moderation team will review it shortly.' });
  } catch (err) {
    console.error('Report user error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit report' });
  }
});

// ─── GET /api/chat/check-message — preview filter check ────────────────────
router.post('/check-message', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.json({ success: true, hasViolation: false, censoredText: content });
    }
    
    const result = await FilterService.checkOnly(content);
    
    res.json({
      success: true,
      hasViolation: result.hasViolation,
      censoredText: result.censoredText,
      matches: result.matches.map(m => ({ word: m.word, severity: m.severity, category: m.category }))
    });
  } catch (err) {
    console.error('Check message error:', err);
    res.status(500).json({ success: false, message: 'Error checking message' });
  }
});

module.exports = router;
