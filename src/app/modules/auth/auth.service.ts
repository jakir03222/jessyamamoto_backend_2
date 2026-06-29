/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../config';
import AppError from '../../error/appError';
import { IUser } from '../user/user.interface';
import User from '../user/user.model';
import { jwtHelpers } from '../../helper/jwtHelpers';
import sendMailer from '../../helper/sendMailer';
import bcrypt from 'bcryptjs';
import createOtpTemplate from '../../utils/createOtpTemplate';
import { userRole } from '../user/user.constant';
import { getMyServicesPaidCategoryIds } from '../user/user.service';
import {
  assertLoginAllowedForRole,
  ensureUserRoles,
  normalizeAppRole,
  serializeUserWithRoles,
} from '../user/user.role.util';
import { stringifyUserId } from '../../helper/jwtUser.util';

const buildTokenPayload = (user: InstanceType<typeof User>) => {
  ensureUserRoles(user);
  return {
    id: stringifyUserId(user._id),
    role: user.role,
    roles: user.roles ?? [user.role],
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName || '',
    gender: user.gender,
    subscription: user.isSubscription,
  };
};

const buildAuthResponse = async (user: InstanceType<typeof User>) => {
  const tokenPayload = buildTokenPayload(user);
  const accessToken = jwtHelpers.genaretToken(
    tokenPayload,
    config.jwt.accessTokenSecret as Secret,
    config.jwt.accessTokenExpires,
  );
  const refreshToken = jwtHelpers.genaretToken(
    tokenPayload,
    config.jwt.refreshTokenSecret as Secret,
    config.jwt.refreshTokenExpires,
  );

  const { password, ...userWithoutPassword } = user.toObject();
  const myServicesPaidCategoryIds = await getMyServicesPaidCategoryIds(
    user._id.toString(),
  );

  return {
    accessToken,
    refreshToken,
    user: {
      ...serializeUserWithRoles(user),
      ...userWithoutPassword,
      myServicesPaidCategoryIds,
    },
  };
};

const registerUser = async (payload: Partial<IUser>) => {
  const exist = await User.findOne({ email: payload.email });
  if (exist) throw new AppError(400, 'User already exists');

  const idx = Math.floor(Math.random() * 100);
  payload.profileImage = `https://avatar.iran.liara.run/public/${idx}.png`;

  const user = await User.create(payload);

  return user;
};

const loginUser = async (payload: Partial<IUser>) => {
  const user = await User.findOne({ email: payload.email }).select('+password');
  if (!user) throw new AppError(401, 'User not found');
  if (!payload.password) throw new AppError(400, 'Password is required');

  const activeRole = normalizeAppRole(user.role);
  if (!activeRole) throw new AppError(400, 'Invalid user role');

  if (activeRole !== userRole.admin) {
    assertLoginAllowedForRole(user, activeRole);
  }

  const isPasswordMatched = await bcrypt.compare(
    payload.password,
    user.password,
  );
  if (!isPasswordMatched) throw new AppError(401, 'Password not matched');

  return buildAuthResponse(user);
};

const refreshToken = async (token: string) => {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new AppError(401, 'Refresh token is required');
  }

  const varifiedToken = jwtHelpers.verifyToken(
    token.trim(),
    token,
    config.jwt.refreshTokenSecret as Secret,
  ) as JwtPayload;

  const user = await User.findById(varifiedToken.id);
  if (!user) throw new AppError(401, 'User not found');

  const activeRole = normalizeAppRole(user.role);
  if (!activeRole) throw new AppError(400, 'Invalid user role');

  if (activeRole !== userRole.admin) {
    assertLoginAllowedForRole(user, activeRole);
  }

  const tokenPayload = buildTokenPayload(user);
  const accessToken = jwtHelpers.genaretToken(
    tokenPayload,
    config.jwt.accessTokenSecret as Secret,
    config.jwt.accessTokenExpires,
  );

  const { password, ...userWithoutPassword } = user.toObject();
  const myServicesPaidCategoryIds = await getMyServicesPaidCategoryIds(
    user._id.toString(),
  );

  return {
    accessToken,
    user: {
      ...serializeUserWithRoles(user),
      ...userWithoutPassword,
      myServicesPaidCategoryIds,
    },
  };
};

const forgotPassword = async (email: string) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new AppError(401, 'User not found');

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();

  await sendMailer(
    user.email,
    user.firstName,
    createOtpTemplate(otp, user.email, 'Your Company'),
  );

  return { message: 'OTP sent to your email' };
};

const verifyEmail = async (email: string, otp: string) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError(401, 'User not found');

  if (user.otp !== otp || !user.otpExpiry || user.otpExpiry < new Date()) {
    throw new AppError(400, 'Invalid or expired OTP');
  }

  user.verified = true;
  (user as any).otp = undefined;
  (user as any).otpExpiry = undefined;
  await user.save();

  return { message: 'Email verified successfully' };
};

const assertForgotPasswordOtp = (user: IUser, otp: string) => {
  const code = String(otp || '').trim();
  if (!code) throw new AppError(400, 'OTP is required');
  if (user.otp !== code || !user.otpExpiry || user.otpExpiry < new Date()) {
    throw new AppError(400, 'Invalid or expired OTP');
  }
};

const verifyForgotPasswordOtp = async (email: string, otp: string) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new AppError(401, 'User not found');

  assertForgotPasswordOtp(user, otp);

  return { message: 'OTP verified' };
};

const resetPassword = async (
  email: string,
  otp: string,
  newPassword: string,
) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new AppError(404, 'User not found');

  assertForgotPasswordOtp(user, otp);

  const normalizedPassword = String(newPassword || '').trim();
  if (normalizedPassword.length < 6) {
    throw new AppError(400, 'Password must be at least 6 characters');
  }

  const activeRole = normalizeAppRole(user.role);
  if (activeRole && activeRole !== userRole.admin) {
    assertLoginAllowedForRole(user, activeRole);
  }

  user.password = normalizedPassword;
  (user as any).otp = undefined;
  (user as any).otpExpiry = undefined;
  await user.save();

  return buildAuthResponse(user);
};

const changePassword = async (
  userId: string,
  oldPassword: string,
  newPassword: string,
) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError(404, 'User not found');

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new AppError(400, 'Old password is incorrect');
  }

  if (oldPassword === newPassword) {
    throw new AppError(400, 'New password must be different');
  }

  user.password = newPassword;
  await user.save();

  return { message: 'Password changed successfully' };
};

export const authService = {
  registerUser,
  loginUser,
  refreshToken,
  forgotPassword,
  verifyEmail,
  verifyForgotPasswordOtp,
  resetPassword,
  changePassword,
  buildAuthResponse,
};
