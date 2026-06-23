import { Router } from 'express';
import { userRoutes } from '../modules/user/user.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { serviceRouter } from '../modules/service/service.routes';
import { categoryRouter } from '../modules/category/category.routes';
import { subscriptionRouter } from '../modules/subscription/subscription.routes';
import { reviewRouter } from '../modules/review/review.routes';
import { messageRoutes } from '../modules/message/message.routes';
import { conversationRoutes } from '../modules/conversation/conversation.routes';
import { bookingRouter } from '../modules/booking/booking.routes';
import { bookmarkRoutes } from '../modules/bookmark/bookmark.routes';
import { paymentRouter } from '../modules/payment/payment.routes';
import { helpRoutes } from '../modules/help/help.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { countryRoutes } from '../modules/countery/countery.routes';
import { languageRoutes } from '../modules/language/language.routes';
import { educationRoutes } from '../modules/education/education.routes';
import { experienceRoutes } from '../modules/experience/experience.routes';
import { adminRoutes } from '../modules/admin/admin.routes';

const router = Router();

const moduleRoutes = [
  {
    path: '/user',
    route: userRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/service',
    route: serviceRouter,
  },
  {
    path: '/category',
    route: categoryRouter,
  },
  {
    path: '/subscription',
    route: subscriptionRouter,
  },
  {
    path: '/review',
    route: reviewRouter,
  },
  {
    path: '/message',
    route: messageRoutes,
  },
  {
    path: '/conversation',
    route: conversationRoutes,
  },
  {
    path: '/booking',
    route: bookingRouter,
  },
  {
    path: '/bookmark',
    route: bookmarkRoutes,
  },
  {
    path: '/payment',
    route: paymentRouter,
  },
  {
    path: '/help',
    route: helpRoutes,
  },
  {
    path: '/dashboard',
    route: dashboardRoutes,
  },
  {
    path: '/country',
    route: countryRoutes,
  },
  {
    path: '/language',
    route: languageRoutes,
  },
  {
    path: '/education',
    route: educationRoutes,
  },
  {
    path: '/experience',
    route: experienceRoutes,
  },
  {
    path: '/admin',
    route: adminRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
