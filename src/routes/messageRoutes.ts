import { Router } from 'express';
import { messageController } from '../controllers/messageController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get(
  '/conversations/:conversationId/messages',
  authMiddleware,
  messageController.getMessages
);
router.post(
  '/conversations/:conversationId/messages',
  authMiddleware,
  messageController.sendMessage
);
router.patch('/messages/:id/edit', authMiddleware, messageController.editMessage);
router.delete('/messages/:id', authMiddleware, messageController.deleteMessage);
router.post('/messages/:id/read', authMiddleware, messageController.markAsRead);

export default router;