import User from '../user/user.model';
import Category from '../category/category.model';
import Subscription from '../subscription/subscription.model';
import Payment from '../payment/payment.model';
import Service from '../service/service.model';
import AppError from '../../error/appError';
import Stripe from 'stripe';
import config from '../../config';
import mongoose from 'mongoose';
import pagination, { IOption } from '../../helper/pagenation';
import { APPROVED_USER_STATUS_FILTER } from '../user/user.status.util';
import { userRole } from '../user/user.constant';
import {
  addOrUpdateUserRole,
  applyRoleProfileToTopLevel,
  assertRegistrationPayload,
  ensureRoleProfile,
  ensureUserRoles,
  mergeRegistrationPayloadIntoRoleProfile,
  normalizeAppRole,
  verifyExistingUserPassword,
} from '../user/user.role.util';
import { authService } from '../auth/auth.service';
import {
  normalizeLocationFields,
  validateCityForCountry,
} from '../../helper/locationValidation';

const stripe = new Stripe(config.stripe.secretKey!);

const weekDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const getAvailableDays = (available?: string | string[]) => {
  if (!available) return null;

  const rawValue = Array.isArray(available) ? available[0] : available;
  if (!rawValue) return null;

  const value = rawValue
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');

  const todayIndex = new Date().getDay();

  if (value === 'today') {
    return [weekDays[todayIndex]!];
  }

  if (value === 'week' || value === 'thisweek') {
    return weekDays.slice(todayIndex);
  }

  throw new AppError(400, 'available must be today, week, or thisWeek');
};

const normalizeCategoryIds = (payload: Record<string, unknown>): string[] => {
  const fromArray = payload.categoryIds;
  if (Array.isArray(fromArray)) {
    const ids = fromArray
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0);
    if (ids.length > 0) return [...new Set(ids)];
  }

  const single = String(payload.categoryId || '').trim();
  return single ? [single] : [];
};

const registerServiceAndSubscription = async (
  payload: any,
  userId?: string,
) => {
  const registration = assertRegistrationPayload(payload);
  const requestedRole = registration.role;
  const serviceFirstName = registration.firstName;
  const serviceLastName = registration.lastName;

  /* ================= GET OR CREATE USER ================= */
  let user = null;

  if (userId) {
    user = await User.findById(userId);
    if (!user) throw new AppError(404, 'User not found');
    await addOrUpdateUserRole(user, requestedRole, payload, {
      makeActive: true,
    });
  } else {
    user = await User.findOne({ email: registration.email.toLowerCase() });
    if (user) {
      await verifyExistingUserPassword(
        user,
        payload.password,
        async (id) => {
          const withPassword = await User.findById(id).select('+password');
          return withPassword?.password ?? null;
        },
      );
      await addOrUpdateUserRole(user, requestedRole, payload, {
        makeActive: true,
      });
    } else {
      if (!payload.password || !String(payload.password).trim()) {
        throw new AppError(400, 'Password is required');
      }

      const roleProfile = {
        firstName: serviceFirstName,
        lastName: serviceLastName,
        gender: payload.gender ? String(payload.gender).trim() : '',
        countery: payload.countery || payload.country || '',
        city: payload.city || '',
        location: payload.location || '',
      };

      user = await User.create({
        email: registration.email.toLowerCase(),
        password: payload.password,
        firstName: serviceFirstName,
        lastName: serviceLastName,
        role: requestedRole,
        roles: [requestedRole],
        roleProfiles: {
          [requestedRole]: roleProfile,
        },
        gender: payload.gender ? String(payload.gender).trim() : '',
        countery: payload.countery || payload.country || '',
        city: payload.city || '',
        location: payload.location || '',
        NIDNumber: payload.NIDNumber || '',
      });
      ensureUserRoles(user);
      ensureRoleProfile(user, requestedRole);
    }
  }

  ensureUserRoles(user);
  applyRoleProfileToTopLevel(user, requestedRole);
  const serviceRole = requestedRole;

  const { country, city, location } = normalizeLocationFields(payload);
  if (country) {
    await validateCityForCountry(country, city);
  }

  payload.countery = country;
  payload.country = country;
  payload.city = city;
  payload.location = location;

  const activeProfile = ensureRoleProfile(user, requestedRole);
  mergeRegistrationPayloadIntoRoleProfile(activeProfile, payload);
  user.countery = country;
  user.city = city;
  user.location = location;
  user.roleProfiles = {
    ...(user.roleProfiles ?? {}),
    [requestedRole]: activeProfile,
  };
  await user.save();

  const categoryIds = normalizeCategoryIds(payload);
  if (categoryIds.length === 0) {
    throw new AppError(400, 'categoryId is required');
  }
  for (const categoryId of categoryIds) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new AppError(400, 'Invalid categoryId');
    }
  }

  /* ================= EACH CATEGORY = ITS OWN STRIPE PAYMENT ================= */
  if (categoryIds.length > 1 && payload.subscriptionId) {
    throw new AppError(
      400,
      'Multiple categories require separate registrations when using a paid plan',
    );
  }

  const categoryObjectId = new mongoose.Types.ObjectId(categoryIds[0]!);

  const effectiveSubscriptionId =
    payload.subscriptionId != null &&
    String(payload.subscriptionId).trim() !== ''
      ? String(payload.subscriptionId).trim()
      : '';

  /** Account + service without paid subscription (no Stripe). */
  if (!effectiveSubscriptionId) {
    const gender =
      (payload.gender && String(payload.gender).trim()) ||
      ((user as { gender?: string }).gender &&
        String((user as { gender?: string }).gender).trim()) ||
      '';
    if (!gender) {
      throw new AppError(400, 'gender is required');
    }

    const loc = location || city || country || '';

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    const createdServices: InstanceType<typeof Service>[] = [];
    try {
      for (const categoryId of categoryIds) {
        const categoryOid = new mongoose.Types.ObjectId(categoryId);
        const category = await Category.findById(categoryOid).session(dbSession);
        if (!category) throw new AppError(404, 'Category not found');

        const existingInCategory = await Service.findOne({
          userId: user._id,
          categoryId: categoryOid,
        }).session(dbSession);
        if (existingInCategory) {
          throw new AppError(
            400,
            'You already have a service in this category. Each additional category requires a separate payment.',
          );
        }

        const [created] = await Service.create(
          [
            {
              userId: user._id,
              categoryId: categoryOid,
              location: loc,
              zip: payload.zip ? String(payload.zip) : undefined,
              email: user.email,
              firstName: serviceFirstName,
              lastName: serviceLastName,
              gender,
              hourRate:
                serviceRole === 'find job' && payload.hourRate != null
                  ? Number(payload.hourRate)
                  : undefined,
              days: payload.days,
            },
          ],
          { session: dbSession },
        );
        createdServices.push(created!);

        await User.findByIdAndUpdate(
          user._id,
          {
            $addToSet: {
              category: categoryOid,
              service: created!._id,
            },
            ...(loc ? { location: loc, countery: country, city } : {}),
          },
          { session: dbSession },
        );

        await Category.findByIdAndUpdate(
          categoryOid,
          serviceRole === 'find care'
            ? { $addToSet: { findCareUser: user._id } }
            : { $addToSet: { findJobUser: user._id } },
          { session: dbSession },
        );
      }

      await dbSession.commitTransaction();
    } catch (e) {
      await dbSession.abortTransaction();
      throw e;
    } finally {
      dbSession.endSession();
    }

    const freshUser = await User.findById(user._id);
    if (!freshUser) throw new AppError(404, 'User not found');
    applyRoleProfileToTopLevel(freshUser, requestedRole);
    const auth = await authService.buildAuthResponse(freshUser);

    return {
      service: createdServices.length === 1 ? createdServices[0] : createdServices,
      services: createdServices,
      checkoutUrl: null,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    };
  }

  const subscriptionDoc = await Subscription.findById(effectiveSubscriptionId);
  if (!subscriptionDoc) throw new AppError(404, 'Subscription not found');

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: subscriptionDoc.price * 100,
          product_data: {
            name: subscriptionDoc.title,
            description: subscriptionDoc.description,
          },
        },
        quantity: 1,
      },
    ],
    success_url: config.stripeCheckoutUrls.successUrl,
    cancel_url: config.stripeCheckoutUrls.cancelUrl,
    metadata: {
      userId: user._id.toString(),
      subscriptionId: subscriptionDoc._id.toString(),
      paymentType: 'subscription',
    },
  });

  await Payment.create({
    user: user._id,
    subscription: subscriptionDoc._id,
    category: categoryObjectId,
    amount: subscriptionDoc.price,
    currency: 'usd',
    stripeSessionId: checkoutSession.id,
    status: 'pending',
    paymentType: 'subscription',
    userType: user.role === 'find job' ? 'findJob' : 'findCare',
    pendingServiceRegistration: {
      categoryId: payload.categoryId,
      location: payload.location || payload.city || '',
      gender: payload.gender,
      days: payload.days,
      hourRate:
        user.role === 'find job' && payload.hourRate != null
          ? Number(payload.hourRate)
          : undefined,
    },
  });

  return {
    service: null,
    checkoutUrl: checkoutSession.url,
  };
};

/** Run after Stripe checkout.session.completed for subscription payments. */
const completePendingServiceRegistration = async (stripeSessionId: string) => {
  const payment = await Payment.findOne({ stripeSessionId });
  if (!payment?.pendingServiceRegistration) return;

  const pending = payment.pendingServiceRegistration;
  const regUser = await User.findById(payment.user);
  if (!regUser) {
    console.warn('⚠️ Pending service: user not found', payment.user);
    return;
  }

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const categoryOk = await Category.findById(pending.categoryId).session(
      dbSession,
    );
    if (!categoryOk) {
      throw new AppError(404, 'Category not found for pending registration');
    }

    const existing = await Service.findOne({
      userId: regUser._id,
      categoryId: pending.categoryId,
    }).session(dbSession);

    if (existing) {
      await Payment.findByIdAndUpdate(
        payment._id,
        {
          $set: { service: existing._id },
          $unset: { pendingServiceRegistration: 1 },
        },
        { session: dbSession },
      );
      await dbSession.commitTransaction();
      return;
    }

    const [created] = await Service.create(
      [
        {
          userId: regUser._id,
          categoryId: pending.categoryId,
          location: pending.location || '',
          email: regUser.email,
          firstName: regUser.firstName,
          lastName: regUser.lastName,
          gender: pending.gender,
          hourRate:
            regUser.role === 'find job' && pending.hourRate != null
              ? pending.hourRate
              : undefined,
          days: pending.days,
        },
      ],
      { session: dbSession },
    );

    await User.findByIdAndUpdate(
      regUser._id,
      {
        $addToSet: {
          category: pending.categoryId,
          service: created!._id,
        },
        ...(pending.location && { location: pending.location }),
      },
      { session: dbSession },
    );

    await Category.findByIdAndUpdate(
      pending.categoryId,
      regUser.role === 'find care'
        ? { $addToSet: { findCareUser: regUser._id } }
        : { $addToSet: { findJobUser: regUser._id } },
      { session: dbSession },
    );

    await Payment.findByIdAndUpdate(
      payment._id,
      {
        $set: { service: created!._id },
        $unset: { pendingServiceRegistration: 1 },
      },
      { session: dbSession },
    );

    await dbSession.commitTransaction();
  } catch (e) {
    await dbSession.abortTransaction();
    throw e;
  } finally {
    dbSession.endSession();
  }
};

// const serviceBaseUser = async (
//   categoryId: string,
//   params: any,
//   options: IOption,
// ) => {
//   const { searchTerm, minHourRate, maxHourRate, ...filters } = params;

//   const { page, limit, skip, sortBy, sortOrder } = pagination(options);

//   // ✅ Check category
//   const category = await Category.findById(categoryId);
//   if (!category) throw new AppError(404, 'Category not found');

//   // ================= MATCH =================
//   const match: any = {
//     categoryId: new mongoose.Types.ObjectId(categoryId),
//     'user.role': 'find job',
//     'user.status': 'active',
//   };

//   // ================= SEARCH =================
//   if (searchTerm) {
//     match.$or = [
//       { 'user.firstName': { $regex: searchTerm, $options: 'i' } },
//       { 'user.lastName': { $regex: searchTerm, $options: 'i' } },
//       { 'user.email': { $regex: searchTerm, $options: 'i' } },
//       { 'user.location': { $regex: searchTerm, $options: 'i' } },
//       { 'user.bio': { $regex: searchTerm, $options: 'i' } },
//     ];
//   }

//   // ================= DYNAMIC FILTER =================
//   for (const [key, value] of Object.entries(filters)) {
//     if (!value) continue;

//     // Hour rate handled separately
//     if (key === 'minHourRate' || key === 'maxHourRate') continue;

//     // location: match Service.location OR user.location (partial match)
//     if (key === 'location') {
//       const locStr = String(value).trim();
//       if (locStr) {
//         match.$and = match.$and || [];
//         match.$and.push({
//           $or: [
//             { location: { $regex: locStr, $options: 'i' } },
//             { 'user.location': { $regex: locStr, $options: 'i' } },
//           ],
//         });
//       }
//       continue;
//     }

//     // Array fields (multi-select)
//     const arrayFields = [
//       'language',
//       'agegroup',
//       'education',
//       'canHelpWith',
//       'professionalSkill',
//       'perferences',
//     ];

//     if (arrayFields.includes(key)) {
//       match[`user.${key}`] = { $in: Array.isArray(value) ? value : [value] };
//     } else {
//       match[`user.${key}`] = value;
//     }
//   }

//   // ================= HOUR RATE RANGE =================
//   if (minHourRate || maxHourRate) {
//     match.hourRate = {};
//     if (minHourRate) match.hourRate.$gte = Number(minHourRate);
//     if (maxHourRate) match.hourRate.$lte = Number(maxHourRate);
//   }

//   // ================= PIPELINE =================
//   const pipeline: mongoose.PipelineStage[] = [
//     {
//       $lookup: {
//         from: 'users',
//         localField: 'userId',
//         foreignField: '_id',
//         as: 'user',
//       },
//     },
//     { $unwind: '$user' },

//     { $match: match },

//     {
//       $sort: {
//         [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1,
//       },
//     },

//     { $skip: skip },
//     { $limit: limit },

//     {
//       $project: {
//         zip: 1,
//         location: 1,
//         hourRate: 1,
//         gender: 1,
//         days: 1,
//         status: 1,
//         createdAt: 1,
//         user: {
//           _id: 1,
//           firstName: 1,
//           lastName: 1,
//           email: 1,
//           role: 1,
//           profileImage: 1,
//           bio: 1,
//           phone: 1,
//           gender: 1,
//           experienceLevel: 1,
//           location: 1,
//           language: 1,
//           agegroup: 1,
//           education: 1,
//           canHelpWith: 1,
//           professionalSkill: 1,
//           perferences: 1,
//         },
//       },
//     },
//   ];

//   const data = await Service.aggregate(pipeline);

//   // ================= TOTAL COUNT =================
//   const countPipeline = [
//     ...pipeline.filter(
//       (stage) =>
//         !('$skip' in stage) && !('$limit' in stage) && !('$sort' in stage),
//     ),
//     { $count: 'total' },
//   ];

//   const totalResult = await Service.aggregate(countPipeline);
//   const total = totalResult[0]?.total || 0;

//   return {
//     meta: { total, page, limit },
//     data,
//   };
// };

//==============================update code ===========================

const serviceBaseUser = async (
  categoryId: string,
  params: any,
  options: IOption,
) => {
  const { searchTerm, minHourRate, maxHourRate, role, available, ...filters } =
    params;
  const { page, limit, skip, sortBy, sortOrder } = pagination(options);

  // ✅ Category check
  const category = await Category.findById(categoryId);
  if (!category) throw new AppError(404, 'Category not found');

  // ✅ Role validation
  if (!role) {
    throw new AppError(400, 'Role is required (find job | find care)');
  }

  // ================= MATCH =================
  const match: any = {
    categoryId: new mongoose.Types.ObjectId(categoryId),
    'user.role': role,
    'user.status': 'active',
    status: 'pending',
  };

  if (role === 'find job') {
    match['user.userStatus'] = APPROVED_USER_STATUS_FILTER;
  }

  const availableDays = getAvailableDays(available);
  if (availableDays) {
    match.days = {
      $elemMatch: {
        day: { $in: availableDays.map((day) => new RegExp(`^${day}$`, 'i')) },
      },
    };
  }

  // ================= SEARCH =================
  if (searchTerm) {
    match.$or = [
      { 'user.firstName': { $regex: searchTerm, $options: 'i' } },
      { 'user.lastName': { $regex: searchTerm, $options: 'i' } },
      { 'user.email': { $regex: searchTerm, $options: 'i' } },
      { 'user.location': { $regex: searchTerm, $options: 'i' } },
      { 'user.bio': { $regex: searchTerm, $options: 'i' } },
    ];
  }

  // ================= DYNAMIC FILTER =================
  const arrayFields = [
    'language',
    'agegroup',
    'education',
    'canHelpWith',
    'professionalSkill',
    'perferences',
  ];

  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    if (key === 'minHourRate' || key === 'maxHourRate') return;

    // 🔹 location filter (service OR user)
    if (key === 'location') {
      const locStr = String(value).trim();
      if (locStr) {
        match.$and = match.$and || [];
        match.$and.push({
          $or: [
            { location: { $regex: locStr, $options: 'i' } },
            { 'user.location': { $regex: locStr, $options: 'i' } },
          ],
        });
      }
      return;
    }

    // 🔹 array filters
    if (arrayFields.includes(key)) {
      match[`user.${key}`] = {
        $in: Array.isArray(value) ? value : [value],
      };
    } else {
      match[`user.${key}`] = value;
    }
  });

  // ================= HOUR RATE =================
  if (minHourRate || maxHourRate) {
    match.hourRate = {};
    if (minHourRate) match.hourRate.$gte = Number(minHourRate);
    if (maxHourRate) match.hourRate.$lte = Number(maxHourRate);
  }

  // ================= BASE PIPELINE =================
  const basePipeline: mongoose.PipelineStage[] = [
    // 🔹 join user
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // 🔹 join category (✅ NEW)
    {
      $lookup: {
        from: 'categories', // ⚠️ ensure your collection name
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },

    // 🔹 match
    { $match: match },
  ];

  // ================= DATA PIPELINE =================
  const dataPipeline: mongoose.PipelineStage[] = [
    ...basePipeline,

    // 🔹 join reviews
    {
      $lookup: {
        from: 'reviews',
        localField: 'user._id',
        foreignField: 'jobUserId',
        as: 'reviews',
      },
    },

    // 🔹 rating calculation
    {
      $addFields: {
        averageRating: {
          $cond: [
            { $gt: [{ $size: '$reviews' }, 0] },
            { $avg: '$reviews.ratting' },
            0,
          ],
        },
        totalRatings: { $size: '$reviews' },
      },
    },

    // 🔹 sorting
    {
      $sort: {
        [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1,
      },
    },

    { $skip: skip },
    { $limit: limit },

    // 🔹 projection
    {
      $project: {
        location: 1,
        hourRate: 1,
        gender: 1,
        days: 1,
        status: 1,
        createdAt: 1,
        averageRating: { $round: ['$averageRating', 1] },
        totalRatings: 1,

        // ✅ category populated
        category: {
          _id: '$category._id',
          name: '$category.name',
          description: '$category.description',
          banner: '$category.banner',
          logo: '$category.image',
        },

        user: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          role: 1,
          profileImage: 1,
          bio: 1,
          phone: 1,
          gender: 1,
          experienceLevel: 1,
          location: 1,
          language: 1,
          agegroup: 1,
          education: 1,
          canHelpWith: 1,
          professionalSkill: 1,
          perferences: 1,
        },
      },
    },
  ];

  const data = await Service.aggregate(dataPipeline);

  // ================= COUNT =================
  const totalResult = await Service.aggregate([
    ...basePipeline,
    { $count: 'total' },
  ]);

  const total = totalResult[0]?.total || 0;

  return {
    meta: { total, page, limit },
    data,
  };
};

/* ------------------- SINGLE USER SERVICE ------------------- */

const serviceUserBaseUser = async (
  userId: string,
  categoryId: string,
  params: any,
  options: IOption,
) => {
  const { searchTerm, minHourRate, maxHourRate, available, ...filters } =
    params;
  const { page, limit, skip, sortBy, sortOrder } = pagination(options);

  // Logged-in user
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User is not found');

  // Category check
  const category = await Category.findById(categoryId);
  if (!category) throw new AppError(404, 'Category not found');

  // Opposite role
  let targetRole: string;
  if (user.role === 'find job') targetRole = 'find care';
  else if (user.role === 'find care') targetRole = 'find job';
  else throw new AppError(400, 'Invalid user role');

  // ================= MATCH =================
  const match: any = {
    categoryId: new mongoose.Types.ObjectId(categoryId),
    'user.role': targetRole,
    'user.status': 'active',
    status: 'pending', // only available services
  };

  if (targetRole === 'find job') {
    match['user.userStatus'] = APPROVED_USER_STATUS_FILTER;
  }

  const availableDays = getAvailableDays(available);
  if (availableDays) {
    match.days = {
      $elemMatch: {
        day: { $in: availableDays.map((day) => new RegExp(`^${day}$`, 'i')) },
      },
    };
  }

  // ================= SEARCH =================
  if (searchTerm) {
    match.$or = [
      { 'user.firstName': { $regex: searchTerm, $options: 'i' } },
      { 'user.lastName': { $regex: searchTerm, $options: 'i' } },
      { 'user.email': { $regex: searchTerm, $options: 'i' } },
      { 'user.location': { $regex: searchTerm, $options: 'i' } },
      { 'user.bio': { $regex: searchTerm, $options: 'i' } },
    ];
  }

  // ================= DYNAMIC FILTER =================
  const arrayFields = [
    'language',
    'agegroup',
    'education',
    'canHelpWith',
    'professionalSkill',
    'perferences',
  ];

  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;

    // skip hourRate (handled later)
    if (key === 'minHourRate' || key === 'maxHourRate') return;

    // location: match Service.location OR user.location (partial match)
    if (key === 'location') {
      const locStr = String(value).trim();
      if (locStr) {
        match.$and = match.$and || [];
        match.$and.push({
          $or: [
            { location: { $regex: locStr, $options: 'i' } },
            { 'user.location': { $regex: locStr, $options: 'i' } },
          ],
        });
      }
      return;
    }

    // array filter
    if (arrayFields.includes(key)) {
      match[`user.${key}`] = {
        $in: Array.isArray(value) ? value : [value],
      };
    } else {
      match[`user.${key}`] = value;
    }
  });

  // ================= HOUR RATE =================
  if (minHourRate || maxHourRate) {
    match.hourRate = {};
    if (minHourRate) match.hourRate.$gte = Number(minHourRate);
    if (maxHourRate) match.hourRate.$lte = Number(maxHourRate);
  }

  // ================= PIPELINE =================
  const basePipeline: mongoose.PipelineStage[] = [
    // join user
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: match },
  ];

  const dataPipeline: mongoose.PipelineStage[] = [
    ...basePipeline,

    // join reviews
    {
      $lookup: {
        from: 'reviews',
        localField: 'user._id',
        foreignField: 'jobUserId',
        as: 'reviews',
      },
    },

    // calculate avg + total rating
    {
      $addFields: {
        averageRating: {
          $cond: [
            { $gt: [{ $size: '$reviews' }, 0] },
            { $avg: '$reviews.ratting' },
            0,
          ],
        },
        totalRatings: { $size: '$reviews' },
      },
    },

    // sorting
    {
      $sort: {
        [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1,
      },
    },
    { $skip: skip },
    { $limit: limit },

    // final projection
    {
      $project: {
        location: 1,
        hourRate: 1,
        gender: 1,
        days: 1,
        status: 1,
        createdAt: 1,
        averageRating: { $round: ['$averageRating', 1] },
        totalRatings: 1,
        user: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          role: 1,
          profileImage: 1,
          bio: 1,
          phone: 1,
          gender: 1,
          experienceLevel: 1,
          location: 1,
          language: 1,
          agegroup: 1,
          education: 1,
          canHelpWith: 1,
          professionalSkill: 1,
          perferences: 1,
        },
      },
    },
  ];

  const data = await Service.aggregate(dataPipeline);

  // ================= COUNT =================
  const totalResult = await Service.aggregate([
    ...basePipeline,
    { $count: 'total' },
  ]);
  const total = totalResult[0]?.total || 0;

  return {
    meta: { total, page, limit },
    data,
  };
};

const singleUserService = async (userId: string) => {
  const result = await Service.findById(userId)
    .populate({
      path: 'userId',
      select: '-password -otp -otpExpiry',
      populate: {
        path: 'reviewRatting',
        populate: {
          path: 'userId',
          select: 'firstName lastName profileImage service',
        },
      },
    })
    .populate('categoryId')
    .lean();
  if (!result) throw new AppError(404, 'Service not found');
  return result;
};

const deleteService = async (userId: string) => {
  const result = await Service.findByIdAndDelete(userId);
  if (!result) throw new AppError(404, 'Service not found');
  return result;
};

const getAllServiceLocations = async (query: any, userId?: string) => {
  const { searchTerm, limit, categoryId } = query;

  const match: any = {};
  let user: any = null;

  if (userId) {
    user = await User.findById(userId).select('role category status');
  }

  if (user?.role === 'find job') {
    match['user.role'] = 'find care';
    match['user.status'] = 'active';
    match.status = 'pending';
  } else if (user?.role === 'find care') {
    match['user.role'] = 'find job';
    match['user.status'] = 'active';
    match['user.userStatus'] = APPROVED_USER_STATUS_FILTER;
    match.status = 'pending';
  }

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    match.categoryId = new mongoose.Types.ObjectId(categoryId);
  } else if (user?.category?.length) {
    match.categoryId = { $in: user.category };
  }

  if (searchTerm) {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [
        {
          location: {
            $exists: true,
            $nin: [null, ''],
            $regex: searchTerm,
            $options: 'i',
          },
        },
        {
          'user.location': {
            $exists: true,
            $nin: [null, ''],
            $regex: searchTerm,
            $options: 'i',
          },
        },
      ],
    });
  } else {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [
        {
          location: {
            $exists: true,
            $nin: [null, ''],
          },
        },
        {
          'user.location': {
            $exists: true,
            $nin: [null, ''],
          },
        },
      ],
    });
  }

  const pipeline: any[] = [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: match },
    {
      $addFields: {
        resolvedLocation: { $ifNull: ['$location', '$user.location'] },
        resolvedZip: { $ifNull: ['$zip', '$user.zip'] },
        resolvedLat: { $ifNull: ['$lat', '$user.lat'] },
        resolvedLng: { $ifNull: ['$lng', '$user.lng'] },
      },
    },
    {
      $group: {
        _id: '$resolvedLocation',
        location: { $first: '$resolvedLocation' },
        zip: { $first: '$resolvedZip' },
        lat: { $first: '$resolvedLat' },
        lng: { $first: '$resolvedLng' },
        totalServices: { $sum: 1 },
      },
    },
    { $sort: { location: 1 } },
  ];

  if (limit) {
    pipeline.push({ $limit: Number(limit) });
  }

  const data = await Service.aggregate(pipeline);

  return data;
};

export const serviceService = {
  registerServiceAndSubscription,
  completePendingServiceRegistration,
  serviceBaseUser,
  serviceUserBaseUser,
  singleUserService,
  deleteService,
  getAllServiceLocations,
};
