import { Router } from 'express';
import {
  listClinicalHistory,
  getClinicalHistory,
  createClinicalHistory
} from '../controllers/clinicalHistoryController';
import authenticateJWT from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', listClinicalHistory);
router.get('/:id', getClinicalHistory);
router.post('/', createClinicalHistory);

export default router;