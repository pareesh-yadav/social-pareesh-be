import { Socket } from 'socket.io';
import { prisma } from '../config/database';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import { callService } from '../services/callService';
import { authorizationService } from '../services/authorizationService';
import { jwtUtils } from './jwt';

interface UserSocket {
  userId: string;
  socketId: string;
}

interface ActiveCallSession {
  callId: string;
  callerId: string;
  receiverId: string;
  withVideo: boolean;
  status: 'calling' | 'ringing' | 'connected' | 'ended';
  startedAt: Date;
  connectedAt?: Date;
}

// Track all active socket IDs per user (for multiple tabs/devices)
const userSockets = new Map<string, Set<string>>();
const socketToUser = new Map<string, string>();

// Track active call sessions and user call occupancy
const activeCallSessions = new Map<string, ActiveCallSession>();
const userActiveCalls = new Map<string, string>(); // userId -> callId

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

let ioInstance: any = null;

export const getIO = () => ioInstance;

export const isUserConnected = (userId: string): boolean => {
  return (userSockets.get(userId)?.size || 0) > 0;
};

/**
 * Broadcasts user presence while strictly respecting privacy settings:
 * - 'nobody': Always appears offline to everyone
 * - 'friends': Appears online only to accepted friends
 * - 'everyone': Appears online to everyone
 */
export const broadcastPresence = async (io: any, userId: string, isOnline: boolean) => {
  if (!io) return;

  if (!isOnline) {
    io.emit('user:offline', { userId });
    return;
  }

  let user = null;
  if (prisma.user?.findUnique) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { privacyOnlineStatus: true },
    });
  }

  const privacy = user?.privacyOnlineStatus || 'everyone';

  if (privacy === 'nobody') {
    // Strictly suppress online presence; emit user:offline so others know to remove any green dot
    io.emit('user:offline', { userId });
    return;
  }

  if (privacy === 'friends') {
    let friendIds: string[] = [];
    if (prisma.friendRequest?.findMany) {
      const friends = await prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      });
      friendIds = friends.map((f: any) => (f.senderId === userId ? f.receiverId : f.senderId));
    }

    // Only notify accepted friends
    for (const fId of friendIds) {
      io.to(fId).emit('user:online', { userId, status: 'online' });
    }
    return;
  }

  // 'everyone'
  io.emit('user:online', { userId, status: 'online' });
};

export const setupSocketHandlers = (io: any) => {
  ioInstance = io;

  // Authentication middleware
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
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

      if (prisma.user?.findUnique) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true },
        });
        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }
      }

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
      await broadcastPresence(io, authenticatedUserId, true);
    } catch (err) {
      console.error('Error updating user online status:', err);
    }

    // Optional user:login event support for frontend compatibility
    socket.on('user:login', async (_data: { userId?: string }) => {
      try {
        addSocketUser(authenticatedUserId, socket.id);
        socket.join(authenticatedUserId);
        await userService.updateUserStatus(authenticatedUserId, 'online');
        await broadcastPresence(io, authenticatedUserId, true);
      } catch (err) {
        console.error('Error handling user:login:', err);
      }
    });

    // Real-time privacy setting sync
    socket.on('privacy:update', async () => {
      try {
        await broadcastPresence(io, authenticatedUserId, true);
      } catch (err) {
        console.error('Error handling privacy:update event:', err);
      }
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
        attachmentType?: 'image' | 'video' | 'audio' | 'document' | string;
        attachmentMetadata?: string | Record<string, any>;
        clientMessageId?: string;
      }) => {
        try {
          const cleanContent = data.content || '';
          if (!cleanContent.trim() && !data.attachmentUrl) {
            socket.emit('error', { message: 'Cannot send an empty message' });
            return;
          }

          const rawMetadata =
            typeof data.attachmentMetadata === 'object'
              ? JSON.stringify(data.attachmentMetadata)
              : data.attachmentMetadata;

          // Enforce authenticated userId as sender
          const message = await messageService.sendMessage(
            data.conversationId,
            authenticatedUserId,
            cleanContent,
            data.parentMessageId,
            data.attachmentUrl,
            data.attachmentType,
            rawMetadata
          );

          const messagePayload = data.clientMessageId
            ? { ...message, clientMessageId: data.clientMessageId }
            : message;

          io.to(data.conversationId).emit('message:new', messagePayload);
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

    socket.on(
      'call:initiate',
      async (data: {
        callId?: string;
        targetUserId: string;
        withVideo: boolean;
      }) => {
        const callId = data.callId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

        if (!data.targetUserId || data.targetUserId === authenticatedUserId) {
          socket.emit('call:failed', {
            callId,
            reason: 'invalid_target',
            message: 'Cannot call yourself or invalid user',
          });
          return;
        }

        // Verify block and privacy permissions
        const callPermission = await authorizationService.canCall(authenticatedUserId, data.targetUserId);
        if (!callPermission.allowed) {
          socket.emit('call:failed', {
            callId,
            reason: 'prohibited',
            message: callPermission.reason || 'Cannot initiate call to this user',
          });
          return;
        }

        // Check if receiver is online
        const receiverSockets = userSockets.get(data.targetUserId);
        if (!receiverSockets || receiverSockets.size === 0) {
          socket.emit('call:failed', {
            callId,
            reason: 'offline',
            message: 'User is currently offline',
          });
          return;
        }

        // Check if receiver is already busy in another call
        if (userActiveCalls.has(data.targetUserId)) {
          socket.emit('call:busy', {
            callId,
            targetUserId: data.targetUserId,
            message: 'User is busy on another call',
          });
          return;
        }

        // Check if caller is already in a call
        if (userActiveCalls.has(authenticatedUserId)) {
          const oldCallId = userActiveCalls.get(authenticatedUserId)!;
          activeCallSessions.delete(oldCallId);
        }

        // Track active call session
        const session: ActiveCallSession = {
          callId,
          callerId: authenticatedUserId,
          receiverId: data.targetUserId,
          withVideo: Boolean(data.withVideo),
          status: 'calling',
          startedAt: new Date(),
        };

        activeCallSessions.set(callId, session);
        userActiveCalls.set(authenticatedUserId, callId);
        userActiveCalls.set(data.targetUserId, callId);

        // Fetch caller profile for display on receiver's device
        let callerUser = null;
        try {
          callerUser = await prisma.user.findUnique({
            where: { id: authenticatedUserId },
            select: { id: true, username: true, profilePicUrl: true },
          });
        } catch (err) {
          console.error('Error fetching caller profile:', err);
        }

        try {
          await callService.initiateCall(
            authenticatedUserId,
            data.targetUserId,
            data.withVideo,
            callId
          );
        } catch (err) {
          console.error('Failed to log call initiation in DB:', err);
        }

        // Emit call:incoming to receiver with full details
        socket.to(data.targetUserId).emit('call:incoming', {
          callId,
          callerId: authenticatedUserId,
          callerName: callerUser?.username || 'Unknown Caller',
          callerAvatar: callerUser?.profilePicUrl || null,
          withVideo: data.withVideo,
        });
      }
    );

    // Receiver notifies caller that phone is ringing
    socket.on('call:ringing', (data: { callId: string; targetUserId: string }) => {
      const session = activeCallSessions.get(data.callId);
      if (session) {
        session.status = 'ringing';
      }
      socket.to(data.targetUserId).emit('call:ringing', { callId: data.callId });
    });

    // Receiver accepts call
    socket.on('call:accept', async (data: { callId?: string; targetUserId: string }) => {
      const callId = data.callId || userActiveCalls.get(authenticatedUserId);
      if (callId) {
        const session = activeCallSessions.get(callId);
        if (session) {
          session.status = 'connected';
          session.connectedAt = new Date();
        }
        try {
          await callService.acceptCall(data.targetUserId, authenticatedUserId, callId);
        } catch (err) {
          console.error('Failed to accept call in DB:', err);
        }
      }

      // Notify caller
      socket.to(data.targetUserId).emit('call:accepted', { callId });
      // Dismiss incoming call modal on any other active sockets/tabs of receiver
      socket.to(authenticatedUserId).emit('call:dismiss', { callId });
    });

    // Receiver rejects call
    socket.on('call:reject', async (data: { callId?: string; targetUserId: string; reason?: string }) => {
      const callId = data.callId || userActiveCalls.get(authenticatedUserId);
      if (callId) {
        activeCallSessions.delete(callId);
        userActiveCalls.delete(authenticatedUserId);
        userActiveCalls.delete(data.targetUserId);
        try {
          await callService.rejectCall(data.targetUserId, authenticatedUserId, callId);
        } catch (err) {
          console.error('Failed to record call rejection:', err);
        }
      }

      socket.to(data.targetUserId).emit('call:rejected', {
        callId,
        reason: data.reason || 'declined',
      });
      // Dismiss on other tabs
      socket.to(authenticatedUserId).emit('call:dismiss', { callId });
    });

    // Caller cancels call before receiver answers
    socket.on('call:cancel', async (data: { callId?: string; targetUserId: string }) => {
      const callId = data.callId || userActiveCalls.get(authenticatedUserId);
      if (callId) {
        activeCallSessions.delete(callId);
        userActiveCalls.delete(authenticatedUserId);
        userActiveCalls.delete(data.targetUserId);
        try {
          await callService.cancelCall(authenticatedUserId, data.targetUserId, callId);
        } catch (err) {
          console.error('Failed to record call cancellation:', err);
        }
      }

      socket.to(data.targetUserId).emit('call:cancelled', { callId });
    });

    // Either party hangs up
    socket.on('call:end', async (data: { callId?: string; targetUserId: string }) => {
      const callId = data.callId || userActiveCalls.get(authenticatedUserId);
      if (callId) {
        activeCallSessions.delete(callId);
        userActiveCalls.delete(authenticatedUserId);
        userActiveCalls.delete(data.targetUserId);
        try {
          await callService.endCall(authenticatedUserId, data.targetUserId, callId);
        } catch (err) {
          console.error('Failed to end call in DB:', err);
        }
      }

      socket.to(data.targetUserId).emit('call:ended', { callId });
    });

    // WebRTC Offer
    const handleOffer = (data: { callId?: string; targetUserId: string; offer: any }) => {
      socket.to(data.targetUserId).emit('webrtc:offer', {
        callId: data.callId,
        offer: data.offer,
        callerId: authenticatedUserId,
      });
      socket.to(data.targetUserId).emit('call:offer', {
        callId: data.callId,
        offer: data.offer,
        callerId: authenticatedUserId,
      });
    };
    socket.on('webrtc:offer', handleOffer);
    socket.on('call:offer', handleOffer);

    // WebRTC Answer
    const handleAnswer = (data: { callId?: string; targetUserId: string; answer: any }) => {
      socket.to(data.targetUserId).emit('webrtc:answer', {
        callId: data.callId,
        answer: data.answer,
        callerId: authenticatedUserId,
      });
      socket.to(data.targetUserId).emit('call:answer', {
        callId: data.callId,
        answer: data.answer,
        callerId: authenticatedUserId,
      });
    };
    socket.on('webrtc:answer', handleAnswer);
    socket.on('call:answer', handleAnswer);

    // WebRTC ICE Candidate
    const handleIceCandidate = (data: { callId?: string; targetUserId: string; candidate: any }) => {
      socket.to(data.targetUserId).emit('webrtc:ice-candidate', {
        callId: data.callId,
        candidate: data.candidate,
        callerId: authenticatedUserId,
      });
      socket.to(data.targetUserId).emit('call:ice-candidate', {
        callId: data.callId,
        candidate: data.candidate,
        callerId: authenticatedUserId,
      });
    };
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('call:ice-candidate', handleIceCandidate);

    // Media State Synchronization (mic, camera, screen share)
    socket.on(
      'call:media-state',
      (data: {
        callId?: string;
        targetUserId: string;
        isMuted?: boolean;
        isCameraOff?: boolean;
        isScreenSharing?: boolean;
      }) => {
        socket.to(data.targetUserId).emit('call:media-state', {
          callId: data.callId,
          userId: authenticatedUserId,
          isMuted: data.isMuted,
          isCameraOff: data.isCameraOff,
          isScreenSharing: data.isScreenSharing,
        });
      }
    );

    // ==========================================
    // FRIEND & BLOCK REAL-TIME EVENTS
    // ==========================================

    socket.on('friend:request', (data: { targetUserId: string; request: any }) => {
      if (data.targetUserId) {
        socket.to(data.targetUserId).emit('friend:request', {
          senderId: authenticatedUserId,
          request: data.request,
        });
      }
    });

    socket.on('friend:accept', (data: { targetUserId: string; request: any }) => {
      if (data.targetUserId) {
        socket.to(data.targetUserId).emit('friend:accept', {
          userId: authenticatedUserId,
          request: data.request,
        });
      }
    });

    socket.on('friend:reject', (data: { targetUserId: string; requestId: string }) => {
      if (data.targetUserId) {
        socket.to(data.targetUserId).emit('friend:reject', {
          userId: authenticatedUserId,
          requestId: data.requestId,
        });
      }
    });

    socket.on('friend:cancel', (data: { targetUserId: string; requestId: string }) => {
      if (data.targetUserId) {
        socket.to(data.targetUserId).emit('friend:cancel', {
          senderId: authenticatedUserId,
          requestId: data.requestId,
        });
      }
    });

    socket.on('friend:remove', (data: { targetUserId: string }) => {
      if (data.targetUserId) {
        socket.to(data.targetUserId).emit('friend:remove', {
          userId: authenticatedUserId,
        });
      }
    });

    socket.on('user:block', async (data: { targetUserId: string }) => {
      if (data.targetUserId) {
        const activeCallId = userActiveCalls.get(authenticatedUserId);
        if (activeCallId) {
          const session = activeCallSessions.get(activeCallId);
          if (
            session &&
            (session.callerId === data.targetUserId || session.receiverId === data.targetUserId)
          ) {
            activeCallSessions.delete(activeCallId);
            userActiveCalls.delete(authenticatedUserId);
            userActiveCalls.delete(data.targetUserId);
            io.to(data.targetUserId).emit('call:ended', {
              callId: activeCallId,
              reason: 'user_blocked',
            });
            socket.emit('call:ended', {
              callId: activeCallId,
              reason: 'user_blocked',
            });
          }
        }

        socket.to(data.targetUserId).emit('user:blocked', {
          blockerId: authenticatedUserId,
        });
      }
    });

    // ==========================================
    // USER DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      const removal = removeSocketUser(socket.id);

      if (removal && removal.isOffline) {
        // Clean up any ongoing active call for this user
        const activeCallId = userActiveCalls.get(removal.userId);
        if (activeCallId) {
          const session = activeCallSessions.get(activeCallId);
          activeCallSessions.delete(activeCallId);
          userActiveCalls.delete(removal.userId);

          if (session) {
            const peerId =
              session.callerId === removal.userId
                ? session.receiverId
                : session.callerId;
            userActiveCalls.delete(peerId);

            try {
              await callService.endCall(session.callerId, session.receiverId, activeCallId);
            } catch (err) {
              console.error('Failed to end call on disconnect:', err);
            }

            io.to(peerId).emit('call:ended', {
              callId: activeCallId,
              reason: 'peer_disconnected',
            });
          }
        }

        try {
          await userService.updateUserStatus(removal.userId, 'offline');
          await broadcastPresence(io, removal.userId, false);
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