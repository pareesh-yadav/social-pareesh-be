import { z } from 'zod';

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{6,50}$/;

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email(),
  password: z.string().trim().min(6).max(50).refine((value) => passwordPattern.test(value), 'Password must contain uppercase, lowercase, number, and special character'),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

export const updateProfileSchema = z.object({
  username: z.string().trim().min(3).max(50).optional(),
  bio: z.union([z.string().trim().max(500), z.literal(''), z.null()]).optional(),
  profilePicUrl: z.union([z.string().trim().url(), z.literal(''), z.null()]).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
  parentMessageId: z.string().optional(),
});

export const friendRequestSchema = z.object({
  receiverId: z.string(),
});

const passwordSchema = z
  .string()
  .trim()
  .min(6, 'Password must be at least 6 characters long')
  .max(50, 'Password must not exceed 50 characters')
  .refine((password) => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
  .refine((password) => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
  .refine((password) => /\d/.test(password), 'Password must contain at least one number')
  .refine((password) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password), 'Password must contain at least one special character');

export const changePasswordSchema = z.object({
  userId: z.string(),
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
}).refine(
  (data) => data.oldPassword !== data.newPassword,
  {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  }
);

export const resetPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  newPassword: passwordSchema,
  token: z.string().min(1, 'Reset token is required'),
});

export const validate = <T>(schema: z.Schema<T>, data: unknown): T => {
  return schema.parse(data);
};