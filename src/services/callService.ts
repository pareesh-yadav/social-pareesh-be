import { prisma } from '../config/database';
import { NotFoundError, AuthorizationError, ValidationError } from '../utils/errors';

export const callService = {
  getUserCallHistory: async (
    userId: string,
    limit = 20,
    offset = 0
  ) => {
    // Fetch calls where the user is either caller or receiver
    const calls = await prisma.callLog.findMany({
      where: {
        OR: [{ callerId: userId }, { receiverId: userId }],
        // Hide ongoing calls from the history list until they finish
        status: { not: 'ongoing' },
      },
      include: {
        caller: {
          select: { id: true, username: true, profilePicUrl: true },
        },
        receiver: {
          select: { id: true, username: true, profilePicUrl: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.callLog.count({
      where: {
        OR: [{ callerId: userId }, { receiverId: userId }],
        status: { not: 'ongoing' },
      },
    });

    return {
      // Map the data to cleanly provide the "otherUser" for the frontend
      items: calls.map((call) => {
        const isOutgoing = call.callerId === userId;
        const otherUser = isOutgoing ? call.receiver : call.caller;

        // Strip the nested caller/receiver objects and provide a flat structure
        const { caller, receiver, ...rest } = call;
        return {
          ...rest,
          otherUser,
        };
      }),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  },

  initiateCall: async (callerId: string, receiverId: string, isVideo: boolean) => {
    if (callerId === receiverId) {
      throw new ValidationError('You cannot call yourself');
    }

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      throw new NotFoundError('User not found');
    }

    return await prisma.callLog.create({
      data: {
        callerId,
        receiverId,
        type: isVideo ? 'video' : 'audio',
        status: 'ongoing',
      },
    });
  },

  acceptCall: async (callerId: string, receiverId: string) => {
    // Find the latest ongoing call between these two users
    const activeCall = await prisma.callLog.findFirst({
      where: {
        callerId,
        receiverId,
        status: 'ongoing',
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeCall) {
      throw new NotFoundError('No active incoming call found to accept');
    }

    return await prisma.callLog.update({
      where: { id: activeCall.id },
      data: { status: 'in_progress' }, // Distinguishes it from 'ongoing' (ringing)
    });
  },

  endCall: async (callerId: string, receiverId: string) => {
    // Find the latest active call (either ringing or in-progress)
    const activeCall = await prisma.callLog.findFirst({
      where: {
        callerId,
        receiverId,
        status: { in: ['ongoing', 'in_progress'] },
      },
      orderBy: { startedAt: 'desc' },
    });

    // If no active call is found, silently return (sockets often fire multiple disconnects)
    if (!activeCall) return null;

    const endedAt = new Date();
    const durationInSeconds = Math.floor(
      (endedAt.getTime() - activeCall.startedAt.getTime()) / 1000
    );

    // If the call was never accepted ('in_progress'), it counts as missed or rejected
    const finalStatus = activeCall.status === 'in_progress' ? 'completed' : 'missed';

    return await prisma.callLog.update({
      where: { id: activeCall.id },
      data: {
        status: finalStatus,
        endedAt,
        duration: finalStatus === 'completed' ? durationInSeconds : 0,
      },
    });
  },

  deleteCallLog: async (callId: string, userId: string) => {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callId },
    });

    if (!callLog) {
      throw new NotFoundError('Call log not found');
    }

    if (callLog.callerId !== userId && callLog.receiverId !== userId) {
      throw new AuthorizationError('You do not have permission to delete this call log');
    }

    await prisma.callLog.delete({
      where: { id: callId },
    });
  },
};