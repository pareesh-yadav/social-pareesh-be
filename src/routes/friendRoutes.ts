import { Router } from 'express';
import { friendController } from '../controllers/friendController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/request', authMiddleware, friendController.sendRequest);
router.get('/requests', authMiddleware, friendController.getPendingRequests);
router.get('/requests/sent', authMiddleware, friendController.getSentRequests);
router.delete('/requests/:id/cancel', authMiddleware, friendController.cancelRequest);
router.patch('/requests/:id', authMiddleware, friendController.acceptRequest);
router.delete('/requests/:id', authMiddleware, friendController.rejectRequest);
router.get('/blocked', authMiddleware, friendController.getBlockedUsers);
router.post('/block', authMiddleware, friendController.blockUser);
router.delete('/block/:id', authMiddleware, friendController.unblockUser);
router.get('/', authMiddleware, friendController.getFriends);
router.delete('/:id', authMiddleware, friendController.removeFriend);

export default router;