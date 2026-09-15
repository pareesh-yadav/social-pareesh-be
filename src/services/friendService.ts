import { prisma } from '../config/database';
import { authorizationService } from './authorizationService';
import {
  NotFoundError,
  ConflictError,
  AuthorizationError,
  ValidationError,
} from '../utils/errors';

export const friendService = {
  sendFriendRequest: async (senderId: string, receiverId: string) => {
    // Check if users exist
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
    });

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!sender || !receiver) {
      throw new NotFoundError('One or both users not found');
    }

    if (senderId === receiverId) {
      throw new ValidationError(
        'You cannot send a friend request to yourself'
      );
    }

    // Check if blocked
    const isBlocked = await authorizationService.isBlockedBetween(senderId, receiverId);
    if (isBlocked) {
      throw new ValidationError('Cannot send friend request to this user');
    }

    if (receiver.privacyFriendRequests === 'nobody') {
      throw new ValidationError('This user does not accept friend requests');
    }

    if (receiver.privacyFriendRequests === 'friends_of_friends' && prisma.friendRequest?.findMany) {
      const senderFriends = await prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId }, { receiverId: senderId }],
        },
        select: { senderId: true, receiverId: true },
      });
      const senderFriendIds = new Set(
        senderFriends.map((f: any) => (f.senderId === senderId ? f.receiverId : f.senderId))
      );

      const receiverFriends = await prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: receiverId }, { receiverId }],
        },
        select: { senderId: true, receiverId: true },
      });
      const hasMutual = receiverFriends.some((f: any) =>
        senderFriendIds.has(f.senderId === receiverId ? f.receiverId : f.senderId)
      );

      if (!hasMutual) {
        throw new ValidationError('This user only accepts friend requests from friends of friends');
      }
    }

    // Check if request already exists
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        throw new ConflictError('Friend request already pending');
      } else if (existingRequest.status === 'accepted') {
        throw new ConflictError('You are already friends');
      }
    }

    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
        status: 'pending',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            bio: true,
          },
        },
      },
    });

    return friendRequest;
  },

  getPendingRequests: async (userId: string) => {
    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: 'pending',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  },

  getSentRequests: async (userId: string) => {
    const requests = await prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: 'pending',
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  },

  acceptFriendRequest: async (requestId: string, userId: string) => {
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!friendRequest) {
      throw new NotFoundError('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new AuthorizationError(
        'You can only accept requests sent to you'
      );
    }

    if (friendRequest.status !== 'pending') {
      throw new ValidationError('This request is no longer pending');
    }

    const updatedRequest = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'accepted', updatedAt: new Date() },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            bio: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            bio: true,
          },
        },
      },
    });

    return updatedRequest;
  },

  rejectFriendRequest: async (requestId: string, userId: string) => {
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!friendRequest) {
      throw new NotFoundError('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
      throw new AuthorizationError(
        'You can only reject requests sent to you'
      );
    }

    await prisma.friendRequest.delete({
      where: { id: requestId },
    });
  },

  cancelFriendRequest: async (requestId: string, userId: string) => {
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!friendRequest) {
      throw new NotFoundError('Friend request not found');
    }

    if (friendRequest.senderId !== userId) {
      throw new AuthorizationError(
        'You can only cancel requests you sent'
      );
    }

    if (friendRequest.status !== 'pending') {
      throw new ValidationError('Can only cancel pending requests');
    }

    await prisma.friendRequest.delete({
      where: { id: requestId },
    });

    return friendRequest;
  },

  blockUser: async (userId: string, blockedUserId: string) => {
    if (userId === blockedUserId) {
      throw new ValidationError('Cannot block yourself');
    }

    // Check if users exist
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const blockedUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
    });

    if (!user || !blockedUser) {
      throw new NotFoundError('One or both users not found');
    }

    // 1. Create or update record in dedicated Block model
    await prisma.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: userId, blockedId: blockedUserId },
      },
      create: {
        blockerId: userId,
        blockedId: blockedUserId,
      },
      update: {},
    });

    // 2. Remove or set any existing friend requests between them to blocked
    const existingFriendship = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: blockedUserId },
          { senderId: blockedUserId, receiverId: userId },
        ],
      },
    });

    if (existingFriendship) {
      await prisma.friendRequest.update({
        where: { id: existingFriendship.id },
        data: { status: 'blocked' },
      });
    }
  },

  unblockUser: async (userId: string, unblockUserId: string) => {
    // 1. Delete from dedicated Block model
    const deletedBlocks = await prisma.block.deleteMany({
      where: {
        blockerId: userId,
        blockedId: unblockUserId,
      },
    });

    // 2. Also clean up any legacy friendRequest status: 'blocked'
    const deletedLegacy = await prisma.friendRequest.deleteMany({
      where: {
        senderId: userId,
        receiverId: unblockUserId,
        status: 'blocked',
      },
    });

    if (deletedBlocks.count === 0 && deletedLegacy.count === 0) {
      throw new NotFoundError('User not blocked');
    }
  },

  getBlockedUsers: async (userId: string) => {
    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Legacy blocks support
    const legacyBlocks = await prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: 'blocked',
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
      },
    });

    const userMap = new Map<string, any>();
    for (const b of blocks) {
      userMap.set(b.blocked.id, b.blocked);
    }
    for (const lb of legacyBlocks) {
      userMap.set(lb.receiver.id, lb.receiver);
    }

    return Array.from(userMap.values());
  },

  getFriends: async (userId: string) => {
    const friends = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
            createdAt: true,
            lastSeen: true,
            privacyOnlineStatus: true,
            privacyLastSeen: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
            createdAt: true,
            lastSeen: true,
            privacyOnlineStatus: true,
            privacyLastSeen: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return friends.map((f: any) => {
      const friend = f.senderId === userId ? f.receiver : f.sender;
      if (!friend) return friend;

      const onlinePrivacy = friend.privacyOnlineStatus || 'everyone';
      const lastSeenPrivacy = friend.privacyLastSeen || 'everyone';

      return {
        id: friend.id,
        username: friend.username,
        email: friend.email,
        profilePicUrl: friend.profilePicUrl,
        status: onlinePrivacy === 'nobody' ? 'offline' : friend.status,
        lastSeen: lastSeenPrivacy === 'nobody' ? null : friend.lastSeen,
        bio: friend.bio,
        createdAt: friend.createdAt,
      };
    });
  },

  removeFriend: async (userId: string, friendId: string) => {
    const request = await prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });

    if (!request) {
      throw new NotFoundError('Friendship not found');
    }

    await prisma.friendRequest.delete({
      where: { id: request.id },
    });
  },

  checkFriendshipStatus: async (userId: string, otherUserId: string) => {
    const request = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
    });

    return request ? request.status : null;
  },

  isFriend: async (userId: string, otherUserId: string): Promise<boolean> => {
    const request = await prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
    });

    return !!request;
  },

  isBlocked: async (userId: string, otherUserId: string): Promise<boolean> => {
    return authorizationService.isBlockedBetween(userId, otherUserId);
  },
};