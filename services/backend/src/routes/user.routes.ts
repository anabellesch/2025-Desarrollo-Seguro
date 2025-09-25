import { Router } from 'express';
import routes from '../controllers/authController';
import authenticateJWT from '../middleware/auth.middleware';

const router = Router();

router.post('/', routes.createUser);
router.put('/:id', authenticateJWT, routes.updateUser);

export default router;
