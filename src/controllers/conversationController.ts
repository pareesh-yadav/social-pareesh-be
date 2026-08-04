import { Request, Response } from 'express';
import { conversationService } from '../services/conversationService';

export const conversationController = {
  getConversations: async (req: Request, res: Response): Promise<Response> => {
    const conversations = await conversationService.getConversations(
      req.userId!
    );

    return res.json({
      success: true,
      data: conversations,
    });
  },

  startConversation: async (req: Request, res: Response): Promise<Response> => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const conversation =
      await conversationService.getOrCreateConversation(
        req.userId!,
        userId
      );

    return res.status(201).json({
      success: true,
      data: conversation,
      message: 'Conversation started',
    });
  },

  getConversation: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const conversationId = Array.isArray(id) ? id[0] : id;

    const conversation = await conversationService.getConversation(
      conversationId,
      req.userId!
    );

    return res.json({
      success: true,
      data: conversation,
    });
  },
};