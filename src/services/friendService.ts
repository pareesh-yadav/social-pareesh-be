import { prisma } from '../config/database';
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

  blockUser: async (userId: string, blockedUserId: string) => {
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

    // Find existing request or create blocked status
    let request = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: blockedUserId },
          { senderId: blockedUserId, receiverId: userId },
        ],
      },
    });

    if (request) {
      await prisma.friendRequest.update({
        where: { id: request.id },
        data: { status: 'blocked' },
      });
    } else {
      await prisma.friendRequest.create({
        data: {
          senderId: userId,
          receiverId: blockedUserId,
          status: 'blocked',
        },
      });
    }
  },

  unblockUser: async (userId: string, unblockUserId: string) => {
    const request = await prisma.friendRequest.findFirst({
      where: {
        senderId: userId,
        receiverId: unblockUserId,
        status: 'blocked',
      },
    });

    if (!request) {
      throw new NotFoundError('User not blocked');
    }

    await prisma.friendRequest.delete({
      where: { id: request.id },
    });
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
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return friends.map((f:any) =>
      f.senderId === userId ? f.receiver : f.sender
    );
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
    const request = await prisma.friendRequest.findFirst({
      where: {
        status: 'blocked',
        senderId: userId,
        receiverId: otherUserId,
      },
    });

    return !!request;
  },
};