import crypto from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const prisma = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  friendRequest: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  callLog: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  conversation: { findUnique: jest.fn(), update: jest.fn() },
  message: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  readReceipt: { upsert: jest.fn() },
};

jest.mock('../src/config/database', () => ({ prisma }));
jest.mock('../src/utils/sendEmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/utils/password', () => ({
  passwordUtils: {
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    comparePasswords: jest.fn().mockResolvedValue(true),
  },
}));

import { app } from '../src/app';

const user = (overrides = {}) => ({
  id: 'user-1', username: 'alice', email: 'alice@example.com', passwordHash: 'hash',
  status: 'online', profilePicUrl: null, bio: null, lastSeen: null, createdAt: new Date(),
  ...overrides,
});

const tokenFor = (userId = 'user-1') => jwt.sign({ userId, email: 'alice@example.com' }, 'secret');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authentication and password security', () => {
  test('registers a pending user and stores a hashed OTP', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ ...user({ ...data }), id: 'new-user' }));

    const response = await request(app).post('/api/auth/register').send({
      username: 'alice', email: 'ALICE@example.com', password: 'Strong1!password',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.requiresVerification).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'pending_verification' }),
    }));
    const saved = prisma.user.create.mock.calls[0][0].data;
    expect(saved.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.resetPasswordToken).not.toHaveLength(6);
  });

  test('verifies a valid six-digit OTP, activates the user, and returns two JWTs', async () => {
    const otp = '123456';
    prisma.user.findFirst.mockResolvedValue(user({ resetPasswordToken: crypto.createHash('sha256').update(otp).digest('hex') }));
    prisma.user.update.mockResolvedValue(user({ status: 'online' }));

    const response = await request(app).post('/api/auth/verify-registration').send({ email: 'alice@example.com', otp });

    expect(response.status).toBe(200);
    expect(response.body.data.token).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'online', resetPasswordToken: null }) }));
  });

  test('blocks pending users from logging in', async () => {
    prisma.user.findUnique.mockResolvedValue(user({ status: 'pending_verification' }));

    const response = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'Strong1!password' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/verify/i);
  });

  test('rotates both access and refresh tokens', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    const response = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'Strong1!password' });
    expect(response.status).toBe(200);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: response.body.data.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.token).toBeTruthy();
    expect(refreshed.body.data.refreshToken).toBeTruthy();
    expect(refreshed.body.data.refreshToken).not.toBe(response.body.data.refreshToken);
  });

  test('returns the same forgot-password success response for unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const response = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account/i);
  });

  test('hashes reset OTP and rejects expired reset tokens', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.user.update.mockResolvedValue(user());
    await request(app).post('/api/auth/forgot-password').send({ email: 'alice@example.com' });
    const saved = prisma.user.update.mock.calls[0][0];
    expect(saved.data.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.data.resetPasswordExpire.getTime()).toBeGreaterThan(Date.now());

    prisma.user.findFirst.mockResolvedValue(null);
    const expired = await request(app).patch('/api/auth/reset-password').send({ email: 'alice@example.com', otp: '123456', password: 'NewStrong1!' });
    expect(expired.status).toBe(401);
  });
});

describe('friends, calls, and protected routes', () => {
  test.each(['/api/auth/me', '/api/friends', '/api/calls/history', '/api/conversations/c1/messages'])('rejects %s without auth', async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
  });

  test.each(['not-a-token', jwt.sign({ userId: 'user-1' }, 'wrong-secret'), `${tokenFor()}.tampered`])('rejects malformed or invalid token %s', async (token) => {
    const response = await request(app).get('/api/friends').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  test('sends a friend request and rejects self and duplicate requests', async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.friendRequest.findFirst.mockResolvedValue(null);
    prisma.friendRequest.create.mockResolvedValue({ id: 'request-1', senderId: 'user-1', receiverId: 'user-2', status: 'pending' });
    const sent = await request(app).post('/api/friends/request').set('Authorization', `Bearer ${tokenFor()}`).send({ receiverId: 'user-2' });
    expect(sent.status).toBe(201);

    const self = await request(app).post('/api/friends/request').set('Authorization', `Bearer ${tokenFor()}`).send({ receiverId: 'user-1' });
    expect(self.status).toBe(400);
    prisma.friendRequest.findFirst.mockResolvedValue({ status: 'pending' });
    const duplicate = await request(app).post('/api/friends/request').set('Authorization', `Bearer ${tokenFor()}`).send({ receiverId: 'user-2' });
    expect(duplicate.status).toBe(409);
  });

  test('accepts and rejects only requests addressed to the authenticated user', async () => {
    prisma.friendRequest.findUnique.mockResolvedValue({ id: 'request-1', senderId: 'user-2', receiverId: 'user-1', status: 'pending' });
    prisma.friendRequest.update.mockResolvedValue({ id: 'request-1', status: 'accepted' });
    const accepted = await request(app).patch('/api/friends/requests/request-1').set('Authorization', `Bearer ${tokenFor()}`);
    expect(accepted.status).toBe(200);
    prisma.friendRequest.findUnique.mockResolvedValue({ id: 'request-2', senderId: 'user-1', receiverId: 'user-2', status: 'pending' });
    const forbidden = await request(app).delete('/api/friends/requests/request-2').set('Authorization', `Bearer ${tokenFor()}`);
    expect(forbidden.status).toBe(403);
  });

  test('returns relational call history data', async () => {
    prisma.callLog.findMany.mockResolvedValue([{ id: 'call-1', callerId: 'user-1', receiverId: 'user-2', type: 'video', status: 'missed', caller: { id: 'user-1', username: 'alice' }, receiver: { id: 'user-2', username: 'bob' } }]);
    prisma.callLog.count.mockResolvedValue(1);
    const response = await request(app).get('/api/calls/history').set('Authorization', `Bearer ${tokenFor()}`);
    expect(response.status).toBe(200);
    expect(response.body.data.items[0].otherUser.username).toBe('bob');
    expect(prisma.callLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.any(Object) }));
  });
});