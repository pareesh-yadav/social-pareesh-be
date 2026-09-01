import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/verify-registration', authController.verifyRegistration);
router.post('/resend-verification', authController.resendVerification);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password', authController.resetPassword);
router.get('/me', authMiddleware, authController.me);

export default router;