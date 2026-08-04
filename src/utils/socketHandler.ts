import { Socket } from 'socket.io';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';

interface UserSocket {
  userId: string;
  socketId: string;
}

const onlineUsers = new Map<string, UserSocket>();

export const setupSocketHandlers = (io: any) => {
  io.on('connection', (socket: Socket) => {

    // User login
    socket.on('user:login', async (data: { userId: string }) => {
      const { userId } = data;
      onlineUsers.set(userId, { userId, socketId: socket.id });
      await userService.updateUserStatus(userId, 'online');

      // Broadcast user online
      io.emit('user:online', { userId, status: 'online' });
    });

    // Send message
    socket.on(
      'message:send',
      async (data: {
        conversationId: string;
        senderId: string;
        content: string;
        parentMessageId?: string;
      }) => {
        try {
          const message = await messageService.sendMessage(
            data.conversationId,
            data.senderId,
            data.content,
            data.parentMessageId
          );

          io.to(data.conversationId).emit('message:new', message);
        } catch (error) {
          socket.emit('error', { message: `Failed to send message ${error}` });
        }
      }
    );

    // Edit message
    socket.on(
      'message:edit',
      async (data: { messageId: string; senderId: string; content: string }) => {
        try {
          const message = await messageService.editMessage(
            data.messageId,
            data.senderId,
            data.content
          );

          io.emit('message:updated', message);
        } catch (error) {
          socket.emit('error', { message: `Failed to edit message ${error}` });
        }
      }
    );

    // Delete message
    socket.on(
      'message:delete',
      async (data: { messageId: string; senderId: string }) => {
        try {
          await messageService.deleteMessage(data.messageId, data.senderId);
          io.emit('message:deleted', { messageId: data.messageId });
        } catch (error) {
          socket.emit('error', { message: `Failed to delete message ${error}` });
        }
      }
    );

    // Typing indicator
    socket.on(
      'typing:start',
      (data: { conversationId: string; userId: string }) => {
        socket.to(data.conversationId).emit('typing:indicator', {
          conversationId: data.conversationId,
          userId: data.userId,
          isTyping: true,
        });
      }
    );

    socket.on(
      'typing:stop',
      (data: { conversationId: string; userId: string }) => {
        socket.to(data.conversationId).emit('typing:indicator', {
          conversationId: data.conversationId,
          userId: data.userId,
          isTyping: false,
        });
      }
    );

    // Mark as read
    socket.on('message:read', async (data: { messageId: string; userId: string; conversationId: string }) => {
      try {
        const updatedMessage = await messageService.markAsRead(data.messageId, data.userId);
        if (updatedMessage) {

          // Broadcast to all users in the conversation room
          io.to(data.conversationId).emit('message:read', {
            messageId: updatedMessage.id,
            conversationId: updatedMessage.conversationId,
            readBy: updatedMessage.readBy,
            userId: data.userId,
          });
        }
      } catch (error) {
        console.error('❌ Error marking message as read:', error);
      }
    });

    // Join conversation room
    socket.on('conversation:join', (data: { conversationId: string }) => {
      socket.join(data.conversationId);
    });

    // Leave conversation room
    socket.on('conversation:leave', (data: { conversationId: string }) => {
      socket.leave(data.conversationId);
    });

    // User disconnect
    socket.on('disconnect', async () => {
      // Find user by socket id
      let disconnectedUserId: string | null = null;
      for (const [userId, userSocket] of onlineUsers.entries()) {
        if (userSocket.socketId === socket.id) {
          disconnectedUserId = userId;
          break;
        }
      }

      if (disconnectedUserId) {
        onlineUsers.delete(disconnectedUserId);
        await userService.updateUserStatus(disconnectedUserId, 'offline');
        io.emit('user:offline', { userId: disconnectedUserId });
      }
    });
  });
};

export const getOnlineUsers = (): UserSocket[] => {
  return Array.from(onlineUsers.values());
};