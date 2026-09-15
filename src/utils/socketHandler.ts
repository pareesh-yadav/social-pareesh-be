import { Socket } from 'socket.io';
import { prisma } from '../config/database';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import { callService } from '../services/callService';
import { jwtUtils } from './jwt';

interface UserSocket {
  userId: string;
  socketId: string;
}

// Track all active socket IDs per user (for multiple tabs/devices)
const userSockets = new Map<string, Set<string>>();
const socketToUser = new Map<string, string>();

export const getUserIdBySocket = (socketId: string): string | null => {
  return socketToUser.get(socketId) || null;
};

const addSocketUser = (userId: string, socketId: string) => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(socketId);
  socketToUser.set(socketId, userId);
};

const removeSocketUser = (socketId: string): { userId: string; isOffline: boolean } | null => {
  const userId = socketToUser.get(socketId);
  if (!userId) return null;

  socketToUser.delete(socketId);
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userId);
      return { userId, isOffline: true };
    }
  }
  return { userId, isOffline: false };
};

export const setupSocketHandlers = (io: any) => {
  // Authentication middleware
  io.use((socket: Socket, next: (err?: Error) => void) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization;

      if (!rawToken) {
        return next(new Error('Authentication error: No token provided'));
      }

      const token = String(rawToken).startsWith('Bearer ')
        ? String(rawToken).slice(7)
        : String(rawToken);

      const payload = jwtUtils.verifyToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch (_err) {
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const authenticatedUserId: string = socket.data.userId;

    // Register active user connection
    addSocketUser(authenticatedUserId, socket.id);
    socket.join(authenticatedUserId);

    try {
      await userService.updateUserStatus(authenticatedUserId, 'online');
      io.emit('user:online', { userId: authenticatedUserId, status: 'online' });
    } catch (err) {
      console.error('Error updating user online status:', err);
    }

    // Optional user:login event support for frontend compatibility
    socket.on('user:login', async (_data: { userId?: string }) => {
      addSocketUser(authenticatedUserId, socket.id);
      socket.join(authenticatedUserId);
      await userService.updateUserStatus(authenticatedUserId, 'online');
      io.emit('user:online', { userId: authenticatedUserId, status: 'online' });
    });

    // Send message
    socket.on(
      'message:send',
      async (data: {
        conversationId: string;
        senderId?: string;
        content?: string;
        parentMessageId?: string;
        attachmentUrl?: string;
        attachmentType?: 'image' | 'video';
      }) => {
        try {
          const cleanContent = data.content || '';
          if (!cleanContent.trim() && !data.attachmentUrl) {
            socket.emit('error', { message: 'Cannot send an empty message' });
            return;
          }

          // Enforce authenticated userId as sender
          const message = await messageService.sendMessage(
            data.conversationId,
            authenticatedUserId,
            cleanContent,
            data.parentMessageId,
            data.attachmentUrl,
            data.attachmentType
          );

          io.to(data.conversationId).emit('message:new', message);
        } catch (error: any) {
          socket.emit('error', { message: error?.message || 'Failed to send message' });
        }
      }
    );

    // Edit message
    socket.on(
      'message:edit',
      async (data: { messageId: string; senderId?: string; content: string; conversationId: string }) => {
        try {
          const message = await messageService.editMessage(
            data.messageId,
            authenticatedUserId,
            data.content
          );

          const emitData = {
            ...message,
            conversationId: data.conversationId,
          };

          io.to(data.conversationId).emit('message:updated', emitData);
        } catch (error: any) {
          socket.emit('error', { message: error?.message || 'Failed to edit message' });
        }
      }
    );

    // Delete message
    socket.on(
      'message:delete',
      async (data: { messageId: string; senderId?: string; conversationId: string }) => {
        try {
          await messageService.deleteMessage(data.messageId, authenticatedUserId);

          io.to(data.conversationId).emit('message:deleted', {
            messageId: data.messageId,
            conversationId: data.conversationId,
          });
        } catch (error: any) {
          socket.emit('error', { message: error?.message || 'Failed to delete message' });
        }
      }
    );

    // Typing indicator
    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('typing:indicator', {
        conversationId: data.conversationId,
        userId: authenticatedUserId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('typing:indicator', {
        conversationId: data.conversationId,
        userId: authenticatedUserId,
        isTyping: false,
      });
    });

    // Mark as read
    socket.on('message:read', async (data: { messageId?: string; conversationId: string }) => {
      try {
        if (data.messageId) {
          const updatedMessage = await messageService.markAsRead(data.messageId, authenticatedUserId);
          if (updatedMessage) {
            io.to(data.conversationId).emit('message:read', {
              messageId: updatedMessage.id,
              conversationId: updatedMessage.conversationId,
              readBy: updatedMessage.readBy,
              userId: authenticatedUserId,
            });
          }
        } else {
          await messageService.markConversationAsRead(data.conversationId, authenticatedUserId);
          io.to(data.conversationId).emit('message:read', {
            conversationId: data.conversationId,
            userId: authenticatedUserId,
          });
        }
      } catch (error) {
        console.error('Error marking message(s) as read:', error);
      }
    });

    // Join conversation room (verifies membership to prevent eavesdropping)
    socket.on('conversation:join', async (data: { conversationId: string }) => {
      try {
        if (!data.conversationId) return;

        const conversation = await prisma.conversation.findUnique({
          where: { id: data.conversationId },
          select: { user1Id: true, user2Id: true },
        });

        if (
          conversation &&
          (conversation.user1Id === authenticatedUserId ||
            conversation.user2Id === authenticatedUserId)
        ) {
          socket.join(data.conversationId);
        } else {
          socket.emit('error', { message: 'Not authorized to join this conversation' });
        }
      } catch (err) {
        console.error('Error joining conversation:', err);
      }
    });

    // Leave conversation room
    socket.on('conversation:leave', (data: { conversationId: string }) => {
      if (data.conversationId) {
        socket.leave(data.conversationId);
      }
    });

    // ==========================================
    // AUDIO / VIDEO CALL SIGNALING (WEBRTC)
    // ==========================================

    socket.on('call:initiate', async (data: { targetUserId: string; withVideo: boolean }) => {
      try {
        await callService.initiateCall(authenticatedUserId, data.targetUserId, data.withVideo);
      } catch (err) {
        console.error('Failed to log call initiation', err);
      }

      socket.to(data.targetUserId).emit('call:incoming', {
        callerId: authenticatedUserId,
        withVideo: data.withVideo,
      });
    });

    socket.on('call:accept', async (data: { targetUserId: string }) => {
      try {
        await callService.acceptCall(data.targetUserId, authenticatedUserId);
      } catch (err) {
        console.error('Failed to accept call', err);
      }

      socket.to(data.targetUserId).emit('call:accepted');
    });

    socket.on('call:end', async (data: { targetUserId: string }) => {
      try {
        await callService.endCall(authenticatedUserId, data.targetUserId);
        await callService.endCall(data.targetUserId, authenticatedUserId);
      } catch (err) {
        console.error('Failed to end call', err);
      }

      socket.to(data.targetUserId).emit('call:ended');
    });

    socket.on('webrtc:offer', (data: { targetUserId: string; offer: any }) => {
      socket.to(data.targetUserId).emit('webrtc:offer', {
        offer: data.offer,
        callerId: authenticatedUserId,
      });
    });

    socket.on('webrtc:answer', (data: { targetUserId: string; answer: any }) => {
      socket.to(data.targetUserId).emit('webrtc:answer', {
        answer: data.answer,
        callerId: authenticatedUserId,
      });
    });

    socket.on('webrtc:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
      socket.to(data.targetUserId).emit('webrtc:ice-candidate', {
        candidate: data.candidate,
      });
    });

    // ==========================================
    // USER DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      const removal = removeSocketUser(socket.id);

      if (removal && removal.isOffline) {
        try {
          await userService.updateUserStatus(removal.userId, 'offline');
          io.emit('user:offline', { userId: removal.userId });
        } catch (err) {
          console.error('Error updating user status on disconnect:', err);
        }
      }
    });
  });
};

export const getOnlineUsers = (): UserSocket[] => {
  const result: UserSocket[] = [];
  for (const [userId, sockets] of userSockets.entries()) {
    for (const socketId of sockets) {
      result.push({ userId, socketId });
    }
  }
  return result;
};