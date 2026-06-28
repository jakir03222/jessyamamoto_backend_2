import express from 'express';
import { userController } from './user.controller';

import { fileUploader } from '../../helper/fileUploder';
import { userRole } from './user.constant';
import { auth } from '../../middlewares/auth';

const router = express.Router();

router.post('/', userController.createUser);

// Stripe account create
router.post(
  '/create-stripe-account',
  auth(userRole['find job']),
  userController.createStripeAccount,
);

// Stripe dashboard link
router.get(
  '/dashboard-link',
  auth(userRole['find job']),
  userController.getStripeAccount,
);

router.get(
  '/profile',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  userController.profile,
);
router.put(
  '/profile',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  fileUploader.upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'galary', maxCount: 6 },
    { name: 'certifications', maxCount: 10 },
  ]),
  userController.updateMyProfile,
);
router.post(
  '/switch-role',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  userController.switchRole,
);
router.post(
  '/complete-onboarding',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  userController.completeOnboarding,
);
router.get('/all-user', auth(userRole.admin), userController.getAllUser);
router.patch(
  '/update-galary',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  fileUploader.upload.array('galary', 6),
  userController.uploadGalaryImages,
);
router.patch(
  '/update-certifications',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  fileUploader.upload.array('certifications'),
  userController.certificationsUpload,
);

router.put(
  '/:id',
  auth(userRole.admin),
  fileUploader.upload.array('profileImage'),
  userController.updateUserById,
);
router.get('/:id', userController.getUserById);
router.delete('/:id', auth(userRole.admin), userController.deleteUserById);

export const userRoutes = router;
