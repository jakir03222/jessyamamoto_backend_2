import catchAsync from '../../utils/catchAsycn';
import sendResponse from '../../utils/sendResponse';
import pick from '../../helper/pick';
import { userService } from './user.service';

const createUser = catchAsync(async (req, res) => {
  const result = await userService.createUser(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User created successfully',
    data: result,
  });
});

const getAllUser = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'firstName',
    'lastName',
    'bio',
    'phone',
    'status',
    'gender',
    'email',
    'role',
    'minHourRate',
    'maxHourRate',
  ]);
  const options = pick(req.query, ['page', 'limit', 'sortBy', 'sortOrder']);
  const result = await userService.getAllUser(filters, options);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getUserById = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    throw new Error('User ID is required');
  }
  const result = await userService.getUserById(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User fetched successfully',
    data: result,
  });
});

const updateUserById = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const formData = req.body.data ? JSON.parse(req.body.data) : req.body;

  const result = await userService.updateUserById(
    req.params.id!,
    formData,
    files,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

const deleteUserById = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    throw new Error('User ID is required');
  }
  const result = await userService.deleteUserById(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User deleted successfully',
    data: result,
  });
});

const profile = catchAsync(async (req, res) => {
  const result = await userService.profile(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User profile fetched successfully',
    data: result,
  });
});

const updateMyProfile = catchAsync(async (req, res) => {
  const uploaded = req.files as
    | {
        profileImage?: Express.Multer.File[];
        galary?: Express.Multer.File[];
        certifications?: Express.Multer.File[];
      }
    | undefined;
  const profileImage = uploaded?.profileImage?.[0];
  const galaryFiles = uploaded?.galary ?? [];
  const certificationFiles = uploaded?.certifications ?? [];
  const formData = req.body.data ? JSON.parse(req.body.data) : req.body;

  let result = await userService.updateMyProfile(
    req.user?.id,
    formData,
    profileImage,
    certificationFiles,
  );

  if (galaryFiles.length > 0) {
    result = await userService.uploadGalaryImages(
      req.user?.id!,
      formData,
      galaryFiles,
    );
  }
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

const createStripeAccount = catchAsync(async (req, res) => {
  console.log(req.user?.id);
  const result = await userService.createStripeAccount(req.user?.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

const getStripeAccount = catchAsync(async (req, res) => {
  const result = await userService.getStripeAccount(req.user?.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

const uploadGalaryImages = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  const result = await userService.uploadGalaryImages(
    req.user?.id,
    req.body,
    files,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Gallery updated successfully',
    data: result,
  });
});

const certificationsUpload = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  const result = await userService.certificationsUpload(
    req.user?.id,
    req.body,
    files,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Gallery updated successfully',
    data: result,
  });
});

const switchRole = catchAsync(async (req, res) => {
  const { role } = req.body;
  const result = await userService.switchRole(req.user?.id, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Role switched successfully',
    data: result,
  });
});

const completeOnboarding = catchAsync(async (req, res) => {
  const { role } = req.body;
  const result = await userService.markOnboardingComplete(req.user?.id, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Onboarding completed',
    data: result,
  });
});

export const userController = {
  createUser,
  getAllUser,
  getUserById,
  updateUserById,
  deleteUserById,
  profile,
  updateMyProfile,
  createStripeAccount,
  getStripeAccount,
  uploadGalaryImages,
  certificationsUpload,
  switchRole,
  completeOnboarding,
};
