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
      message: 'User registered successfully. Check email for OTP.',
    });
  },

  verifyRegistration: async (req: Request, res: Response): Promise<Response> => {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required' });
    }

    const result = await authService.verifyRegistration(email, otp);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Email verified successfully. You are now logged in.',
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

  forgotPassword: async (req: Request, res: Response): Promise<Response> => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    await authService.forgotPassword(email);

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset code has been sent.',
    });
  },

  resetPassword: async (req: Request, res: Response): Promise<Response> => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const otp = String(req.body?.otp ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, and new password are required',
      });
    }

    await authService.resetPassword(email, otp, password);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  },
};