import bcrypt from 'bcryptjs';
import AppError from '../../error/appError';
import { IUser } from './user.interface';
import { userRole } from './user.constant';
import {
  normalizeUserStatus,
  USER_APPROVAL_STATUS,
} from './user.status.util';

export type AppRole = 'find job' | 'find care' | 'admin';

export interface IRoleProfile {
  firstName?: string;
  lastName?: string;
  gender?: string;
  bio?: string;
  profileImage?: string;
  galary?: string[];
  language?: IUser['language'];
  professionalSkill?: string[];
  experiences?: string[];
  certifications?: string[];
  education?: string[];
  agegroup?: string[];
  canHelpWith?: string[];
  perferences?: string[];
  phone?: string;
  countery?: string;
  city?: string;
  location?: string;
  onboardingCompleted?: boolean;
}

const ROLE_PROFILE_FIELDS: (keyof IRoleProfile)[] = [
  'firstName',
  'lastName',
  'gender',
  'bio',
  'profileImage',
  'galary',
  'language',
  'professionalSkill',
  'experiences',
  'certifications',
  'education',
  'agegroup',
  'canHelpWith',
  'perferences',
  'phone',
  'countery',
  'city',
  'location',
  'onboardingCompleted',
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const normalizeAppRole = (role?: string | null): AppRole | null => {
  const normalized = (role || '').trim().toLowerCase();
  if (normalized === userRole['find job']) return userRole['find job'];
  if (normalized === userRole['find care']) return userRole['find care'];
  if (normalized === userRole.admin) return userRole.admin;
  return null;
};

export const ensureUserRoles = (user: IUser & { roles?: string[] }) => {
  const current = normalizeAppRole(user.role);
  const roles = Array.isArray(user.roles)
    ? user.roles
        .map((r) => normalizeAppRole(r))
        .filter((r): r is AppRole => r != null)
    : [];

  if (current && !roles.includes(current)) {
    roles.unshift(current);
  }

  if (roles.length === 0 && current) {
    roles.push(current);
  }

  user.roles = [...new Set(roles)];
  if (current) {
    user.role = current;
  } else if (user.roles[0]) {
    user.role = user.roles[0];
  }
};

export const getRoleProfilesMap = (
  user: IUser & { roleProfiles?: Record<string, IRoleProfile> },
): Record<string, IRoleProfile> => {
  const raw = asRecord(user.roleProfiles);
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, asRecord(value)]),
  ) as Record<string, IRoleProfile>;
};

export const getRoleStatusMap = (
  user: IUser & { roleStatus?: Record<string, string> },
): Record<string, string> => {
  const raw = asRecord(user.roleStatus);
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, String(value)]),
  );
};

export const buildRoleProfileFromUser = (
  user: IUser,
  _role: AppRole,
): IRoleProfile => ({
  firstName: user.firstName,
  lastName: user.lastName ?? '',
  gender: user.gender ?? '',
  bio: user.bio ?? '',
  profileImage: Array.isArray(user.profileImage)
    ? user.profileImage[0] ?? ''
    : user.profileImage ?? '',
  galary: user.galary ? [...user.galary] : [],
  language: user.language ? [...user.language] : [],
  professionalSkill: user.professionalSkill ? [...user.professionalSkill] : [],
  experiences: user.experiences ? [...user.experiences] : [],
  certifications: user.certifications ? [...user.certifications] : [],
  education: user.education ? [...user.education] : [],
  agegroup: user.agegroup ? [...user.agegroup] : [],
  canHelpWith: user.canHelpWith ? [...user.canHelpWith] : [],
  perferences: user.perferences ? [...user.perferences] : [],
  phone: user.phone ?? '',
  countery: user.countery ?? '',
  city: user.city ?? '',
  location: user.location ?? '',
  onboardingCompleted: false,
});

export const ensureRoleProfile = (
  user: IUser & { roleProfiles?: Record<string, IRoleProfile> },
  role: AppRole,
) => {
  ensureUserRoles(user);
  const profiles = getRoleProfilesMap(user);
  if (!profiles[role]) {
    profiles[role] = buildRoleProfileFromUser(user, role);
  }
  user.roleProfiles = profiles;
  return profiles[role]!;
};

export const saveTopLevelToRoleProfile = (
  user: IUser & { roleProfiles?: Record<string, IRoleProfile> },
  role: AppRole,
) => {
  const profiles = getRoleProfilesMap(user);
  profiles[role] = {
    ...(profiles[role] ?? {}),
    ...buildRoleProfileFromUser(user, role),
  };
  user.roleProfiles = profiles;
};

export const applyRoleProfileToTopLevel = (
  user: IUser & { roleProfiles?: Record<string, IRoleProfile> },
  role: AppRole,
) => {
  const profile = ensureRoleProfile(user, role);
  user.firstName = profile.firstName || user.firstName;
  user.lastName = profile.lastName || user.lastName || '';
  if (profile.gender) {
    user.gender = profile.gender as NonNullable<IUser['gender']>;
  }
  if (profile.bio != null) user.bio = profile.bio;
  if (profile.profileImage != null) user.profileImage = profile.profileImage;
  user.galary = profile.galary ? [...profile.galary] : [];
  user.language = profile.language ? [...profile.language] : [];
  user.professionalSkill = profile.professionalSkill
    ? [...profile.professionalSkill]
    : [];
  user.experiences = profile.experiences ? [...profile.experiences] : [];
  user.certifications = profile.certifications
    ? [...profile.certifications]
    : [];
  user.education = profile.education ? [...profile.education] : [];
  user.agegroup = profile.agegroup ? [...profile.agegroup] : [];
  user.canHelpWith = profile.canHelpWith ? [...profile.canHelpWith] : [];
  user.perferences = profile.perferences ? [...profile.perferences] : [];
  if (profile.phone != null) user.phone = profile.phone;
  if (profile.countery != null) user.countery = profile.countery;
  if (profile.city != null) user.city = profile.city;
  if (profile.location != null) user.location = profile.location;
};

export const mergeRegistrationPayloadIntoRoleProfile = (
  profile: IRoleProfile,
  payload: Record<string, unknown>,
) => {
  if (payload.firstName) profile.firstName = String(payload.firstName).trim();
  if (payload.lastName != null) {
    profile.lastName = String(payload.lastName).trim();
  }
  if (payload.gender) profile.gender = String(payload.gender).trim();
  if (payload.countery || payload.country) {
    profile.countery = String(payload.countery || payload.country).trim();
  }
  if (payload.city) profile.city = String(payload.city).trim();
  if (payload.location) profile.location = String(payload.location).trim();
};

export const getRoleApprovalStatus = (
  user: IUser & { roleStatus?: Record<string, string> },
  role: AppRole,
): string => {
  const map = getRoleStatusMap(user);
  if (map[role]) {
    return normalizeUserStatus(map[role]) === 'unknown'
      ? map[role]
      : normalizeUserStatus(map[role]);
  }

  if (role === userRole['find care']) {
    return USER_APPROVAL_STATUS.approved;
  }

  if (role === userRole['find job']) {
    const normalized = normalizeUserStatus(user.userStatus);
    if (normalized === 'unknown') {
      return USER_APPROVAL_STATUS.pending;
    }
    return normalized;
  }

  return USER_APPROVAL_STATUS.approved;
};

export const setRoleApprovalStatus = (
  user: IUser & { roleStatus?: Record<string, string> },
  role: AppRole,
  status: string,
) => {
  const map = getRoleStatusMap(user);
  map[role] = status;
  user.roleStatus = map;
  if (user.role === role) {
    user.userStatus = status as NonNullable<IUser['userStatus']>;
  }
};

export const assertLoginAllowedForRole = (
  user: IUser & { roleStatus?: Record<string, string> },
  role: AppRole,
): void => {
  if (role === userRole.admin) return;

  if (user.status !== 'active') {
    throw new AppError(
      403,
      'Your account is not active. Please contact admin.',
    );
  }

  const approval = getRoleApprovalStatus(user, role);

  if (approval === USER_APPROVAL_STATUS.approved) {
    return;
  }

  if (approval === USER_APPROVAL_STATUS.pending) {
    if (role === userRole['find job']) {
      return;
    }
    throw new AppError(403, 'Your account is awaiting admin approval.');
  }

  if (approval === USER_APPROVAL_STATUS.rejected) {
    throw new AppError(
      403,
      'Your account has been rejected. Please contact support.',
    );
  }

  throw new AppError(403, 'Your account is awaiting admin approval.');
};

export const assertRegistrationPayload = (payload: Record<string, unknown>) => {
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const email = String(payload.email || '').trim();
  const role = normalizeAppRole(String(payload.role || ''));

  if (!email) throw new AppError(400, 'Email is required');
  if (!firstName) throw new AppError(400, 'First name is required');
  if (!lastName) throw new AppError(400, 'Last name is required');
  if (!role || role === userRole.admin) {
    throw new AppError(400, 'A valid role is required');
  }

  return { firstName, lastName, email, role };
};

export const verifyExistingUserPassword = async (
  userDoc: IUser & { password?: string; id?: string; _id?: unknown },
  password?: string,
  loadPassword?: (userId: string) => Promise<string | null>,
) => {
  if (!password || !String(password).trim()) {
    throw new AppError(
      400,
      'Password is required to add a role to an existing account',
    );
  }

  let stored: string | undefined = userDoc.password;
  if (!stored && loadPassword) {
    const userId = String(userDoc.id ?? userDoc._id ?? '');
    stored = (await loadPassword(userId)) ?? undefined;
  }

  if (!stored) {
    throw new AppError(400, 'Unable to verify password for this account');
  }

  const matched = await bcrypt.compare(String(password), stored);
  if (!matched) throw new AppError(401, 'Password not matched');
};

export const addOrUpdateUserRole = async (
  user: IUser & {
    roles?: string[];
    roleProfiles?: Record<string, IRoleProfile>;
    roleStatus?: Record<string, string>;
    save: () => Promise<unknown>;
  },
  requestedRole: AppRole,
  payload: Record<string, unknown>,
  options?: { makeActive?: boolean },
) => {
  ensureUserRoles(user);
  ensureRoleProfile(user, normalizeAppRole(user.role)!);

  if (!user.roles!.includes(requestedRole)) {
    user.roles!.push(requestedRole);
    if (requestedRole === userRole['find job']) {
      setRoleApprovalStatus(user, requestedRole, USER_APPROVAL_STATUS.pending);
    } else {
      setRoleApprovalStatus(user, requestedRole, USER_APPROVAL_STATUS.approved);
    }
  }

  const profile = ensureRoleProfile(user, requestedRole);
  mergeRegistrationPayloadIntoRoleProfile(profile, payload);
  user.roleProfiles = getRoleProfilesMap(user);

  if (options?.makeActive !== false) {
    saveTopLevelToRoleProfile(user, normalizeAppRole(user.role)!);
    user.role = requestedRole;
    applyRoleProfileToTopLevel(user, requestedRole);
    user.userStatus = getRoleApprovalStatus(user, requestedRole) as NonNullable<
      IUser['userStatus']
    >;
  }

  await user.save();
};

export const pickRoleProfileUpdates = (
  payload: Partial<IUser>,
): Partial<IRoleProfile> => {
  const updates: Partial<IRoleProfile> = {};
  for (const field of ROLE_PROFILE_FIELDS) {
    if (payload[field as keyof IUser] !== undefined) {
      (updates as Record<string, unknown>)[field] = payload[
        field as keyof IUser
      ] as unknown;
    }
  }
  return updates;
};

export const serializeUserWithRoles = (
  user: IUser & {
    roles?: string[];
    roleProfiles?: Record<string, IRoleProfile>;
    roleStatus?: Record<string, string>;
    toObject?: () => IUser;
  },
) => {
  ensureUserRoles(user);
  const activeRole = normalizeAppRole(user.role);
  if (activeRole) {
    applyRoleProfileToTopLevel(user, activeRole);
  }

  const plain = user.toObject ? user.toObject() : { ...(user as object) };
  return {
    ...(plain as unknown as Record<string, unknown>),
    roles: user.roles ?? [user.role],
    roleStatus: getRoleStatusMap(user),
    activeRole: user.role,
  };
};
