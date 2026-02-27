const { io } = require('socket.io-client');

console.log('🧪 Testing Socket.IO connection...\n');
console.log('Server URL: http://localhost:5002');
console.log('Path: /socket.io\n');

const socket = io('http://localhost:5002', {
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 3,
  forceNew: true
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server!');
  console.log('   Socket ID:', socket.id);
  console.log('   Transport:', socket.io.engine.transport.name);
  
  // Test authentication
  socket.emit('authenticate', 'test-token-123');
  
  // Test joining a thread after 1 second
  setTimeout(() => {
    console.log('   📢 Attempting to join thread: thread-123');
    socket.emit('join-thread', 'thread-123');
  }, 1000);
  
  // Disconnect after 3 seconds
  setTimeout(() => {
    socket.disconnect();
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  }, 3000);
});

socket.on('connected', (data) => {
  console.log('   📡 Server welcome:', data.message);
});

socket.on('authenticated', (data) => {
  console.log('   🔐 Authentication:', data.success ? 'successful' : 'failed');
});

socket.on('joined-thread', (data) => {
  console.log('   ✅ Thread join confirmed:', data.message || 'Success');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.log('\n💡 Troubleshooting tips:');
  console.log('   1. Make sure server is running on port 5002');
  console.log('   2. Check if Socket.IO is properly configured');
  console.log('   3. Try: curl http://localhost:5002/socket.io/?EIO=4&transport=polling');
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('   📡 Disconnected:', reason);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Test timeout - no connection established');
  console.log('\n💡 Make sure your server is running with: npm start');
  socket.disconnect();
  process.exit(1);
}, 10000);
