import { Router } from 'express';
import { conversationController } from '../controllers/conversationController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, conversationController.getConversations);
router.post('/', authMiddleware, conversationController.startConversation);
router.get('/:id', authMiddleware, conversationController.getConversation);

export default router;