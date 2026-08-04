import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';

export const userService = {
  getUserById: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        profilePicUrl: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  getUserByEmail: async (email: string) => {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        profilePicUrl: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  getUserByUsername: async (username: string) => {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        profilePicUrl: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  searchUsers: async (query: string, limit = 10, offset = 0) => {
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query cannot be empty');
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicUrl: true,
        status: true,
        bio: true,
        createdAt: true,
      },
      take: limit,
      skip: offset,
      orderBy: {
        username: 'asc',
      },
    });

    const total = await prisma.user.count({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
    });

    return {
      items: users,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  },

  updateProfile: async (
    userId: string,
    data: {
      username?: string;
      bio?: string | null;
      profilePicUrl?: string | null;
    }
  ) => {
    // Check if username is already taken
    if (data.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: data.username },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ValidationError('Username already taken');
      }
    }

    const normalizedData = {
      ...(data.username !== undefined ? { username: data.username } : {}),
      ...(data.bio !== undefined ? { bio: data.bio === '' ? null : data.bio } : {}),
      ...(data.profilePicUrl !== undefined
        ? { profilePicUrl: data.profilePicUrl === '' ? null : data.profilePicUrl }
        : {}),
    };

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...normalizedData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        profilePicUrl: true,
        status: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  },

  getUserStatus: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        lastSeen: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  updateUserStatus: async (userId: string, status: 'online' | 'offline' | 'away') => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status,
        lastSeen: new Date(),
      },
    });
  },

  getOnlineUsers: async () => {
    const users = await prisma.user.findMany({
      where: {
        status: 'online',
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicUrl: true,
        status: true,
        lastSeen: true,
      },
    });

    return users;
  },

  deleteUser: async (userId: string) => {
    await prisma.user.delete({
      where: { id: userId },
    });
  },
};