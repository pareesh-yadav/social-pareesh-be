import { Request, Response } from 'express';
import { messageService } from '../services/messageService';

export const messageController = {
  getMessages: async (req: Request, res: Response): Promise<Response> => {
    const { conversationId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    const conversationIdValue = Array.isArray(conversationId) ? conversationId[0] : conversationId;

    const result = await messageService.getConversationMessages(
      conversationIdValue,
      req.userId!,
      parseInt(String(limit)),
      parseInt(String(offset))
    );

    return res.json({
      success: true,
      data: result,
    });
  },

  sendMessage: async (req: Request, res: Response): Promise<Response> => {
    const { conversationId } = req.params;
    const { content, parentMessageId } = req.body;
    const conversationIdValue = Array.isArray(conversationId) ? conversationId[0] : conversationId;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required',
      });
    }

    const message = await messageService.sendMessage(
      conversationIdValue,
      req.userId!,
      content,
      parentMessageId
    );

    return res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent successfully',
    });
  },

  editMessage: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const { content } = req.body;
    const messageId = Array.isArray(id) ? id[0] : id;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required',
      });
    }

    const message = await messageService.editMessage(
      messageId,
      req.userId!,
      content
    );

    return res.json({
      success: true,
      data: message,
      message: 'Message updated successfully',
    });
  },

  deleteMessage: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const messageId = Array.isArray(id) ? id[0] : id;

    await messageService.deleteMessage(messageId, req.userId!);

    return res.json({
      success: true,
      message: 'Message deleted successfully',
    });
  },

  markAsRead: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const messageId = Array.isArray(id) ? id[0] : id;

    await messageService.markAsRead(messageId, req.userId!);

    return res.json({
      success: true,
      message: 'Message marked as read',
    });
  },
};