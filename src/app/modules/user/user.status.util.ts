import AppError from '../../error/appError';

export const USER_APPROVAL_STATUS = {
  approved: 'approved',
  pending: 'pending',
  rejected: 'rejected',
} as const;

export type UserApprovalStatus =
  (typeof USER_APPROVAL_STATUS)[keyof typeof USER_APPROVAL_STATUS];

/** Legacy values stored in older documents. */
export const LEGACY_USER_APPROVAL_STATUS = {
  pending: 'panding',
  rejected: 'reject',
} as const;

export const PENDING_USER_STATUS_FILTER = {
  $in: [USER_APPROVAL_STATUS.pending, LEGACY_USER_APPROVAL_STATUS.pending],
};

export const REJECTED_USER_STATUS_FILTER = {
  $in: [USER_APPROVAL_STATUS.rejected, LEGACY_USER_APPROVAL_STATUS.rejected],
};

export const APPROVED_USER_STATUS_FILTER = {
  $in: [USER_APPROVAL_STATUS.approved],
};

export const normalizeUserStatus = (
  status?: string | null,
): UserApprovalStatus | 'unknown' => {
  const normalized = (status || '').trim().toLowerCase();

  if (normalized === USER_APPROVAL_STATUS.approved) {
    return USER_APPROVAL_STATUS.approved;
  }

  if (
    normalized === USER_APPROVAL_STATUS.pending ||
    normalized === LEGACY_USER_APPROVAL_STATUS.pending
  ) {
    return USER_APPROVAL_STATUS.pending;
  }

  if (
    normalized === USER_APPROVAL_STATUS.rejected ||
    normalized === LEGACY_USER_APPROVAL_STATUS.rejected
  ) {
    return USER_APPROVAL_STATUS.rejected;
  }

  return 'unknown';
};

export const assertLoginAllowed = (userStatus?: string | null): void => {
  const normalized = normalizeUserStatus(userStatus);

  if (normalized === USER_APPROVAL_STATUS.approved) {
    return;
  }

  if (normalized === USER_APPROVAL_STATUS.pending) {
    throw new AppError(403, 'Your account is awaiting admin approval.');
  }

  if (normalized === USER_APPROVAL_STATUS.rejected) {
    throw new AppError(
      403,
      'Your account has been rejected. Please contact support.',
    );
  }

  throw new AppError(403, 'Your account is awaiting admin approval.');
};

export const isApprovedUserStatus = (userStatus?: string | null): boolean =>
  normalizeUserStatus(userStatus) === USER_APPROVAL_STATUS.approved;
