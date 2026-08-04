import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
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

export const validate = <T>(schema: z.Schema<T>, data: unknown): T => {
  return schema.parse(data);
};