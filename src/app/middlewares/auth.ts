import { NextFunction, Request, Response } from 'express';
import { JwtPayload, Secret } from 'jsonwebtoken';
import AppError from '../error/appError';
import config from '../config';
import { jwtHelpers } from '../helper/jwtHelpers';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | any;
    }
  }
}

export const auth = (...role: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) throw new AppError(401, 'You are not authorized');

      const varifiedToken = jwtHelpers.verifyToken(
        token,
        config.jwt.accessTokenSecret as Secret,
      ) as JwtPayload;

      // Defensive check for role
      if (
        role.length &&
        (!varifiedToken ||
          !varifiedToken.role ||
          !(
            role.includes(varifiedToken.role) ||
            (Array.isArray(varifiedToken.roles) &&
              varifiedToken.roles.some((r: string) => role.includes(r)))
          ))
      ) {
        throw new AppError(
          401,
          'You are not authorized to access this resource',
        );
      }
      req.user = varifiedToken;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const serviceAuth = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        req.user = undefined; // token নেই
        return next();
      }

      const token = authHeader.split(' ')[1];

      const verifiedToken = jwtHelpers.verifyToken(
        token as string,
        config.jwt.accessTokenSecret as Secret,
      ) as JwtPayload;

      if (
        roles.length &&
        verifiedToken.role &&
        !(
          roles.includes(verifiedToken.role) ||
          (Array.isArray(verifiedToken.roles) &&
            verifiedToken.roles.some((r: string) => roles.includes(r)))
        )
      ) {
        throw new AppError(403, 'Forbidden');
      }

      req.user = verifiedToken;
      next();
    } catch (error) {
      req.user = undefined;
      next();
    }
  };
};
