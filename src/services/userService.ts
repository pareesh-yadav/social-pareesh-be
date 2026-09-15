import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import bcrypt from 'bcryptjs';
import { BCRIPT_LIMITS, USER_LIMITS } from '../utils/constants';

// Constants for password validation
const MIN_PASSWORD_LENGTH = USER_LIMITS.MIN_PASSWORD_LENGTH;
const MAX_PASSWORD_LENGTH = USER_LIMITS.MAX_PASSWORD_LENGTH;

// Password validation utility
const validatePassword = (password: string): string | null => {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`;
  }

  // Require at least one uppercase, one lowercase, one number, and one special character
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return 'Password must contain uppercase, lowercase, number, and special character';
  }

  return null;
};

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

  getUserStatus: async (userId: string, viewerId?: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        lastSeen: true,
        privacyOnlineStatus: true,
        privacyLastSeen: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (viewerId && viewerId === userId) {
      return {
        status: user.status,
        lastSeen: user.lastSeen,
      };
    }

    let isFriend = false;
    if (viewerId && prisma.friendRequest?.findFirst) {
      const friendship = await prisma.friendRequest.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { senderId: viewerId, receiverId: userId },
            { senderId: userId, receiverId: viewerId },
          ],
        },
      });
      isFriend = !!friendship;
    }

    const onlinePrivacy = user.privacyOnlineStatus || 'everyone';
    const lastSeenPrivacy = user.privacyLastSeen || 'everyone';

    let status = user.status;
    if (onlinePrivacy === 'nobody') {
      status = 'offline';
    } else if (onlinePrivacy === 'friends' && !isFriend) {
      status = 'offline';
    }

    let lastSeen = user.lastSeen;
    if (lastSeenPrivacy === 'nobody') {
      lastSeen = null;
    } else if (lastSeenPrivacy === 'friends' && !isFriend) {
      lastSeen = null;
    }

    return {
      status,
      lastSeen,
    };
  },

  updateUserStatus: async (userId: string, status: 'online' | 'offline' | 'away') => {
    try {
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          status,
          lastSeen: new Date(),
        },
      });
    } catch (error) {
      console.warn(`[userService] Could not update status for user ${userId}:`, error);
    }
  },

  getOnlineUsers: async (viewerId?: string) => {
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
        privacyOnlineStatus: true,
        privacyLastSeen: true,
      },
    });

    let friendIdSet = new Set<string>();
    let blockedIdSet = new Set<string>();

    if (viewerId) {
      if (prisma.friendRequest?.findMany) {
        const friends = await prisma.friendRequest.findMany({
          where: {
            status: 'accepted',
            OR: [{ senderId: viewerId }, { receiverId: viewerId }],
          },
          select: { senderId: true, receiverId: true },
        });
        friendIdSet = new Set(friends.map((f: any) => (f.senderId === viewerId ? f.receiverId : f.senderId)));
      }

      if (prisma.block?.findMany) {
        const blocks = await prisma.block.findMany({
          where: {
            OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
          },
          select: { blockerId: true, blockedId: true },
        });
        blockedIdSet = new Set(blocks.map((b: any) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
      }
    }

    return users
      .filter((u) => {
        if (viewerId && u.id === viewerId) return true;
        if (viewerId && blockedIdSet.has(u.id)) return false;

        const privacy = u.privacyOnlineStatus || 'everyone';
        if (privacy === 'nobody') return false;
        if (privacy === 'friends' && !friendIdSet.has(u.id)) return false;

        return true;
      })
      .map((u) => {
        const sanitized = { ...u };
        const lastSeenPrivacy = u.privacyLastSeen || 'everyone';
        if (lastSeenPrivacy === 'nobody' && u.id !== viewerId) {
          sanitized.lastSeen = null;
        } else if (lastSeenPrivacy === 'friends' && !friendIdSet.has(u.id) && u.id !== viewerId) {
          sanitized.lastSeen = null;
        }
        return sanitized;
      });
  },

 changePassword: async (
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    
    // Input validation
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Invalid user ID');
    }

    if (!oldPassword || typeof oldPassword !== 'string') {
      throw new ValidationError('Current password is required');
    }

    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required');
    }

    // Validate new password strength
    const passwordValidationError = validatePassword(newPassword);
    if (passwordValidationError) {
      throw new ValidationError(passwordValidationError);
    }

    // Check if passwords are identical
    if (oldPassword === newPassword) {
      throw new ValidationError(
        'New password must be different from the current password'
      );
    }

    // Fetch user with password hash
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          passwordHash: true,
          email: true,
        },
      });
    } catch (error) {
      throw new ValidationError('Failed to retrieve user information');
    }

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify old password (assumes password is bcrypt hashed)
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    } catch (error) {
      throw new ValidationError('Failed to verify password');
    }

    if (!isPasswordValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    let hashedNewPassword: string;
    try {
      hashedNewPassword = await bcrypt.hash(newPassword, BCRIPT_LIMITS.BCRYPT_ROUNDS);
    } catch (error) {
      throw new ValidationError('Failed to process new password');
    }

    // Update password in database
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashedNewPassword,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new ValidationError('Failed to update password');
    }

    return {
      success: true,
      message: 'Password changed successfully',
    };
  },


  deleteUser: async (userId: string) => {
    await prisma.user.delete({
      where: { id: userId },
    });
  },

  reportUser: async (
    reporterId: string,
    reportedId: string,
    reason: string,
    details?: string
  ) => {
    if (reporterId === reportedId) {
      throw new ValidationError('You cannot report yourself');
    }

    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedId },
    });

    if (!reportedUser) {
      throw new NotFoundError('Reported user not found');
    }

    const validReasons = ['Spam', 'Harassment', 'Inappropriate content', 'Fake account', 'Other'];
    if (!reason || !validReasons.includes(reason)) {
      throw new ValidationError(`Invalid reason. Must be one of: ${validReasons.join(', ')}`);
    }

    const report = await prisma.report.create({
      data: {
        reporterId,
        reportedId,
        reason,
        details: details ? details.trim() : null,
      },
    });

    return report;
  },

  getPrivacySettings: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        privacyLastSeen: true,
        privacyOnlineStatus: true,
        privacyReadReceipts: true,
        privacyFriendRequests: true,
        privacyCalls: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      lastSeen: user.privacyLastSeen,
      onlineStatus: user.privacyOnlineStatus,
      readReceipts: user.privacyReadReceipts,
      friendRequests: user.privacyFriendRequests,
      calls: user.privacyCalls,
    };
  },

  updatePrivacySettings: async (
    userId: string,
    settings: {
      lastSeen?: string;
      onlineStatus?: string;
      readReceipts?: boolean;
      friendRequests?: string;
      calls?: string;
    }
  ) => {
    const data: any = {};
    if (settings.lastSeen && ['everyone', 'friends', 'nobody'].includes(settings.lastSeen)) {
      data.privacyLastSeen = settings.lastSeen;
    }
    if (settings.onlineStatus && ['everyone', 'friends', 'nobody'].includes(settings.onlineStatus)) {
      data.privacyOnlineStatus = settings.onlineStatus;
    }
    if (typeof settings.readReceipts === 'boolean') {
      data.privacyReadReceipts = settings.readReceipts;
    }
    if (
      settings.friendRequests &&
      ['everyone', 'friends_of_friends', 'nobody'].includes(settings.friendRequests)
    ) {
      data.privacyFriendRequests = settings.friendRequests;
    }
    if (settings.calls && ['everyone', 'friends', 'nobody'].includes(settings.calls)) {
      data.privacyCalls = settings.calls;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        privacyLastSeen: true,
        privacyOnlineStatus: true,
        privacyReadReceipts: true,
        privacyFriendRequests: true,
        privacyCalls: true,
      },
    });

    return {
      lastSeen: updated.privacyLastSeen,
      onlineStatus: updated.privacyOnlineStatus,
      readReceipts: updated.privacyReadReceipts,
      friendRequests: updated.privacyFriendRequests,
      calls: updated.privacyCalls,
    };
  },

  deleteAccountWithPassword: async (userId: string, password?: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (password) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new ValidationError('Incorrect password');
      }
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return { success: true, message: 'Account permanently deleted' };
  },
};