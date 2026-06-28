import mongoose from 'mongoose';
import AppError from '../../error/appError';
import pagination, { IOption } from '../../helper/pagenation';
import User from '../user/user.model';
import { userRole } from '../user/user.constant';
import {
  normalizeUserStatus,
  PENDING_USER_STATUS_FILTER,
  USER_APPROVAL_STATUS,
} from '../user/user.status.util';
import { setRoleApprovalStatus } from '../user/user.role.util';

const workerSelectFields =
  'firstName lastName email profileImage bio phone gender countery city location experienceLevel status userStatus verified createdAt updatedAt category service';

const getPendingWorkers = async (options: IOption) => {
  const { page, limit, skip, sortBy, sortOrder } = pagination(options);

  const filter = {
    role: userRole['find job'],
    userStatus: PENDING_USER_STATUS_FILTER,
  };

  const [workers, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .populate('category', 'name')
      .populate('service', 'name categoryId location hourRate status')
      .select(workerSelectFields)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    data: workers,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const findWorkerById = async (workerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(workerId)) {
    throw new AppError(400, 'Invalid worker id');
  }

  const worker = await User.findOne({
    _id: workerId,
    role: userRole['find job'],
  }).select(workerSelectFields);

  if (!worker) {
    throw new AppError(404, 'Worker not found');
  }

  return worker;
};

const approveWorker = async (workerId: string) => {
  const worker = await findWorkerById(workerId);
  const currentStatus = normalizeUserStatus(worker.userStatus);

  if (currentStatus === USER_APPROVAL_STATUS.approved) {
    throw new AppError(400, 'Worker is already approved');
  }

  worker.userStatus = USER_APPROVAL_STATUS.approved;
  worker.status = 'active';
  setRoleApprovalStatus(worker, userRole['find job'], USER_APPROVAL_STATUS.approved);
  await worker.save();

  const { password, otp, otpExpiry, ...workerWithoutSensitiveFields } =
    worker.toObject();

  return workerWithoutSensitiveFields;
};

const rejectWorker = async (workerId: string) => {
  const worker = await findWorkerById(workerId);
  const currentStatus = normalizeUserStatus(worker.userStatus);

  if (currentStatus === USER_APPROVAL_STATUS.rejected) {
    throw new AppError(400, 'Worker is already rejected');
  }

  worker.userStatus = USER_APPROVAL_STATUS.rejected;
  worker.status = 'inactive';
  setRoleApprovalStatus(worker, userRole['find job'], USER_APPROVAL_STATUS.rejected);
  await worker.save();

  const { password, otp, otpExpiry, ...workerWithoutSensitiveFields } =
    worker.toObject();

  return workerWithoutSensitiveFields;
};

export const adminService = {
  getPendingWorkers,
  approveWorker,
  rejectWorker,
};
