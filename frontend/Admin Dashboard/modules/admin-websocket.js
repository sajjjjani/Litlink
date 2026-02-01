// Admin Dashboard – WebSocket for real-time notifications
(function () {
  'use strict';

  var adminSocket = null;
  var adminSocketReconnectTimer = null;
  var adminSocketPingTimer = null;
  var callbacks = null;

  function init(opts) {
    callbacks = opts || {};
    var authToken = window.authToken || opts.authToken;
    if (!authToken) {
      console.warn('No authToken available for WebSocket auth');
      return;
    }
    var protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    var host = opts.wsHost || 'localhost:5002';
    var wsUrl = protocol + '://' + host + '?token=' + encodeURIComponent(authToken);
    try {
      console.log('🔌 Connecting to admin WebSocket:', wsUrl);
      adminSocket = new WebSocket(wsUrl);

      adminSocket.onopen = function () {
        console.log('✅ Admin WebSocket connected');
        setTimeout(function () {
          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            try {
              adminSocket.send(JSON.stringify({ type: 'get-unread-count' }));
            } catch (e) {
              console.error('Error sending get-unread-count:', e);
            }
          }
        }, 100);
        if (adminSocketPingTimer) clearInterval(adminSocketPingTimer);
        adminSocketPingTimer = setInterval(function () {
          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            try {
              adminSocket.send(JSON.stringify({ type: 'ping' }));
            } catch (e) {}
          }
        }, 25000);
      };

      adminSocket.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e, event.data);
        }
      };

      adminSocket.onclose = function (event) {
        if (adminSocketPingTimer) {
          clearInterval(adminSocketPingTimer);
          adminSocketPingTimer = null;
        }
        console.warn('Admin WebSocket closed:', event.code, event.reason);
        scheduleReconnect();
      };

      adminSocket.onerror = function (error) {
        console.error('Admin WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to open admin WebSocket:', error);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (adminSocketReconnectTimer) return;
    adminSocketReconnectTimer = setTimeout(function () {
      adminSocketReconnectTimer = null;
      if (window.authToken) {
        console.log('🔄 Reconnecting admin WebSocket...');
        init({ authToken: window.authToken, wsHost: 'localhost:5002' });
      }
    }, 5000);
  }

  function handleMessage(data) {
    if (!data || !data.type) return;
    var cb = callbacks;
    switch (data.type) {
      case 'admin-authenticated':
        console.log('Admin WebSocket authenticated as:', data.userName);
        if (typeof cb.updateStatusIndicator === 'function' && typeof data.connectedAdmins === 'number') {
          cb.updateStatusIndicator(data.connectedAdmins);
        }
        break;
      case 'notification-count':
        if (typeof cb.updateNotificationBadge === 'function' && typeof data.unreadCount === 'number') {
          cb.updateNotificationBadge(data.unreadCount);
        }
        break;
      case 'admin-notification':
        if (typeof cb.showNotificationToast === 'function') cb.showNotificationToast(data);
        if (typeof cb.updateNotificationBadge === 'function') cb.updateNotificationBadge('+1');
        break;
      case 'pong':
      case 'test-response':
        console.log('WebSocket heartbeat/test:', data);
        break;
      default:
        console.log('Admin WebSocket message:', data);
    }
  }

  window.AdminWebSocket = window.AdminWebSocket || {};
  window.AdminWebSocket.init = init;
  window.AdminWebSocket.scheduleReconnect = scheduleReconnect;
})();
