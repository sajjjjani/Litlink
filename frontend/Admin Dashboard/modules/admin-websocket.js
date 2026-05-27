(function() {
    'use strict';
    
    let ws = null;
    let reconnectTimer = null;
    let pingInterval = null;
    let callbacks = {};
    let isConnecting = false;
    
    function init(options) {
        callbacks = options || {};
        const authToken = window.authToken || options.authToken;
        
        if (!authToken) {
            console.warn('No authToken for WebSocket');
            return;
        }
        
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            console.log('WebSocket already connected or connecting');
            return;
        }
        
        if (isConnecting) return;
        isConnecting = true;
        
        const backendOrigin = window.LitlinkConfig?.backendOrigin || 'http://localhost:5002';
        const backendUrl = new URL(backendOrigin);
        const protocol = backendUrl.protocol === 'https:' ? 'wss' : 'ws';
        const host = options.wsHost || backendUrl.host;
        const wsUrl = `${protocol}://${host}?token=${encodeURIComponent(authToken)}`;
        
        console.log('🔌 Connecting to WebSocket:', wsUrl);
        
        try {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log('✅ WebSocket connected');
                isConnecting = false;
                
                if (pingInterval) clearInterval(pingInterval);
                pingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 25000);
                
                // Request unread count
                setTimeout(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'get-unread-count' }));
                    }
                }, 500);
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                isConnecting = false;
            };
            
            ws.onclose = () => {
                console.log('WebSocket disconnected');
                isConnecting = false;
                if (pingInterval) clearInterval(pingInterval);
                scheduleReconnect();
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            isConnecting = false;
            scheduleReconnect();
        }
    }
    
    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (window.authToken) {
                console.log('🔄 Reconnecting WebSocket...');
                init({ authToken: window.authToken });
            }
        }, 5000);
    }
    
    function handleMessage(data) {
        if (!data || !data.type) return;
        
        switch(data.type) {
            case 'admin-authenticated':
                console.log('WebSocket authenticated as:', data.userName);
                if (callbacks.updateStatusIndicator && typeof data.connectedAdmins === 'number') {
                    callbacks.updateStatusIndicator(data.connectedAdmins);
                }
                break;
                
            case 'notification-count':
                if (callbacks.updateNotificationBadge && typeof data.unreadCount === 'number') {
                    callbacks.updateNotificationBadge(data.unreadCount);
                }
                break;
                
            case 'admin-notification':
                if (callbacks.showNotificationToast) {
                    callbacks.showNotificationToast(data);
                }
                if (callbacks.updateNotificationBadge) {
                    callbacks.updateNotificationBadge('+1');
                }
                break;
                
            case 'pong':
                // Heartbeat response
                break;
                
            default:
                console.log('WebSocket message:', data);
        }
    }
    
    function send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected');
        }
    }
    
    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
        isConnecting = false;
    }
    
    window.AdminWebSocket = window.AdminWebSocket || {};
    window.AdminWebSocket.init = init;
    window.AdminWebSocket.send = send;
    window.AdminWebSocket.disconnect = disconnect;
    window.AdminWebSocket.scheduleReconnect = scheduleReconnect;
})();
