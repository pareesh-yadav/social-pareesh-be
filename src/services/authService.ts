import { prisma } from '../config/database';
import { passwordUtils } from '../utils/password';
import { jwtUtils } from '../utils/jwt';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';

export const authService = {
  register: async (
    username: string,
    email: string,
    password: string
  ) => {
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new ConflictError('User already exists with that email or username');
    }

    // Hash password
    const passwordHash = await passwordUtils.hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        status: 'offline',
      },
    });

    // Generate tokens
    const token = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
    });

    const refreshToken = jwtUtils.generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        profilePicUrl: user.profilePicUrl,
        bio: user.bio,
        createdAt: user.createdAt,
      },
      token,
      refreshToken,
    };
  },

  login: async (email: string, password: string) => {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await passwordUtils.comparePasswords(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate tokens
    const token = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
    });

    const refreshToken = jwtUtils.generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        profilePicUrl: user.profilePicUrl,
        bio: user.bio,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
      token,
      refreshToken,
    };
  },

  refreshToken: async (refreshToken: string) => {
    try {
      const payload = jwtUtils.verifyRefreshToken(refreshToken);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const newToken = jwtUtils.generateToken({
        userId: user.id,
        email: user.email,
      });

      const newRefreshToken = jwtUtils.generateRefreshToken({
        userId: user.id,
        email: user.email,
      });

      return {
        token: newToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }
  },

  verifyEmail: async (email: string) => {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    return !!user;
  },

  checkUsername: async (username: string) => {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    return !!user;
  },
};