import { Types } from 'mongoose';

export interface IService {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
  email?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  zip?: string;
  location?: string;
  lat?: number;
  lng?: number;
  hourRate?: number;
  days?: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
}
