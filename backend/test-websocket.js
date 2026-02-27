// test-websocket.js
const io = require('socket.io-client');

const socket = io('http://localhost:5002', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 3
});

socket.on('connect', () => {
  console.log('✅ Successfully connected to WebSocket server!');
  console.log('Socket ID:', socket.id);
  
  // Test authentication
  socket.emit('authenticate', 'test-token-123');
  
  // Test joining a thread
  setTimeout(() => {
    socket.emit('join-thread', 'test-thread-123');
    console.log('📢 Joined thread: test-thread-123');
  }, 1000);
  
  // Test leaving after 5 seconds
  setTimeout(() => {
    socket.emit('leave-thread', 'test-thread-123');
    console.log('👋 Left thread: test-thread-123');
    socket.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }, 5000);
});

socket.on('connected', (data) => {
  console.log('📡 Server welcome:', data);
});

socket.on('authenticated', (data) => {
  console.log('🔐 Authentication:', data);
});

socket.on('joined-thread', (data) => {
  console.log('✅ Thread join confirmed:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('📡 Disconnected:', reason);
});