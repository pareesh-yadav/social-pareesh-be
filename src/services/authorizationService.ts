import { prisma } from '../config/database';

export const authorizationService = {
  /**
   * Check if userA has blocked userB, or userB has blocked userA
   */
  isBlockedBetween: async (userAId: string, userBId: string): Promise<boolean> => {
    if (!userAId || !userBId || userAId === userBId) return false;

    // Check dedicated Block table if present
    if (prisma.block?.findFirst) {
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userAId, blockedId: userBId },
            { blockerId: userBId, blockedId: userAId },
          ],
        },
      });

      if (block) return true;
    }

    // Fallback check on legacy FriendRequest table with status 'blocked'
    if (prisma.friendRequest?.findFirst) {
      const legacyBlock = await prisma.friendRequest.findFirst({
        where: {
          status: 'blocked',
          OR: [
            { senderId: userAId, receiverId: userBId },
            { senderId: userBId, receiverId: userAId },
          ],
        },
      });

      return legacyBlock?.status === 'blocked';
    }

    return false;
  },

  /**
   * Check if userA has explicitly blocked userB
   */
  hasBlocked: async (blockerId: string, blockedId: string): Promise<boolean> => {
    if (!blockerId || !blockedId) return false;

    if (prisma.block?.findUnique) {
      const block = await prisma.block.findUnique({
        where: {
          blockerId_blockedId: { blockerId, blockedId },
        },
      });

      if (block) return true;
    }

    if (prisma.friendRequest?.findFirst) {
      const legacyBlock = await prisma.friendRequest.findFirst({
        where: {
          senderId: blockerId,
          receiverId: blockedId,
          status: 'blocked',
        },
      });

      return legacyBlock?.status === 'blocked';
    }

    return false;
  },

  /**
   * Check if two users can interact (message, call, friend request)
   */
  canInteract: async (userAId: string, userBId: string): Promise<{ allowed: boolean; reason?: string }> => {
    if (userAId === userBId) {
      return { allowed: false, reason: 'Cannot interact with yourself' };
    }

    const blocked = await authorizationService.isBlockedBetween(userAId, userBId);
    if (blocked) {
      return { allowed: false, reason: 'Interaction blocked' };
    }

    return { allowed: true };
  },

  /**
   * Verify conversation access and block status
   */
  canMessageConversation: async (
    senderId: string,
    conversationId: string
  ): Promise<{ allowed: boolean; reason?: string; peerId?: string }> => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { user1Id: true, user2Id: true },
    });

    if (!conversation) {
      return { allowed: false, reason: 'Conversation not found' };
    }

    const isMember = conversation.user1Id === senderId || conversation.user2Id === senderId;
    if (!isMember) {
      return { allowed: false, reason: 'Not a member of this conversation' };
    }

    const peerId = conversation.user1Id === senderId ? conversation.user2Id : conversation.user1Id;
    const canInteractResult = await authorizationService.canInteract(senderId, peerId);
    if (!canInteractResult.allowed) {
      return { allowed: false, reason: canInteractResult.reason, peerId };
    }

    return { allowed: true, peerId };
  },

  /**
   * Check if caller can initiate a call to receiver
   */
  canCall: async (callerId: string, receiverId: string): Promise<{ allowed: boolean; reason?: string }> => {
    if (callerId === receiverId) {
      return { allowed: false, reason: 'Cannot call yourself' };
    }

    const canInteractResult = await authorizationService.canInteract(callerId, receiverId);
    if (!canInteractResult.allowed) {
      return { allowed: false, reason: canInteractResult.reason };
    }

    // Check receiver's privacy setting for calls
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { privacyCalls: true },
    });

    if (receiver?.privacyCalls === 'nobody') {
      return { allowed: false, reason: 'User does not accept calls' };
    }

    if (receiver?.privacyCalls === 'friends') {
      const isFriend = await prisma.friendRequest.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { senderId: callerId, receiverId },
            { senderId: receiverId, receiverId: callerId },
          ],
        },
      });

      if (!isFriend) {
        return { allowed: false, reason: 'User only accepts calls from friends' };
      }
    }

    return { allowed: true };
  },
};
