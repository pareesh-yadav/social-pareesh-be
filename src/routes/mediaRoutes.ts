import { Router } from 'express';
import { mediaController } from '../controllers/mediaController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/imagekit/auth', mediaController.getAuthParameters);
router.delete('/file/:fileId', mediaController.deleteMedia);

export default router;
