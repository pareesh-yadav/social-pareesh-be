import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { validate, registerSchema, loginSchema } from '../utils/validators';

export const authController = {
  register: async (req: Request, res: Response): Promise<Response> => {
    const { username, email, password } = validate(registerSchema, req.body);

    const result = await authService.register(username, email, password);

    return res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  },

  login: async (req: Request, res: Response): Promise<Response> => {
    const { email, password } = validate(loginSchema, req.body);

    const result = await authService.login(email, password);

    return res.json({
      success: true,
      data: result,
      message: 'Logged in successfully',
    });
  },

  refreshToken: async (req: Request, res: Response): Promise<Response> => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    const result = await authService.refreshToken(refreshToken);

    return res.json({
      success: true,
      data: result,
    });
  },

  logout: async (_req: Request, res: Response): Promise<Response> => {
    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  },

  me: async (req: Request, res: Response): Promise<Response> => {
    const { userService } = await import('../services/userService');
    const user = await userService.getUserById(req.userId!);

    return res.json({
      success: true,
      data: user,
    });
  },
};