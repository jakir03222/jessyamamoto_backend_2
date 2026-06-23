import pick from '../../helper/pick';
import catchAsync from '../../utils/catchAsycn';
import sendResponse from '../../utils/sendResponse';
import { adminService } from './admin.service';

const getPendingWorkers = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit', 'sortBy', 'sortOrder']);
  const result = await adminService.getPendingWorkers(options);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending workers fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const approveWorker = catchAsync(async (req, res) => {
  const result = await adminService.approveWorker(req.params.id!);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Worker approved successfully',
    data: result,
  });
});

const rejectWorker = catchAsync(async (req, res) => {
  const result = await adminService.rejectWorker(req.params.id!);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Worker rejected successfully',
    data: result,
  });
});

export const adminController = {
  getPendingWorkers,
  approveWorker,
  rejectWorker,
};
