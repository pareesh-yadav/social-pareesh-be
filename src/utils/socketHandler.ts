import { Socket } from 'socket.io';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';

interface UserSocket {
  userId: string;
  socketId: string;
}

const onlineUsers = new Map<string, UserSocket>();

// Helper to find a userId by their socket connection
const getUserIdBySocket = (socketId: string): string | null => {
  for (const [userId, user] of onlineUsers.entries()) {
    if (user.socketId === socketId) return userId;
  }
  return null;
};

export const setupSocketHandlers = (io: any) => {
  io.on('connection', (socket: Socket) => {

    // User login
    socket.on('user:login', async (data: { userId: string }) => {
      const { userId } = data;
      onlineUsers.set(userId, { userId, socketId: socket.id });
      socket.join(userId);
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
        content?: string;
        parentMessageId?: string;
        attachmentUrl?: string;
        attachmentType?: 'image' | 'video';
      }) => {
        try {
          const cleanContent = data.content || "";
          if (!cleanContent.trim() && !data.attachmentUrl) {
            socket.emit('error', { message: 'Cannot send an empty message' });
            return; 
          }
          const message = await messageService.sendMessage(
            data.conversationId,
            data.senderId,
            cleanContent,
            data.parentMessageId,
            data.attachmentUrl,
            data.attachmentType

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
      async (data: { messageId: string; senderId: string; content: string; conversationId: string }) => {
        try {
          // Update in DB
          const message = await messageService.editMessage(
            data.messageId,
            data.senderId,
            data.content
          );

          // Force the conversationId into the broadcast just in case the DB returned it without one
          const emitData = {
            ...message,
            conversationId: data.conversationId 
          };

          // Broadcast to everyone in that specific chat room
          io.to(data.conversationId).emit('message:updated', emitData);
        } catch (error) {
          socket.emit('error', { message: `Failed to edit message ${error}` });
        }
      }
    );

    // Delete message
    socket.on(
      'message:delete',
      async (data: { messageId: string; senderId: string; conversationId: string }) => {
        try {
          await messageService.deleteMessage(data.messageId, data.senderId);
          
          io.to(data.conversationId).emit('message:deleted', { 
            messageId: data.messageId,
            conversationId: data.conversationId
          });
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
    socket.on('message:read', async (data: { messageId?: string; userId: string; conversationId: string }) => {
      try {
        if (data.messageId) {
          // SCENARIO A: A specific message was read
          const updatedMessage = await messageService.markAsRead(data.messageId, data.userId);
          if (updatedMessage) {
            io.to(data.conversationId).emit('message:read', {
              messageId: updatedMessage.id,
              conversationId: updatedMessage.conversationId,
              readBy: updatedMessage.readBy,
              userId: data.userId,
            });
          }
        } else {
          // SCENARIO B: The user opened the chat, mark the whole conversation as read
          await messageService.markConversationAsRead(data.conversationId, data.userId);
          
          // Broadcast to the room so the sender's UI removes the unread badges instantly
          io.to(data.conversationId).emit('message:read', {
            conversationId: data.conversationId,
            userId: data.userId,
          });
        }
      } catch (error) {
        console.error('❌ Error marking message(s) as read:', error);
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

    // ==========================================
    // AUDIO / VIDEO CALL SIGNALING (WEBRTC)
    // ==========================================

    socket.on('call:initiate', (data: { targetUserId: string; callerId: string; withVideo: boolean }) => {
      // Broadcast directly to the target user's personal room
      // This guarantees it hits them even if their socketId changed or they have multiple tabs open!
      socket.to(data.targetUserId).emit('call:incoming', {
        callerId: data.callerId,
        withVideo: data.withVideo
      });
    });

    socket.on('call:accept', (data: { targetUserId: string }) => {
      socket.to(data.targetUserId).emit('call:accepted');
    });

    socket.on('call:end', (data: { targetUserId: string }) => {
      socket.to(data.targetUserId).emit('call:ended');
    });

    socket.on('webrtc:offer', (data: { targetUserId: string; offer: any }) => {
      const callerId = getUserIdBySocket(socket.id);
      if (callerId) {
        socket.to(data.targetUserId).emit('webrtc:offer', { 
          offer: data.offer, 
          callerId: callerId 
        });
      }
    });

    socket.on('webrtc:answer', (data: { targetUserId: string; answer: any }) => {
      socket.to(data.targetUserId).emit('webrtc:answer', { answer: data.answer });
    });

    socket.on('webrtc:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
      socket.to(data.targetUserId).emit('webrtc:ice-candidate', { candidate: data.candidate });
    });

    // ==========================================
    // USER DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      const disconnectedUserId = getUserIdBySocket(socket.id);

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