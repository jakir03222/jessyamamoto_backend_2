// import { Request, Response } from 'express';
// import Stripe from 'stripe';
// import config from '../config';
// import Payment from '../modules/payment/payment.model';
// import User from '../modules/user/user.model';
// import Subscription from '../modules/subscription/subscription.model';

// const stripe = new Stripe(config.stripe.secretKey!);

// const webHookHandler = async (req: Request, res: Response) => {
//   const sig = req.headers['stripe-signature'] as string;

//   let event: Stripe.Event;

//   try {
//     //  req.body must be raw buffer (use express.raw middleware for this route)
//     event = stripe.webhooks.constructEvent(
//       req.body,
//       sig,
//       config.stripe.webhookSecret!,
//     );
//   } catch (err: any) {
//     console.error('❌ Webhook verification error:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   try {
//     switch (event.type) {
//       /* ================= PAYMENT SUCCESS ================= */
//       case 'checkout.session.completed': {
//         const session = event.data.object as Stripe.Checkout.Session;

//         const payment = await Payment.findOne({ stripeSessionId: session.id });
//         if (!payment) {
//           console.warn('⚠️ Payment record not found for session:', session.id);
//           return res.status(200).json({ received: true });
//         }

//         payment.status = 'completed';
//         payment.stripePaymentIntentId = session.payment_intent as string;
//         await payment.save();

//         const paymentType = session.metadata?.paymentType;

//         if (paymentType === 'subscription') {
//           const user = await User.findById(payment.user);
//           const subscription = await Subscription.findById(
//             payment.subscription,
//           );

//           if (!user || !subscription)
//             return res.status(200).json({ received: true });

//           // add user to subscription if not already
//           if (!subscription.totalSubscripeUser?.includes(user._id)) {
//             subscription.totalSubscripeUser =
//               subscription.totalSubscripeUser || [];
//             subscription.totalSubscripeUser.push(user._id);
//             await subscription.save();
//           }

//           // calculate expiry
//           const months = subscription.type === 'yearly' ? 12 : 1;
//           const expiry = new Date();
//           expiry.setMonth(expiry.getMonth() + months);

//           user.isSubscription = true;
//           user.subscription = subscription._id;
//           user.subscriptionExpiry = expiry;
//           await user.save();
//         }

//         return res.status(200).json({ received: true });
//       }

//       /* ================= PAYMENT FAILED ================= */
//       case 'payment_intent.payment_failed': {
//         const intent = event.data.object as Stripe.PaymentIntent;

//         const payment = await Payment.findOne({
//           stripePaymentIntentId: intent.id,
//         });
//         if (payment) {
//           payment.status = 'failed';
//           await payment.save();
//         }

//         return res.status(200).json({ received: true });
//       }

//       default:
//         console.log(`⚠️ Unhandled event type ${event.type}`);
//         return res.status(200).json({ received: true });
//     }
//   } catch (err: any) {
//     console.error('❌ Webhook handler error:', err.message);
//     return res.status(500).send(`Webhook Handler Error: ${err.message}`);
//   }
// };

// export default webHookHandler;

//============================== update code =========================================
import { Request, Response } from 'express';
import Stripe from 'stripe';
import config from '../config';
import Payment from '../modules/payment/payment.model';
import User from '../modules/user/user.model';
import Subscription from '../modules/subscription/subscription.model';
import Booking from '../modules/booking/booking.model';
import { serviceService } from '../modules/service/service.service';

const stripe = new Stripe(config.stripe.secretKey!);

const webHookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    // req.body must be raw buffer (use express.raw middleware for this route)
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret!,
    );
  } catch (err: any) {
    console.error('❌ Webhook verification error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      /* ================= PAYMENT SUCCESS ================= */
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const payment = await Payment.findOne({ stripeSessionId: session.id });
        if (!payment) {
          console.warn('⚠️ Payment record not found for session:', session.id);
          return res.status(200).json({ received: true });
        }

        payment.status = 'completed';
        payment.stripePaymentIntentId = session.payment_intent as string;
        await payment.save();

        const paymentType = session.metadata?.paymentType;

        /* --------- SUBSCRIPTION PAYMENT --------- */
        if (paymentType === 'subscription') {
          const user = await User.findById(payment.user);
          const subscription = await Subscription.findById(
            payment.subscription,
          );

          if (!user || !subscription)
            return res.status(200).json({ received: true });

          // Add user to subscription if not already
          if (!subscription.totalSubscripeUser?.includes(user._id)) {
            subscription.totalSubscripeUser =
              subscription.totalSubscripeUser || [];
            subscription.totalSubscripeUser.push(user._id);
            await subscription.save();
          }

          // Calculate expiry
          const months =
            subscription.type === 'yearly'
              ? 12
              : subscription.type === 'six_month'
                ? 6
                : 1;
          const expiry = new Date();
          expiry.setMonth(expiry.getMonth() + months);

          user.isSubscription = true;
          user.subscription = subscription._id;
          user.subscriptionExpiry = expiry;
          await user.save();

          await serviceService.completePendingServiceRegistration(session.id);

          console.log('✅ Subscription activated for user:', user._id);
        }

        /* --------- BOOKING PAYMENT --------- */
        if (paymentType === 'booking') {
          const booking = await Booking.findById(payment.booking);

          if (!booking) {
            console.warn('⚠️ Booking not found for payment:', payment._id);
            return res.status(200).json({ received: true });
          }

          // Update booking status from 'pending' to 'accepted' after payment
          booking.status = 'accepted';
          await booking.save();

          console.log('✅ Booking accepted after payment:', booking._id);
          console.log('💰 Payment details:');
          console.log('   Total Amount:', session.metadata?.totalAmount);
          console.log('   Admin Fee (10%):', session.metadata?.adminFee);
          console.log(
            '   Provider Amount (90%):',
            session.metadata?.providerAmount,
          );
        }

        return res.status(200).json({ received: true });
      }

      /* ================= PAYMENT FAILED ================= */
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;

        const payment = await Payment.findOne({
          stripePaymentIntentId: intent.id,
        });

        if (payment) {
          payment.status = 'failed';
          await payment.save();

          // If it's a booking payment, you might want to cancel the booking
          if (payment.booking) {
            const booking = await Booking.findById(payment.booking);
            if (booking && booking.status === 'pending') {
              booking.status = 'cancelled';
              await booking.save();
              console.log(
                '❌ Booking cancelled due to payment failure:',
                booking._id,
              );
            }
          }
        }

        return res.status(200).json({ received: true });
      }

      /* ================= TRANSFER CREATED (MONEY SENT TO SERVICE PROVIDER) ================= */
      case 'transfer.created': {
        const transfer = event.data.object as Stripe.Transfer;
        console.log(
          '💸 Transfer created to service provider:',
          transfer.destination,
        );
        console.log(
          '   Amount:',
          transfer.amount / 100,
          transfer.currency.toUpperCase(),
        );
        return res.status(200).json({ received: true });
      }

      /* ================= APPLICATION FEE CREATED (ADMIN COMMISSION) ================= */
      case 'application_fee.created': {
        const fee = event.data.object as Stripe.ApplicationFee;
        console.log(
          '💰 Admin commission received:',
          fee.amount / 100,
          fee.currency.toUpperCase(),
        );
        return res.status(200).json({ received: true });
      }

      default:
        console.log(`⚠️ Unhandled event type ${event.type}`);
        return res.status(200).json({ received: true });
    }
  } catch (err: any) {
    console.error('❌ Webhook handler error:', err.message);
    return res.status(500).send(`Webhook Handler Error: ${err.message}`);
  }
};

export default webHookHandler;
