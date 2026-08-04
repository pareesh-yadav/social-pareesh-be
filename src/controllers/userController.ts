import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { validate, updateProfileSchema } from '../utils/validators';

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
    const status = await userService.getUserStatus(Array.isArray(id) ? id[0] : id);

    return res.json({
      success: true,
      data: status,
    });
  },

  getOnlineUsers: async (_req: Request, res: Response): Promise<Response> => {
    const users = await userService.getOnlineUsers();

    return res.json({
      success: true,
      data: users,
    });
  },
};