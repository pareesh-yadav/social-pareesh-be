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
import mediaRoutes from './routes/mediaRoutes';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const envOrigins = [
  process.env.CORS_ORIGIN,
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .flatMap((str) => (str ? str.split(',') : []))
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://chatly-x.vercel.app'
];

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));

import rateLimit from 'express-rate-limit';

export const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
) => {
  // Allow requests without Origin header (curl, mobile apps, server-to-server)
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalized = origin.trim().replace(/\/$/, '');

  // 1. Explicit allowed list
  if (allowedOrigins.includes(normalized)) {
    callback(null, normalized);
    return;
  }

  // 2. Allow any localhost or 127.0.0.1 on any port
  if (/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    callback(null, normalized);
    return;
  }

  // 3. Allow Vercel deployments (production, previews, branches)
  if (/^https:\/\/.*\.vercel\.app$/.test(normalized)) {
    callback(null, normalized);
    return;
  }

  // 4. Allow Railway backend domain if accessed directly
  if (/^https:\/\/.*\.up\.railway\.app$/.test(normalized)) {
    callback(null, normalized);
    return;
  }

  // Reject without throwing a 500 server error
  callback(null, false);
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

const corsMiddleware = cors({
  origin: corsOriginHandler,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

export const createApp = () => {
  const app = express();

  // Allow cross-origin resources from trusted origins without Helmet blocking
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', messageRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/calls', callRoutes);
  app.use('/api/media', mediaRoutes);

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