import { Request, Response } from 'express';
import { getUploadAuthParameters, deleteImageKitFile } from '../config/imagekit';
import { prisma } from '../config/database';
import { AuthorizationError } from '../utils/errors';

export const mediaController = {
  getAuthParameters: async (req: Request, res: Response): Promise<Response> => {
    if (!req.userId) {
      throw new AuthorizationError('Authentication required to upload media');
    }

    const authParams = getUploadAuthParameters();

    return res.json({
      success: true,
      data: authParams,
    });
  },

  deleteMedia: async (req: Request, res: Response): Promise<Response> => {
    const rawFileId = req.params.fileId;
    const fileId = Array.isArray(rawFileId) ? rawFileId[0] : rawFileId;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'File ID is required',
      });
    }

    // Optional check: verify if the file belongs to a message sent by this user
    const message = await prisma.message.findFirst({
      where: {
        attachmentMetadata: {
          contains: String(fileId),
        },
      },
      select: {
        id: true,
        senderId: true,
      },
    });

    if (message && message.senderId !== req.userId) {
      throw new AuthorizationError('You do not have permission to delete this media file');
    }

    const deleted = await deleteImageKitFile(String(fileId));

    return res.json({
      success: true,
      message: deleted ? 'Media deleted successfully' : 'Failed to delete media from storage',
    });
  },
};
