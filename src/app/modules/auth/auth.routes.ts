import express from 'express';
import { authController } from './auth.controller';

import { userRole } from '../user/user.constant';
import { auth } from '../../middlewares/auth';

const router = express.Router();

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-forgot-password-otp', authController.verifyForgotPasswordOtp);
router.post('/verify-email', authController.verifyEmail);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', authController.logoutUser);
router.post(
  '/change-password',
  auth(userRole.admin, userRole['find care'], userRole['find job']),
  authController.changePassword,
);

export const authRoutes = router;
