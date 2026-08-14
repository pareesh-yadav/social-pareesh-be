import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

import { connectDB, disconnectDB } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { setupSocketHandlers } from './utils/socketHandler';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import messageRoutes from './routes/messageRoutes';
import conversationRoutes from './routes/conversationRoutes';
import friendRoutes from './routes/friendRoutes';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
) => {
  if (!origin) {
    callback(null, true);
  } else if (allowedOrigins.includes(origin)) {
    callback(null, origin);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  }
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(helmet());
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io
setupSocketHandlers(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/friends', friendRoutes);

// Root route
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the Social Pareesh API',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

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
🔗 CORS Origins: ${allowedOrigins.join(', ')}
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