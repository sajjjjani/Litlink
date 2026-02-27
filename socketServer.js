const { Server } = require('socket.io');

class SocketServer {
  constructor(server) {
    console.log('🔌 Initializing Socket.IO server...');
    console.log('📡 Server object received:', !!server);
    
    if (!server) {
      throw new Error('HTTP server instance is required');
    }
    
    try {
      // Create Socket.IO server and attach to HTTP server
      this.io = new Server(server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
          credentials: true
        },
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        allowEIO3: true,
        connectTimeout: 45000,
        pingTimeout: 30000,
        pingInterval: 25000
      });

      console.log('✅ Socket.IO server instance created');
      console.log(`   Path: ${this.io.path()}`);
      console.log(`   Transports: polling, websocket`);

      // Handle connections
      this.io.on('connection', (socket) => {
        console.log('✅ Client connected to Socket.IO:', socket.id);
        
        socket.on('disconnect', (reason) => {
          console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
        });

        socket.on('error', (error) => {
          console.error('Socket error:', error);
        });
      });

      // Verify the server is attached
      console.log('✅ Socket.IO server is ready and listening');
      
    } catch (error) {
      console.error('❌ Failed to create Socket.IO server:', error);
      throw error;
    }
  }
}

module.exports = SocketServer;
