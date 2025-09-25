import { Router } from 'express';
import routes from '../controllers/invoiceController';
import authenticateJWT from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', routes.listInvoices);
router.get('/:id', routes.getInvoice);
router.post('/:id/pay', routes.setPaymentCard);
router.get('/:id/invoice', routes.getInvoicePDF);

export default router;