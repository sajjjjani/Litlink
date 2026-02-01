// socketServer.js - Complete WebSocket server for real-time admin notifications
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

class SocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connectedAdmins = new Map(); // adminId -> WebSocket
    this.connectedUsers = new Map(); // userId -> WebSocket
    this.setup();
  }

  setup() {
    this.wss.on('connection', async (ws, req) => {
      console.log('🔌 New WebSocket connection attempt');
      
      try {
        // Get token from URL query or auth header
        const token = this.extractToken(req);
        if (!token) {
          ws.close(1008, 'Authentication required');
          return;
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          ws.close(1008, 'User not found');
          return;
        }

        // Store connection
        ws.userId = user._id.toString();
        ws.user = user;
        ws.role = user.isAdmin ? 'admin' : 'user';

        // Track connections
        this.connectedUsers.set(ws.userId, ws);
        if (user.isAdmin) {
          this.connectedAdmins.set(ws.userId, ws);
        }
        
        console.log(`✅ ${ws.role} connected: ${user.name} (${ws.userId})`);
        console.log(`📊 Connected users: ${this.connectedUsers.size} | connected admins: ${this.connectedAdmins.size}`);
        
        // Send initial connection confirmation
        ws.send(JSON.stringify({
          type: ws.role === 'admin' ? 'admin-authenticated' : 'user-authenticated',
          success: true,
          userId: ws.userId,
          userName: user.name,
          role: ws.role,
          timestamp: new Date(),
          connectedAdmins: this.connectedAdmins.size,
          connectedUsers: this.connectedUsers.size
        }));

        // Set up message handlers (handleMessage is async; wrap to avoid unhandled rejection)
        ws.on('message', (message) => {
          this.handleMessage(ws, message).catch((err) => {
            console.error('WebSocket handleMessage error:', err);
          });
        });
        ws.on('close', () => this.handleClose(ws));
        ws.on('error', (error) => this.handleError(ws, error));

      } catch (error) {
        console.error('WebSocket authentication error:', error);
        ws.close(1008, 'Authentication failed');
      }
    });
  }

  extractToken(req) {
    try {
      // Check URL query string
      const url = new URL(req.url, `ws://${req.headers.host}`);
      const tokenFromQuery = url.searchParams.get('token');
      if (tokenFromQuery) {
        console.log('📝 Token extracted from URL query');
        return tokenFromQuery;
      }

      // Check Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        console.log('📝 Token extracted from Authorization header');
        return authHeader.substring(7);
      }

      console.log('❌ No token found in request');
      return null;
    } catch (error) {
      console.error('Error extracting token:', error);
      return null;
    }
  }

  async handleMessage(ws, message) {
    if (!ws.userId || ws.readyState !== WebSocket.OPEN) {
      console.log('📨 Ignoring message: connection not ready or not authenticated');
      return;
    }
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket message:', ws.userId, ws.role, data.type);

      switch (data.type) {
        case 'ping':
          this.sendSafe(ws, { type: 'pong', timestamp: new Date() });
          break;

        case 'mark-notification-read':
          console.log('Mark notification as read requested:', data);
          break;

        case 'get-unread-count':
          await this.sendUnreadCount(ws);
          break;

        case 'test':
          this.sendSafe(ws, {
            type: 'test-response',
            message: 'WebSocket is working!',
            timestamp: new Date()
          });
          break;

        case 'chat:message':
          await this.handleChatMessage(ws, data);
          break;
        case 'chat:typing':
          this.handleChatTyping(ws, data);
          break;
        case 'chat:read':
          await this.handleChatRead(ws, data);
          break;
        case 'chat:history':
          await this.handleChatHistory(ws, data);
          break;
        case 'chat:online':
          this.handleChatOnline(ws, data);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendSafe(ws, { type: 'error', message: 'Message handling failed', timestamp: new Date() });
    }
  }

  sendSafe(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('Error sending WebSocket message:', err);
      }
    }
  }

  async sendUnreadCount(ws) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const Notification = require('./models/Notification');
      const baseQuery = {
        userId: ws.userId,
        read: false,
        archived: false
      };

      if (ws.role === 'admin') {
        baseQuery.type = { $regex: '^admin_', $options: 'i' };
      } else {
        baseQuery.type = { $not: { $regex: '^admin_', $options: 'i' } };
      }

      const unreadCount = await Notification.countDocuments(baseQuery);

      this.sendSafe(ws, {
        type: 'notification-count',
        unreadCount,
        role: ws.role,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      this.sendSafe(ws, {
        type: 'notification-count',
        unreadCount: 0,
        role: ws.role,
        error: true,
        timestamp: new Date()
      });
    }
  }

  handleClose(ws) {
    console.log(`❌ Disconnected: ${ws.userId} (${ws.role})`);
    if (ws.userId) {
      this.connectedUsers.delete(ws.userId);
      // Only admins exist in this map
      this.connectedAdmins.delete(ws.userId);
    }
    console.log(`📊 Connected users: ${this.connectedUsers.size} | connected admins: ${this.connectedAdmins.size}`);
  }

  handleError(ws, error) {
    console.error(`WebSocket error for ${ws.role || 'user'} ${ws.userId}:`, error);
  }

  // Send notification to specific admin
  sendToAdmin(adminId, data) {
    const ws = this.connectedAdmins.get(adminId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
        console.log(`📤 Sent notification to admin ${adminId}: ${data.type}`);
        return true;
      } catch (error) {
        console.error('Error sending to admin:', error);
        return false;
      }
    }
    console.log(`❌ Admin ${adminId} not connected or WebSocket not open`);
    return false;
  }

  // Send notification to specific user
  sendToUser(userId, data) {
    const ws = this.connectedUsers.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
        console.log(`📤 Sent notification to user ${userId}: ${data.type}`);
        return true;
      } catch (error) {
        console.error('Error sending to user:', error);
        return false;
      }
    }
    console.log(`❌ User ${userId} not connected or WebSocket not open`);
    return false;
  }

  // Send notification to all connected admins
  broadcastToAdmins(data) {
    let sentCount = 0;
    this.connectedAdmins.forEach((ws, adminId) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(data));
          sentCount++;
          console.log(`📤 Broadcast to admin ${adminId}: ${data.type}`);
        } catch (error) {
          console.error(`Error broadcasting to admin ${adminId}:`, error);
        }
      }
    });
    console.log(`📊 Broadcast completed: Sent to ${sentCount}/${this.connectedAdmins.size} admins`);
    return sentCount;
  }

  // Get connected admin count
  getConnectedAdminCount() {
    return this.connectedAdmins.size;
  }

  // Get list of connected admin IDs
  getConnectedAdminIds() {
    return Array.from(this.connectedAdmins.keys());
  }

  // ===== CHAT HANDLERS (user-to-user, admin-to-user) =====
  async handleChatMessage(ws, data) {
    const Conversation = require('./models/Conversation');
    const { conversationId, recipientId, content, type = 'text' } = data;
    if (!content || !recipientId) {
      this.sendSafe(ws, { type: 'chat:error', message: 'Missing recipient or content' });
      return;
    }
    try {
      const participants = [ws.userId, recipientId].sort();
      let conv = conversationId
        ? await Conversation.findById(conversationId)
        : await Conversation.findOne({ participants: { $all: participants } });
      if (!conv) {
        conv = new Conversation({
          participants,
          messages: [],
          unreadCount: { [recipientId]: 0, [ws.userId]: 0 }
        });
        await conv.save();
      }
      const msg = {
        sender: ws.userId,
        content,
        type,
        read: false
      };
      conv.messages.push(msg);
      conv.lastMessage = new Date();
      conv.lastMessagePreview = content.substring(0, 80);
      if (!conv.unreadCount) conv.unreadCount = {};
      conv.unreadCount[recipientId] = (conv.unreadCount[recipientId] || 0) + 1;
      await conv.save();
      const recipientWs = this.connectedUsers.get(recipientId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        this.sendSafe(recipientWs, {
          type: 'chat:message',
          conversationId: conv._id.toString(),
          message: { ...msg, _id: conv.messages[conv.messages.length - 1]._id, createdAt: new Date() },
          senderId: ws.userId,
          senderName: (ws.user && ws.user.name) || 'User'
        });
      }
      this.sendSafe(ws, {
        type: 'chat:message:sent',
        conversationId: conv._id.toString(),
        message: { ...msg, _id: conv.messages[conv.messages.length - 1]._id, createdAt: new Date() }
      });
    } catch (err) {
      console.error('chat:message error:', err);
      this.sendSafe(ws, { type: 'chat:error', message: 'Failed to send message' });
    }
  }

  handleChatTyping(ws, data) {
    const { recipientId, isTyping } = data;
    if (!recipientId) return;
    const recipientWs = this.connectedUsers.get(recipientId);
    if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
      this.sendSafe(recipientWs, {
        type: 'chat:typing',
        senderId: ws.userId,
        senderName: (ws.user && ws.user.name) || 'User',
        isTyping: !!isTyping
      });
    }
  }

  async handleChatRead(ws, data) {
    const Conversation = require('./models/Conversation');
    const { conversationId, messageIds } = data;
    if (!conversationId) return;
    try {
      const conv = await Conversation.findById(conversationId);
      if (!conv || !conv.participants.some(p => p.toString() === ws.userId)) return;
      const otherId = conv.participants.find(p => p.toString() !== ws.userId);
      if (messageIds && messageIds.length) {
        conv.messages.forEach(m => {
          if (messageIds.includes(m._id.toString())) m.read = true;
        });
      } else {
        conv.messages.forEach(m => {
          if (m.sender.toString() !== ws.userId) m.read = true;
        });
      }
      if (conv.unreadCount) conv.unreadCount[ws.userId] = 0;
      await conv.save();
      const senderWs = this.connectedUsers.get(otherId && otherId.toString());
      if (senderWs && senderWs.readyState === WebSocket.OPEN) {
        this.sendSafe(senderWs, { type: 'chat:read', conversationId, readerId: ws.userId });
      }
    } catch (err) {
      console.error('chat:read error:', err);
    }
  }

  async handleChatHistory(ws, data) {
    const Conversation = require('./models/Conversation');
    const { conversationId, limit = 50, before } = data;
    try {
      let conv;
      if (conversationId) {
        conv = await Conversation.findById(conversationId);
      } else if (data.otherUserId) {
        const participants = [ws.userId, data.otherUserId].sort();
        conv = await Conversation.findOne({ participants: { $all: participants, $size: 2 } });
      }
      if (!conv || !conv.participants.some(p => p.toString() === ws.userId)) {
        this.sendSafe(ws, { type: 'chat:history', messages: [], conversationId: null });
        return;
      }
      let messages = conv.messages.slice().reverse();
      if (before) {
        const idx = messages.findIndex(m => m._id.toString() === before);
        if (idx >= 0) messages = messages.slice(idx + 1);
      }
      messages = messages.slice(0, limit).map(m => ({
        _id: m._id,
        sender: m.sender.toString(),
        content: m.content,
        type: m.type,
        read: m.read,
        createdAt: m.createdAt
      }));
      this.sendSafe(ws, {
        type: 'chat:history',
        conversationId: conv._id.toString(),
        messages,
        hasMore: conv.messages.length > messages.length
      });
    } catch (err) {
      console.error('chat:history error:', err);
      this.sendSafe(ws, { type: 'chat:history', messages: [], error: true });
    }
  }

  handleChatOnline(ws, data) {
    const { userIds } = data;
    const online = {};
    (userIds || []).forEach(uid => {
      online[uid] = this.connectedUsers.has(uid);
    });
    this.sendSafe(ws, { type: 'chat:online', online });
  }
}

module.exports = SocketServer;