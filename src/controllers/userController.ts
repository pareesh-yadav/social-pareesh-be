import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { validate, updateProfileSchema, changePasswordSchema } from '../utils/validators';
import { AuthorizationError } from '../utils/errors';
import { getIO, isUserConnected, broadcastPresence } from '../utils/socketHandler';

export const userController = {
  getUser: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const user = await userService.getUserById(Array.isArray(id) ? id[0] : id);

    return res.json({
      success: true,
      data: user,
    });
  },

  searchUsers: async (req: Request, res: Response): Promise<Response> => {
    const { q, limit = '10' } = req.query;
    const query = Array.isArray(q) ? q[0] : q;
    const searchQuery = typeof query === 'string' ? query : '';

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const users = await userService.searchUsers(
      searchQuery,
      parseInt(String(limit))
    );

    return res.json({
      success: true,
      data: {
        items: users.items,
        total: users.total,
        page: users.page,
        limit: users.limit,
      },
    });
  },

  updateProfile: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const targetUserId = Array.isArray(id) ? id[0] : id;
    if (targetUserId && targetUserId !== req.userId) {
      throw new AuthorizationError('You can only update your own profile');
    }

    const data = validate(updateProfileSchema, req.body);
    const normalizedData = {
      ...(data.username !== undefined ? { username: data.username } : {}),
      ...(data.bio !== undefined ? { bio: data.bio === '' ? null : data.bio } : {}),
      ...(data.profilePicUrl !== undefined
        ? { profilePicUrl: data.profilePicUrl === '' ? null : data.profilePicUrl }
        : {}),
    };
    const user = await userService.updateProfile(req.userId!, normalizedData);

    return res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully',
    });
  },

  getUserStatus: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const status = await userService.getUserStatus(Array.isArray(id) ? id[0] : id, req.userId);

    return res.json({
      success: true,
      data: status,
    });
  },

  getOnlineUsers: async (req: Request, res: Response): Promise<Response> => {
    const users = await userService.getOnlineUsers(req.userId);

    return res.json({
      success: true,
      data: users,
    });
  },

  changePassword: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const targetUserId = Array.isArray(id) ? id[0] : id;
    if (targetUserId && targetUserId !== req.userId) {
      throw new AuthorizationError('You can only change your own password');
    }

    const { currentPassword, newPassword } = req.body;
    const data = validate(changePasswordSchema, {
      userId: req.userId!,
      oldPassword: currentPassword,
      newPassword,
    });

    const response = await userService.changePassword(data.userId!, data.oldPassword, data.newPassword);

    return res.json({
      success: true,
      message: response.message || 'Password changed successfully',
    });
  },

  reportUser: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const targetUserId = Array.isArray(id) ? id[0] : id;
    const { reason, details } = req.body;

    const report = await userService.reportUser(req.userId!, targetUserId, reason, details);

    return res.status(201).json({
      success: true,
      data: report,
      message: 'Report submitted successfully. Our team will review it.',
    });
  },

  getPrivacySettings: async (req: Request, res: Response): Promise<Response> => {
    const settings = await userService.getPrivacySettings(req.userId!);

    return res.json({
      success: true,
      data: settings,
    });
  },

  updatePrivacySettings: async (req: Request, res: Response): Promise<Response> => {
    const settings = await userService.updatePrivacySettings(req.userId!, req.body);

    // Sync presence in real time via Socket.IO
    try {
      const io = getIO();
      if (io && req.userId) {
        const isOnline = isUserConnected(req.userId);
        await broadcastPresence(io, req.userId, isOnline);
      }
    } catch (e) {
      console.warn('Could not broadcast presence update:', e);
    }

    return res.json({
      success: true,
      data: settings,
      message: 'Privacy settings updated successfully',
    });
  },

  deleteAccount: async (req: Request, res: Response): Promise<Response> => {
    const { password } = req.body;

    await userService.deleteAccountWithPassword(req.userId!, password);

    return res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  },
};