import { Router } from 'express';
import { callController } from '../controllers/callController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware); // Ensures req.userId! is populated

router.get('/history', callController.getCallHistory);
router.delete('/history/:id', callController.deleteCallLog);

export default router;