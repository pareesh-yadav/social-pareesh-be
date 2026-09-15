import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import messageRoutes from './routes/messageRoutes';
import conversationRoutes from './routes/conversationRoutes';
import friendRoutes from './routes/friendRoutes';
import callRoutes from './routes/callRoutes';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  'http://localhost:5173,http://localhost:5174,http://localhost:5175,https://chatly-drab.vercel.app,https://social-pareesh-production.up.railway.app'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

import rateLimit from 'express-rate-limit';

export const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
) => {
  if (!origin || allowedOrigins.includes(origin) || /^(https?:\/\/)(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    callback(null, origin || true);
    return;
  }

  callback(new Error(`Origin ${origin} not allowed by CORS`));
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOriginHandler, credentials: true }));
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', messageRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/calls', callRoutes);

  app.get('/', (_req, res) => res.json({
    success: true,
    message: 'Welcome to the Social Pareesh API',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health', (_req, res) => res.json({
    success: true,
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const app = createApp();