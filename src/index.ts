import { createServer } from 'http';
import { Server } from 'socket.io';

import { connectDB, disconnectDB } from './config/database';
import { setupSocketHandlers } from './utils/socketHandler';
import { app } from './app';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Socket.io
setupSocketHandlers(io);

// Server startup
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`
✅ Server running on http://localhost:${PORT}
📡 Socket.io running on ws://localhost:${PORT}
🌍 Environment: ${NODE_ENV}
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  httpServer.close(async () => {
    await disconnectDB();
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();