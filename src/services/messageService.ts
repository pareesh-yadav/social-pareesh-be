import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';

export const messageService = {
  getConversationMessages: async (
    conversationId: string,
    userId: string,
    limit = 50,
    offset = 0
  ) => {
    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
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

    const messages = await prisma.message.findMany({
      where: { conversationId },
      select: {
        id: true,
        content: true,
        senderId: true,
        conversationId: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        parentMessageId: true,
        attachmentUrl: true,  // <-- ADDED THIS
        attachmentType: true, // <-- ADDED THIS
        readReceipts: {
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.message.count({
      where: { conversationId },
    });

    return {
      items: messages
        .map((msg: (typeof messages)[number]) => ({
          ...msg,
          readBy: msg.readReceipts.map((r: { userId: string }) => r.userId),
        }))
        .reverse(),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  },

  sendMessage: async (
    conversationId: string,
    senderId: string,
    content: string = "",
    parentMessageId?: string,
    attachmentUrl?: string,
    attachmentType?: 'image' | 'video'
  ) => {
    // 1. Strict Server-Side Validation
    const safeContent = content.trim();
    if (!safeContent && !attachmentUrl) {
      throw new Error('Message must have text content or an attachment.');
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Verify sender is part of conversation
    if (
      conversation.user1Id !== senderId &&
      conversation.user2Id !== senderId
    ) {
      throw new AuthorizationError(
        'You are not part of this conversation'
      );
    }

    // Verify parent message exists if replying
    if (parentMessageId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentMessageId },
      });

      if (!parentMessage) {
        throw new NotFoundError('Parent message not found');
      }

      if (parentMessage.conversationId !== conversationId) {
        throw new ValidationError('Parent message is not in this conversation');
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: safeContent,
        parentMessageId,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
      },
      select: {
        id: true,
        content: true,
        senderId: true,
        conversationId: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        parentMessageId: true,
        attachmentUrl: true,  // <-- ADDED THIS
        attachmentType: true, // <-- ADDED THIS
        readReceipts: {
          select: { userId: true },
        },
      },
    });

    // Update conversation updated time
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      ...message,
      readBy: message.readReceipts.map((r: { userId: string }) => r.userId),
    };
  },

  editMessage: async (
    messageId: string,
    userId: string,
    content: string
  ) => {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new ValidationError('Message content cannot be empty');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.senderId !== userId) {
      throw new AuthorizationError(
        'You can only edit your own messages'
      );
    }

    if (message.deletedAt) {
      throw new ValidationError('Cannot edit a deleted message');
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        editedAt: new Date(),
      },
      select: {
        id: true,
        content: true,
        senderId: true,
        conversationId: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        parentMessageId: true,
        attachmentUrl: true,  // <-- ADDED THIS
        attachmentType: true, // <-- ADDED THIS
        readReceipts: {
          select: { userId: true },
        },
      },
    });

    return {
      ...updatedMessage,
      readBy: updatedMessage.readReceipts.map((r: { userId: string }) => r.userId),
    };
  },

  deleteMessage: async (messageId: string, userId: string) => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.senderId !== userId) {
      throw new AuthorizationError(
        'You can only delete your own messages'
      );
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
    });
  },

  markAsRead: async (messageId: string, userId: string) => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Don't mark own messages as read
    if (message.senderId === userId) {
      return null;
    }

    await prisma.readReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        messageId,
        userId,
      },
    });

    // Fetch and return the updated message with read receipts
    const updatedMessage = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        senderId: true,
        conversationId: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        parentMessageId: true,
        attachmentUrl: true,  // <-- ADDED THIS
        attachmentType: true, // <-- ADDED THIS
        readReceipts: {
          select: { userId: true },
        },
      },
    });

    return updatedMessage ? { ...updatedMessage, readBy: updatedMessage.readReceipts.map((r: { userId: string }) => r.userId) } : null;
  },

  markConversationAsRead: async (conversationId: string, userId: string) => {
    // 1. Find all messages in this conversation sent by OTHER users that haven't been read yet
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readReceipts: {
          none: { userId },
        },
      },
      select: { id: true },
    });

    if (unreadMessages.length === 0) return; // Nothing to update

    // 2. Bulk create read receipts for all unread messages instantly
    const readReceiptData = unreadMessages.map((msg) => ({
      messageId: msg.id,
      userId,
    }));

    await prisma.readReceipt.createMany({
      data: readReceiptData,
      skipDuplicates: true, // Prevents crashes if a receipt somehow exists
    });
  },

  getUnreadCount: async (conversationId: string, userId: string) => {
    const count = await prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        readReceipts: {
          none: {
            userId,
          },
        },
      },
    });

    return count;
  },

  deleteConversationMessages: async (conversationId: string) => {
    await prisma.message.deleteMany({
      where: { conversationId },
    });
  },
};