import mongoose from 'mongoose';
import { IUser } from './user.interface';
import bcrypt from 'bcryptjs';
import config from '../../config';
import {
  IUserLanguage,
  normalizeUserLanguages,
} from './user.language.util';
import { USER_APPROVAL_STATUS } from './user.status.util';

const userLanguageSchema = new mongoose.Schema(
  {
    language: { type: String, required: true, trim: true },
    proficiency: {
      type: String,
      enum: ['Basic', 'Conversational', 'Fluent', 'Native / Bilingual'],
      default: 'Fluent',
    },
    isNative: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema<IUser>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // important for security
    },
    role: {
      type: String,
      enum: ['find job', 'find care', 'admin'],
      required: true,
    },
    profileImage: String,
    bio: String,
    phone: String,
    otp: String,
    otpExpiry: Date,
    verified: {
      type: Boolean,
      default: false,
    },
    isSubscription: {
      type: Boolean,
      default: false,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    subscriptionExpiry: Date,
    category: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    service: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
    ],
    zip: {
      type: String,
    },
    location: {
      type: String,
    },
    lat: Number,
    lng: Number,
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    userStatus: {
      type: String,
      enum: [
        USER_APPROVAL_STATUS.approved,
        USER_APPROVAL_STATUS.pending,
        USER_APPROVAL_STATUS.rejected,
        'panding',
        'reject',
      ],
      default: function (this: IUser) {
        return this.role === 'find job'
          ? USER_APPROVAL_STATUS.pending
          : USER_APPROVAL_STATUS.approved;
      },
    },
    gender: {
      type: String,
      default: '',
    },
    experienceLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'expert'],
    },
    NIDNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    countery: { type: String },
    city: { type: String },
    totalBooking: [{ type: mongoose.Schema.ObjectId, ref: 'Booking' }],
    completeBooking: [{ type: mongoose.Schema.ObjectId, ref: 'Booking' }],
    cencleBooking: [{ type: mongoose.Schema.ObjectId, ref: 'Booking' }],
    stripeAccountId: { type: String },
    reviewRatting: [{ type: mongoose.Schema.ObjectId, ref: 'Review' }],
    givenReviewRatting: [{ type: mongoose.Schema.ObjectId, ref: 'Review' }],
    exprience: Number,
    experiences: [{ type: String }],
    language: [userLanguageSchema],
    agegroup: [{ type: String }],
    education: [{ type: String }],
    canHelpWith: [{ type: String }],
    professionalSkill: [{ type: String }],
    perferences: [{ type: String }],
    certifications: [{ type: String }],
    galary: [{ type: String }],
    neighborhoods: { type: String },
  },
  {
    timestamps: true,
  },
);

userSchema.pre('save', function (next) {
  if (this.NIDNumber === '') {
    this.set('NIDNumber', undefined);
  }
  if (Array.isArray(this.language) && this.language.length > 0) {
    this.language = normalizeUserLanguages(this.language) as IUserLanguage[];
  }
  next();
});

userSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update || typeof update !== 'object') {
    return next();
  }
  const set = update.$set as Record<string, unknown> | undefined;
  const target = set ?? update;
  if (target.language !== undefined) {
    target.language = normalizeUserLanguages(target.language);
  }
  next();
});

userSchema.post('init', function (doc) {
  if (!Array.isArray(doc.language) || doc.language.length === 0) return;
  if (typeof doc.language[0] === 'string') {
    doc.language = normalizeUserLanguages(doc.language) as IUserLanguage[];
  }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const hash = await bcrypt.hash(
    this.password,
    Number(config.bcryptSaltRounds),
  );
  this.password = hash;
  next();
});

const User = mongoose.model<IUser>('User', userSchema);
export default User;
