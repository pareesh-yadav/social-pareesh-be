import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/search', authMiddleware, userController.searchUsers);
router.get('/online', authMiddleware, userController.getOnlineUsers);
router.get('/:id', authMiddleware, userController.getUser);
router.get('/:id/status', authMiddleware, userController.getUserStatus);
router.patch('/:id', authMiddleware, userController.updateProfile);
router.patch('/:id/changePassword', authMiddleware, userController.changePassword);


export default router;