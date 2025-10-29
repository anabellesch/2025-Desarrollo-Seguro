import { Router } from 'express';
import routes from '../controllers/authController';
import authenticateJWT from '../middleware/auth.middleware';

const router = Router();

router.get('/', routes.ping);
router.post('/login', routes.login);
router.post('/forgot-password', routes.forgotPassword);
router.post('/reset-password', routes.resetPassword);
router.post('/set-password', routes.setPassword);

export default router;
