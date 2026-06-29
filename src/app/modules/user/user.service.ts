import Stripe from 'stripe';
import mongoose from 'mongoose';
import AppError from '../../error/appError';
import { fileUploader } from '../../helper/fileUploder';
import pagination, { IOption } from '../../helper/pagenation';
import Payment from '../payment/payment.model';
import Service from '../service/service.model';
import { IUser } from './user.interface';
import User from './user.model';
import { normalizeUserLanguages } from './user.language.util';
import { isApprovedUserStatus } from './user.status.util';
import { userRole } from './user.constant';
import config from '../../config';
import { getLocationFromZip } from '../../helper/geocode';
import { jwtHelpers } from '../../helper/jwtHelpers';
import { stringifyUserId } from '../../helper/jwtUser.util';
import { Secret } from 'jsonwebtoken';
import {
  applyRoleProfileToTopLevel,
  assertLoginAllowedForRole,
  ensureRoleProfile,
  ensureUserRoles,
  normalizeAppRole,
  pickRoleProfileUpdates,
  saveTopLevelToRoleProfile,
  serializeUserWithRoles,
} from './user.role.util';
import { USER_APPROVAL_STATUS } from './user.status.util';

/**
 * Category ids for home "My Services": categories the user registered (user.category),
 * with fallback to distinct Service.categoryId for that user.
 */
export const getMyServicesPaidCategoryIds = async (
  userId: string,
): Promise<string[]> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return [];
  }
  const uid = new mongoose.Types.ObjectId(userId);

  const ordered: string[] = [];
  const seen = new Set<string>();

  const pushCat = (raw: string | undefined | null) => {
    const id = raw?.toString().trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  const user = await User.findById(uid).select('category').lean();
  if (user?.category?.length) {
    for (const c of user.category) {
      pushCat(c?.toString());
    }
    return ordered;
  }

  const services = await Service.find({ userId: uid })
    .select('categoryId createdAt')
    .sort({ createdAt: 1 })
    .lean();

  for (const s of services) {
    pushCat(s.categoryId?.toString());
  }

  return ordered;
};

const createUser = async (payload: IUser) => {
  const user = await User.findOne({ email: payload.email });
  if (user) {
    throw new AppError(400, 'User already exists');
  }
  const idx = Math.floor(Math.random() * 100);
  const avatarUrl = `https://avatar.iran.liara.run/public/${idx}.png`;
  payload.profileImage = avatarUrl;
  const result = await User.create(payload);

  if (!result) {
    throw new AppError(400, 'Failed to create user');
  }
  return result;
};

const getAllUser = async (params: any, options: IOption) => {
  const { page, limit, skip, sortBy, sortOrder } = pagination(options);
  const { searchTerm, minHourRate, maxHourRate, ...filterData } = params;

  const andCondition: any[] = [];
  const userSearchableFields = [
    'firstName',
    'lastName',
    'bio',
    'phone',
    'status',
    'gender',
    'email',
    'role',
  ];

  if (searchTerm as any) {
    andCondition.push({
      $or: userSearchableFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andCondition.push({
      $and: Object.entries(filterData).map(([field, value]) => ({
        [field]: value,
      })),
    });
  }

  if (minHourRate || maxHourRate) {
    const hourRateCondition: any = {};

    if (minHourRate) {
      hourRateCondition.$gte = Number(minHourRate);
    }

    if (maxHourRate) {
      hourRateCondition.$lte = Number(maxHourRate);
    }

    andCondition.push({
      hourRate: hourRateCondition,
    });
  }

  const whereCondition = andCondition.length > 0 ? { $and: andCondition } : {};

  const result = await User.find(whereCondition)
    .skip(skip)
    .limit(limit)
    .sort({ [sortBy]: sortOrder } as any)
    .populate('service')
    .populate('category');

  if (!result) {
    throw new AppError(404, 'Users not found');
  }

  const total = await User.countDocuments(whereCondition);

  return {
    data: result,
    meta: {
      total,
      page,
      limit,
    },
  };
};

const getUserById = async (id: string) => {
  const result = await User.findById(id)
    .populate('category')
    .populate('service');
  if (!result) {
    throw new AppError(404, 'User not found');
  }

  if (
    result.role === userRole['find job'] &&
    !isApprovedUserStatus(result.userStatus)
  ) {
    throw new AppError(404, 'User not found');
  }

  return result;
};

const updateUserById = async (
  id: string,
  payload: IUser,
  file?: Express.Multer.File[],
) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  if (file?.length) {
    const { url } = await fileUploader.uploadToCloudinary(file[0]!);
    payload.profileImage = url;
  }

  const result = await User.findByIdAndUpdate(id, payload, { new: true });
  if (!result) {
    throw new AppError(404, 'User not found');
  }
  return result;
};

const deleteUserById = async (id: string) => {
  const result = await User.findByIdAndDelete(id);
  if (!result) {
    throw new AppError(404, 'User not found');
  }
  return result;
};

const profile = async (id: string, email?: string) => {
  let result = await User.findById(id)
    .populate('totalBooking')
    .populate('givenReviewRatting');

  if (!result && email?.trim()) {
    result = await User.findOne({ email: email.trim().toLowerCase() })
      .populate('totalBooking')
      .populate('givenReviewRatting');
  }

  if (!result) {
    throw new AppError(404, 'User not found');
  }

  ensureUserRoles(result);
  const activeRole = normalizeAppRole(result.role);
  if (activeRole) {
    applyRoleProfileToTopLevel(result, activeRole);
  }

  return {
    ...serializeUserWithRoles(result),
    myServicesPaidCategoryIds: await getMyServicesPaidCategoryIds(id),
  };
};

const MAX_PROFILE_PHOTOS = 6;

const normalizeProfileGalary = (user: {
  galary?: string[];
  profileImage?: string | string[];
}): string[] => {
  const urls: string[] = [];
  const push = (raw?: string | null) => {
    const u = raw?.trim();
    if (u && !urls.includes(u)) urls.push(u);
  };
  const profile = user.profileImage;
  if (typeof profile === 'string') {
    push(profile);
  } else if (Array.isArray(profile)) {
    for (const item of profile) push(String(item));
  }
  for (const item of user.galary ?? []) {
    push(String(item));
  }
  return urls.slice(0, MAX_PROFILE_PHOTOS);
};

const syncProfileImageFromGalary = (galary: string[], fallback?: string) => {
  if (galary.length > 0) return galary[0]!;
  return fallback?.trim() || '';
};

const updateMyProfile = async (
  id: string,
  payload: Partial<IUser>,
  profileImageFile?: Express.Multer.File,
  certificationFiles: Express.Multer.File[] = [],
) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  if (profileImageFile) {
    const { url } = await fileUploader.uploadToCloudinary(profileImageFile);
    const galary = normalizeProfileGalary(user);
    if (galary.length > 0) {
      galary[0] = url;
    } else {
      galary.push(url);
    }
    payload.galary = galary.slice(0, MAX_PROFILE_PHOTOS);
    payload.profileImage = syncProfileImageFromGalary(payload.galary, url);
  }

  if (payload.language !== undefined) {
    payload.language = normalizeUserLanguages(payload.language);
  }

  if (Array.isArray(payload.galary)) {
    const galary = payload.galary
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, MAX_PROFILE_PHOTOS);
    payload.galary = galary;
    const primary = syncProfileImageFromGalary(
      galary,
      Array.isArray(user.profileImage)
        ? user.profileImage[0]
        : (user.profileImage as string | undefined),
    );
    if (primary) {
      payload.profileImage = primary;
    }
  }

  if (certificationFiles.length > 0) {
    const uploaded = await Promise.all(
      certificationFiles.map((file) =>
        fileUploader.uploadToCloudinary(file),
      ),
    );
    const newUrls = uploaded.map((f) => f.url);
    const existingUrls = Array.isArray(payload.certifications)
      ? payload.certifications.filter((u) => u && String(u).trim())
      : (user.certifications ?? []).map((u) => String(u));
    payload.certifications = [...existingUrls, ...newUrls];
  }

  if (payload.zip && payload.zip !== user.zip) {
    const locationData = await getLocationFromZip(payload.zip);
    if (locationData) {
      payload.location = locationData.location;
      payload.lat = locationData.lat;
      payload.lng = locationData.lng;
    }
  }

  ensureUserRoles(user);
  const activeRole = normalizeAppRole(user.role);
  if (activeRole) {
    const profileUpdates = pickRoleProfileUpdates(payload);
    const roleProfile = ensureRoleProfile(user, activeRole);
    Object.assign(roleProfile, profileUpdates);
    user.roleProfiles = {
      ...(user.roleProfiles ?? {}),
      [activeRole]: roleProfile,
    };
  }

  const result = await User.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  if (!result) {
    throw new AppError(404, 'User not found');
  }

  if (activeRole) {
    saveTopLevelToRoleProfile(result, activeRole);
    await result.save();
  }

  return serializeUserWithRoles(result);
};

const uploadGalaryImages = async (
  userId: string,
  payload: Partial<IUser>,
  files: Express.Multer.File[],
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  let galary = normalizeProfileGalary(user);

  if (Array.isArray(payload.galary)) {
    galary = payload.galary
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, MAX_PROFILE_PHOTOS);
  }

  if (files?.length) {
    const uploadedFiles = await Promise.all(
      files.map((file) => fileUploader.uploadToCloudinary(file)),
    );
    const newUrls = uploadedFiles.map((file) => file.url);
    const combined = [...galary, ...newUrls].filter(
      (u, i, arr) => arr.indexOf(u) === i,
    );
    if (combined.length > MAX_PROFILE_PHOTOS) {
      throw new AppError(
        400,
        `Maximum ${MAX_PROFILE_PHOTOS} profile photos allowed`,
      );
    }
    galary = combined;
  }

  const profileImage = syncProfileImageFromGalary(
    galary,
    typeof user.profileImage === 'string'
      ? user.profileImage
      : undefined,
  );

  ensureUserRoles(user);
  const activeRole = normalizeAppRole(user.role);
  if (activeRole) {
    const roleProfile = ensureRoleProfile(user, activeRole);
    roleProfile.galary = [...galary];
    roleProfile.profileImage = profileImage;
    user.roleProfiles = {
      ...(user.roleProfiles ?? {}),
      [activeRole]: roleProfile,
    };
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { galary, profileImage, ...(activeRole ? { roleProfiles: user.roleProfiles } : {}) },
    { new: true },
  );

  if (!result) {
    throw new AppError(404, 'User not found');
  }

  if (activeRole) {
    saveTopLevelToRoleProfile(result, activeRole);
    await result.save();
  }

  return serializeUserWithRoles(result);
};

const certificationsUpload = async (
  userId: string,
  payload: IUser,
  files: Express.Multer.File[],
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (files?.length) {
    const uploadedFiles = await Promise.all(
      files.map((file) => fileUploader.uploadToCloudinary(file)),
    );
    const newUrls = uploadedFiles.map((file) => file.url);
    const existingUrls = Array.isArray(user.certifications)
      ? user.certifications.map((u) => String(u))
      : [];
    payload.certifications = [...existingUrls, ...newUrls];
  }

  ensureUserRoles(user);
  const activeRole = normalizeAppRole(user.role);
  if (activeRole && payload.certifications) {
    const roleProfile = ensureRoleProfile(user, activeRole);
    roleProfile.certifications = [...payload.certifications];
    user.roleProfiles = {
      ...(user.roleProfiles ?? {}),
      [activeRole]: roleProfile,
    };
    payload.roleProfiles = user.roleProfiles;
  }

  const result = await User.findByIdAndUpdate(userId, payload, {
    new: true,
  });

  if (!result) {
    throw new AppError(404, 'User not found');
  }

  if (activeRole) {
    saveTopLevelToRoleProfile(result, activeRole);
    await result.save();
  }

  return serializeUserWithRoles(result);
};

const stripe = new Stripe(config.stripe.secretKey!);

// stripe account create (Stripe requires 5–22 chars for statement_descriptor)
const formatStatementDescriptor = (text: string) => {
  if (!text) return 'USER SERVICE';

  let s = text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .substring(0, 22)
    .trim();

  if (!s) return 'USER SERVICE';

  if (s.length < 5) {
    s = `${s} SVC`.substring(0, 22).trim();
    if (s.length < 5) return 'USER SERVICE';
  }

  return s;
};

const createAccountOnboardingLink = (accountId: string) =>
  stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${config.frontendUrl}/connect/refresh`,
    return_url: `${config.frontendUrl}/stripe-account-success`,
    type: 'account_onboarding',
  });

const createStripeAccount = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');

  if (user.stripeAccountId) {
    const existing = await stripe.accounts.retrieve(user.stripeAccountId);
    if (!existing.details_submitted) {
      const accountLink = await createAccountOnboardingLink(
        user.stripeAccountId,
      );
      return {
        url: accountLink.url,
        message: 'Continue Stripe onboarding',
      };
    }
    const login = await stripe.accounts.createLoginLink(user.stripeAccountId);
    return {
      url: login.url,
      message: 'Stripe account is ready',
    };
  }

  const account = await stripe.accounts.create({
    type: 'express',
    email: user.email,
    business_type: 'individual',
    individual: {
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
    },
    business_profile: {
      name: user.firstName,
      product_description: user.bio || 'User service',
      url: 'https://your-default-website.com',
    },
    settings: {
      payments: {
        statement_descriptor: formatStatementDescriptor(
          `${user.firstName} ${user.lastName}`.trim(),
        ),
      },
    },
  } as any);

  if (!account) {
    throw new AppError(400, 'Failed to create stripe account');
  }

  user.stripeAccountId = account.id;
  await user.save();

  const accountLink = await createAccountOnboardingLink(account.id);

  return {
    url: accountLink.url,
    message: 'Stripe onboarding link created successfully',
  };
};

const getStripeAccount = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (!user.stripeAccountId) {
    throw new AppError(400, 'User does not have a stripe account');
  }

  const connected = await stripe.accounts.retrieve(user.stripeAccountId);

  if (!connected.details_submitted) {
    const accountLink = await createAccountOnboardingLink(user.stripeAccountId);
    return {
      url: accountLink.url,
      message: 'Complete Stripe onboarding to open the dashboard',
    };
  }

  try {
    const login = await stripe.accounts.createLoginLink(user.stripeAccountId);
    if (!login) {
      throw new AppError(400, 'Failed to retrieve stripe account');
    }
    return login;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/onboarding|not completed/i.test(msg)) {
      const accountLink = await createAccountOnboardingLink(
        user.stripeAccountId,
      );
      return {
        url: accountLink.url,
        message: 'Complete Stripe onboarding to open the dashboard',
      };
    }
    throw err;
  }
};

const getRoleApprovalStatusForUser = (
  user: InstanceType<typeof User>,
  role: ReturnType<typeof normalizeAppRole>,
): string => {
  const map = user.roleStatus ?? {};
  if (role && map[role]) return String(map[role]);
  if (role === userRole['find care']) return USER_APPROVAL_STATUS.approved;
  return user.userStatus ?? USER_APPROVAL_STATUS.pending;
};

const switchRole = async (userId: string, targetRoleRaw: string) => {
  const targetRole = normalizeAppRole(targetRoleRaw);
  if (!targetRole || targetRole === userRole.admin) {
    throw new AppError(400, 'Invalid role');
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');

  ensureUserRoles(user);
  if (!user.roles?.includes(targetRole)) {
    throw new AppError(
      400,
      'This role is not registered for your account. Complete signup for that role first.',
    );
  }

  const currentRole = normalizeAppRole(user.role);
  if (currentRole) {
    saveTopLevelToRoleProfile(user, currentRole);
  }

  user.role = targetRole;
  applyRoleProfileToTopLevel(user, targetRole);
  user.userStatus = getRoleApprovalStatusForUser(
    user,
    targetRole,
  ) as NonNullable<IUser['userStatus']>;
  await user.save();

  assertLoginAllowedForRole(user, targetRole);

  const tokenPayload = {
    id: stringifyUserId(user._id),
    role: user.role,
    roles: user.roles ?? [user.role],
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName || '',
    gender: user.gender,
    subscription: user.isSubscription,
  };

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

  const myServicesPaidCategoryIds = await getMyServicesPaidCategoryIds(userId);

  return {
    accessToken,
    refreshToken,
    user: {
      ...serializeUserWithRoles(user),
      myServicesPaidCategoryIds,
    },
  };
};

const markOnboardingComplete = async (userId: string, roleRaw?: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');

  const role = normalizeAppRole(roleRaw || user.role);
  if (!role) throw new AppError(400, 'Invalid role');

  const profile = ensureRoleProfile(user, role);
  profile.onboardingCompleted = true;
  user.roleProfiles = {
    ...(user.roleProfiles ?? {}),
    [role]: profile,
  };

  if (user.role === role) {
    applyRoleProfileToTopLevel(user, role);
  }

  await user.save();
  return serializeUserWithRoles(user);
};

export const userService = {
  createUser,
  getAllUser,
  getUserById,
  updateUserById,
  deleteUserById,
  profile,
  updateMyProfile,
  createStripeAccount,
  getStripeAccount,
  getMyServicesPaidCategoryIds,
  uploadGalaryImages,
  certificationsUpload,
  switchRole,
  markOnboardingComplete,
};
