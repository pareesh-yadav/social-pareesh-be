import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '59m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

export const jwtUtils = {
  generateToken: (payload: JwtPayload): string => {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRE as jwt.SignOptions['expiresIn'],
    });
  },

  generateRefreshToken: (payload: JwtPayload): string => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRE as jwt.SignOptions['expiresIn'],
    });
  },

  verifyToken: (token: string): JwtPayload => {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  },

  verifyRefreshToken: (token: string): JwtPayload => {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
  },

  decodeToken: (token: string): JwtPayload | null => {
    return jwt.decode(token) as JwtPayload | null;
  },
};