import { Request, Response } from 'express';
import { callService } from '../services/callService';

export const callController = {
  getCallHistory: async (req: Request, res: Response): Promise<Response> => {
    // Using default limit of 20 for call logs, similar to messages
    const { limit = '20', offset = '0' } = req.query;

    const result = await callService.getUserCallHistory(
      req.userId!,
      parseInt(String(limit)),
      parseInt(String(offset))
    );

    return res.json({
      success: true,
      data: result,
      message: 'Call history fetched successfully',
    });
  },

  // Optional: If you ever want users to clear specific calls from their history
  deleteCallLog: async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const callId = Array.isArray(id) ? id[0] : id;

    // Assuming you add a deleteCallLog method to callService in the future
    await callService.deleteCallLog(callId, req.userId!);

    return res.json({
      success: true,
      message: 'Call log deleted successfully',
    });
  },
};