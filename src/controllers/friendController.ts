import { Request, Response } from 'express';
import { friendService } from '../services/friendService';
import { validate, friendRequestSchema } from '../utils/validators';

export const friendController = {
  sendRequest: async (req: Request, res: Response): Promise<Response> => {
    const { receiverId } = validate(friendRequestSchema, req.body);

    const friendRequest = await friendService.sendFriendRequest(
      req.userId!,
      receiverId
    );

    return res.status(201).json({
      success: true,
      data: friendRequest,
      message: 'Friend request sent',
    });
  },

  getPendingRequests: async (req: Request, res: Response): Promise<Response> => {
    const requests = await friendService.getPendingRequests(
      req.userId!
    );

    return res.json({
      success: true,
      data: requests,
    });
  },

  acceptRequest: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const requestId = Array.isArray(id) ? id[0] : id;

    const friendRequest = await friendService.acceptFriendRequest(
      requestId,
      req.userId!
    );

    return res.json({
      success: true,
      data: friendRequest,
      message: 'Friend request accepted',
    });
  },

  rejectRequest: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const requestId = Array.isArray(id) ? id[0] : id;

    await friendService.rejectFriendRequest(requestId, req.userId!);

    return res.json({
      success: true,
      message: 'Friend request rejected',
    });
  },

  getFriends: async (req: Request, res: Response): Promise<Response> => {
    const friends = await friendService.getFriends(req.userId!);

    return res.json({
      success: true,
      data: friends,
    });
  },

  removeFriend: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const friendId = Array.isArray(id) ? id[0] : id;

    await friendService.removeFriend(req.userId!, friendId);

    return res.json({
      success: true,
      message: 'Friend removed',
    });
  },
};