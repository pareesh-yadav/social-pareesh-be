import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ConflictError } from '../utils/errors';

export const conversationService = {
  getConversations: async (userId: string) => {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
      include: {
        user1: {
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
        user2: {
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
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            senderId: true,
            createdAt: true,
            deletedAt: true,
            editedAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Count unread messages and format response
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: otherUserId,
            readReceipts: {
              none: {
                userId,
              },
            },
          },
        });

        return {
          id: conv.id,
          user1Id: conv.user1Id,
          user2Id: conv.user2Id,
          user1: conv.user1,
          user2: conv.user2,
          lastMessage: conv.messages[0] || null,
          lastMessageTime: conv.messages[0]?.createdAt || null,
          unreadCount,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
      })
    );

    return conversationsWithDetails;
  },

  getOrCreateConversation: async (userId: string, otherUserId: string) => {
    // Prevent self-conversation
    if (userId === otherUserId) {
      throw new ConflictError('Cannot create conversation with yourself');
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          {
            user1Id: userId,
            user2Id: otherUserId,
          },
          {
            user1Id: otherUserId,
            user2Id: userId,
          },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
        user2: {
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

    // Create if doesn't exist
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user1Id: userId,
          user2Id: otherUserId,
        },
        include: {
          user1: {
            select: {
              id: true,
              username: true,
              email: true,
              profilePicUrl: true,
              status: true,
              bio: true,
            },
          },
          user2: {
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
    }

    return {
      id: conversation.id,
      user1Id: conversation.user1Id,
      user2Id: conversation.user2Id,
      user1: conversation.user1,
      user2: conversation.user2,
      lastMessage: null,
      lastMessageTime: null,
      unreadCount: 0,
    };
  },

  getConversation: async (conversationId: string, userId: string) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicUrl: true,
            status: true,
            bio: true,
          },
        },
        user2: {
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

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Verify user is part of conversation
    if (
      conversation.user1Id !== userId &&
      conversation.user2Id !== userId
    ) {
      throw new AuthorizationError(
        'You do not have access to this conversation'
      );
    }

    return {
      id: conversation.id,
      user1Id: conversation.user1Id,
      user2Id: conversation.user2Id,
      user1: conversation.user1,
      user2: conversation.user2,
    };
  },

  deleteConversation: async (conversationId: string, userId: string) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    if (
      conversation.user1Id !== userId &&
      conversation.user2Id !== userId
    ) {
      throw new AuthorizationError(
        'You do not have access to delete this conversation'
      );
    }

    // Delete all messages first
    await prisma.message.deleteMany({
      where: { conversationId },
    });

    // Delete conversation
    await prisma.conversation.delete({
      where: { id: conversationId },
    });
  },

  searchConversations: async (userId: string, query: string) => {
    const conversations = await prisma.conversation.findMany({
      where: {
        AND: [
          {
            OR: [
              { user1Id: userId },
              { user2Id: userId },
            ],
          },
          {
            OR: [
              { user1: { username: { contains: query, mode: 'insensitive' } } },
              { user2: { username: { contains: query, mode: 'insensitive' } } },
            ],
          },
        ],
      },
      include: {
        user1: true,
        user2: true,
      },
    });

    return conversations;
  },
};