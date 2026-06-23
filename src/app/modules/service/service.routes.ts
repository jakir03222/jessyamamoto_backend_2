import express from 'express';
import { serviceController } from './service.controller';
import { userRole } from '../user/user.constant';
import { auth, serviceAuth } from '../../middlewares/auth';

const router = express.Router();

router.post(
  '/register-service',
  serviceAuth(userRole['find care'], userRole['find job']),
  serviceController.registerServiceController,
);

router.get(
  '/locations',
  serviceAuth(userRole['find care'], userRole['find job']),
  serviceController.getAllServiceLocations,
);

router.get(
  '/service-base-user/:categoryId',
  serviceAuth(userRole['find care'], userRole['find job']),
  serviceController.serviceBaseUserController,
);

router.get(
  '/service-user-base-user/:categoryId',
  serviceAuth(userRole['find care'], userRole['find job']),
  serviceController.serviceUserBaseUserController,
);

router.get(
  '/:userId',
  auth(userRole['find care'], userRole['find job']),
  serviceController.singleUserService,
);

router.delete(
  '/:userId',
  auth(userRole.admin),
  serviceController.deleteService,
);

export const serviceRouter = router;
