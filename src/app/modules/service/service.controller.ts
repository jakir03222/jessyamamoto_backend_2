import { Request, Response } from 'express';
import { serviceService } from './service.service';
import pick from '../../helper/pick';
import catchAsync from '../../utils/catchAsycn';
import AppError from '../../error/appError';
import sendResponse from '../../utils/sendResponse';

const registerServiceController = async (req: Request, res: Response) => {
  const userId = req.user?.id || null;
  console.log(userId);
  const result = await serviceService.registerServiceAndSubscription(
    req.body,
    userId,
  );

  res.status(200).json({
    success: true,
    message: 'Service registered successfully',
    data: result,
  });
};

const serviceBaseUserController = async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const filters = pick(req.query, [
    'searchTerm',
    'role', // ✅ ADD THIS
    'firstName',
    'NIDNumber',
    'countery',
    'city',
    'lastName',
    'email',
    'gender',
    'experienceLevel',
    'location',
    'language',
    'agegroup',
    'education',
    'canHelpWith',
    'professionalSkill',
    'perferences',
    'minHourRate',
    'maxHourRate',
    'available',
  ]);
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const result = await serviceService.serviceBaseUser(
    categoryId!,
    filters,
    options,
  );

  res.status(200).json({
    success: true,
    message: 'Service base user fetched successfully',
    meta: result.meta,
    data: result.data,
  });
};

const serviceUserBaseUserController = catchAsync(async (req, res) => {
  const { categoryId } = req.params;

  const filters = pick(req.query, [
    'searchTerm',
    'firstName',
    'NIDNumber',
    'countery',
    'city',
    'lastName',
    'email',
    'gender',
    'experienceLevel',
    'location',
    'language',
    'agegroup',
    'education',
    'canHelpWith',
    'professionalSkill',
    'perferences',
    'minHourRate',
    'maxHourRate',
    'available',
  ]);

  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);

  // Guest browse: parents can view caregivers before creating an account.
  if (!req.user?.id) {
    const result = await serviceService.serviceBaseUser(
      categoryId!,
      { ...filters, role: 'find job' },
      options,
    );

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Service base user fetched successfully',
      meta: result.meta,
      data: result.data,
    });
  }

  const userId = req.user.id;

  const result = await serviceService.serviceUserBaseUser(
    userId,
    categoryId!,
    filters,
    options,
  );

  res.status(200).json({
    success: true,
    message: 'Service base user fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const singleUserService = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const result = await serviceService.singleUserService(userId!);
  res.status(200).json({
    success: true,
    message: 'Service fetched successfully',
    data: result,
  });
};

const deleteService = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const result = await serviceService.deleteService(userId!);
  res.status(200).json({
    success: true,
    message: 'Service deleted successfully',
    data: result,
  });
};

const getAllServiceLocations = catchAsync(
  async (req: Request, res: Response) => {
    const result = await serviceService.getAllServiceLocations(
      req.query,
      req.user?.id,
    );

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Service locations fetched successfully',
      data: result,
    });
  },
);

export const serviceController = {
  registerServiceController,
  serviceBaseUserController,
  serviceUserBaseUserController,
  singleUserService,
  deleteService,
  getAllServiceLocations,
};
