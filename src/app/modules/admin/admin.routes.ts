import express from 'express';
import { auth } from '../../middlewares/auth';
import { userRole } from '../user/user.constant';
import { adminController } from './admin.controller';

const router = express.Router();

router.get(
  '/workers/pending',
  auth(userRole.admin),
  adminController.getPendingWorkers,
);

router.post(
  '/workers/:id/approve',
  auth(userRole.admin),
  adminController.approveWorker,
);

router.post(
  '/workers/:id/reject',
  auth(userRole.admin),
  adminController.rejectWorker,
);

export const adminRoutes = router;
