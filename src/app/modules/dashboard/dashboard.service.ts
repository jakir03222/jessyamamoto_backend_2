import Booking from '../booking/booking.model';
import Payment from '../payment/payment.model';
import User from '../user/user.model';
import { userRole } from '../user/user.constant';
import { PENDING_USER_STATUS_FILTER } from '../user/user.status.util';

// ─── Overview Stats ───────────────────────────────────────────────────────────
const dashboardOverview = async () => {
  const totalUserFindcare = await User.countDocuments({ role: 'find care' });
  const totalServiceProviderFindjob = await User.countDocuments({
    role: 'find job',
  });
  const totalBooking = await Booking.countDocuments();

  const totalEarningResult = await Payment.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalEarning: { $sum: '$amount' } } },
  ]);
  const totalEarning =
    totalEarningResult.length > 0 ? totalEarningResult[0].totalEarning : 0;

  return {
    totalUserFindcare,
    totalServiceProviderFindjob,
    totalBooking,
    totalEarning,
  };
};

// ─── Earnings Overview Chart (Monthly / Weekly) ───────────────────────────────
const earningsOverview = async (filter: 'monthly' | 'weekly' = 'monthly') => {
  const now = new Date();
  let groupStage: any;
  let startDate: Date;

  if (filter === 'weekly') {
    // Last 7 days, grouped by day
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
    groupStage = {
      _id: {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      },
      totalAmount: { $sum: '$amount' },
      adminFee: { $sum: '$adminFree' },
      providerPayout: { $sum: '$serviceProviderFree' },
    };
  } else {
    // Last 12 months, grouped by month
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 11);
    startDate.setDate(1);
    groupStage = {
      _id: {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      },
      totalAmount: { $sum: '$amount' },
      adminFee: { $sum: '$adminFree' },
      providerPayout: { $sum: '$serviceProviderFree' },
    };
  }

  const earnings = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: startDate },
      },
    },
    { $group: groupStage },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  return earnings;
};

// ─── Booking Distribution by Category ────────────────────────────────────────
const bookingDistribution = async (
  filter: 'monthly' | 'weekly' = 'monthly',
) => {
  const now = new Date();
  let startDate: Date;

  if (filter === 'weekly') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const distribution = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        totalBookings: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 1,
        categoryName: '$category.name',
        totalBookings: 1,
      },
    },
    { $sort: { totalBookings: -1 } },
  ]);

  return distribution;
};

// ─── Recent Bookings ──────────────────────────────────────────────────────────
const recentBookings = async (limit = 10, page = 1) => {
  const skip = (page - 1) * limit;

  const bookings = await Booking.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'firstName lastName email profileImage')
    .populate('serviceId', 'name')
    .populate('categoryId', 'name');

  const total = await Booking.countDocuments();

  return {
    bookings,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── Pending Cleaner Approvals ────────────────────────────────────────────────
const pendingCleanerApprovals = async (limit = 10, page = 1) => {
  const skip = (page - 1) * limit;

  const filter = {
    role: userRole['find job'],
    userStatus: PENDING_USER_STATUS_FILTER,
  };

  const cleaners = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('category', 'name')
    .populate('service', 'name')
    .select(
      'firstName lastName email profileImage bio phone experienceLevel status userStatus verified createdAt',
    );

  const total = await User.countDocuments(filter);

  return {
    cleaners,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const dashboardService = {
  dashboardOverview,
  earningsOverview,
  bookingDistribution,
  recentBookings,
  pendingCleanerApprovals,
};
