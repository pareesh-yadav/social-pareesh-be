import { prisma } from '../config/database';
import { passwordUtils } from '../utils/password';
import { jwtUtils } from '../utils/jwt';
import crypto from 'node:crypto';
import { sendEmail } from '../utils/sendEmail';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const createVerificationOtp = () => {
  const otp = crypto.randomInt(100000, 999999).toString();
  return {
    otp,
    hashedOtp: crypto.createHash('sha256').update(otp).digest('hex'),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
};

export const authService = {
  register: async (username: string, email: string, password: string) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = username.trim();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
    });

    if (existingUser) {
      throw new ConflictError('User already exists with that email or username');
    }

    const passwordHash = await passwordUtils.hashPassword(password);

    const { otp, hashedOtp, expiresAt: otpExpire } = createVerificationOtp();

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        status: 'pending_verification',
        resetPasswordToken: hashedOtp,
        resetPasswordExpire: otpExpire,
      },
    });

    // 5. Send the Welcome/Verification OTP Email
    const message = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #ffffff; color: #333333; line-height: 1.6;">
        <h2 style="color: #111827; margin-bottom: 20px; font-size: 24px; font-weight: 600;">
          Welcome to the App, ${username}!
        </h2>
        <p style="margin-bottom: 24px; color: #4b5563; font-size: 16px;">
          To complete your registration and verify your email address, please enter the code below in the app:
        </p>
        <div style="margin-bottom: 24px; text-align: center;">
          <div style="display: inline-block; background-color: #f3f4f6; color: #111827; padding: 16px 32px; border-radius: 8px; font-weight: 700; font-size: 32px; letter-spacing: 4px;">
            ${otp}
          </div>
        </div>
        <p style="margin-bottom: 24px; color: #6b7280; font-size: 15px;">
          This code will expire in <strong>10 minutes</strong>.
        </p>
      </div>
    `;

    // Send email asynchronously (don't wait for it to finish to speed up API response)
    sendEmail({
      to: user.email,
      subject: 'Verify your email address',
      html: message,
      otp,
      toName: user.username,
    }).catch(console.error);

    // 6. Return response WITHOUT JWT tokens (force them to verify the OTP first)
    return {
      message: 'Registration successful. Please check your email for the verification code.',
      email: user.email,
      requiresVerification: true
    };
  },

  // NEW METHOD: Call this when the user enters the OTP on the frontend
  verifyRegistration: async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email);
    const hashedOtp = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        resetPasswordToken: hashedOtp,
        resetPasswordExpire: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AuthenticationError('Invalid or expired verification code');
    }

    // Mark user as active, clear the OTP fields
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'online', // Or 'offline', now they are fully verified
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });

    // Generate their auth tokens now that they are verified
    const token = jwtUtils.generateToken({ userId: updatedUser.id, email: updatedUser.email });
    const refreshToken = jwtUtils.generateRefreshToken({ userId: updatedUser.id, email: updatedUser.email });

    return {
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        status: updatedUser.status,
        profilePicUrl: updatedUser.profilePicUrl,
        bio: updatedUser.bio,
        createdAt: updatedUser.createdAt,
      },
      token,
      refreshToken,
    };
  },

  resendVerification: async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.status !== 'pending_verification') {
      return true;
    }

    const { otp, hashedOtp, expiresAt } = createVerificationOtp();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedOtp,
        resetPasswordExpire: expiresAt,
      },
    });

    await sendEmail({
      to: user.email,
      subject: 'Your email verification code',
      html: `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
      otp,
      toName: user.username,
    });

    return true;
  },

  login: async (email: string, password: string) => {
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AuthenticationError('Account does not exist. Please register first.');
    }

    if (user.status === 'pending_verification') {
      throw new AuthenticationError('Please verify your email address before logging in.');
    }

    // Verify password
    const isPasswordValid = await passwordUtils.comparePasswords(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new AuthenticationError('Incorrect password.');
    }

    // Generate tokens
    const token = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
    });

    const refreshToken = jwtUtils.generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        profilePicUrl: user.profilePicUrl,
        bio: user.bio,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
      token,
      refreshToken,
    };
  },

  refreshToken: async (refreshToken: string) => {
    const payload = jwtUtils.verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const newToken = jwtUtils.generateToken({
      userId: user.id,
      email: user.email,
    });

    const newRefreshToken = jwtUtils.generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    return {
      token: newToken,
      refreshToken: newRefreshToken,
    };
  },

  verifyEmail: async (email: string) => {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    return !!user;
  },

  checkUsername: async (username: string) => {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    return !!user;
  },

  forgotPassword: async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return true;
    }

    // 1. Generate a secure 6-digit numeric OTP instead of a hex token
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    // 2. Save hashed OTP to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedOtp,
        resetPasswordExpire,
      },
    });

    // 3. Send email with the OTP (No URL links)
    const message = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #ffffff; color: #333333; line-height: 1.6;">
        <h2 style="color: #111827; margin-bottom: 20px; font-size: 24px; font-weight: 600;">Reset your password</h2>
        <p style="margin-bottom: 24px; color: #4b5563; font-size: 16px;">
          We received a request to reset your password. Use the code below to complete the process.
        </p>
        <div style="margin-bottom: 24px; text-align: center;">
          <div style="display: inline-block; background-color: #f3f4f6; color: #111827; padding: 16px 32px; border-radius: 8px; font-weight: 700; font-size: 32px; letter-spacing: 4px;">
            ${otp}
          </div>
        </div>
        <p style="margin-bottom: 24px; color: #6b7280; font-size: 15px;">
          This code will expire in <strong>10 minutes</strong>.
        </p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Password Reset Code',
        html: message,
        otp,
        toName: user.username,
      });
      return true;
    } catch (error) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: null, resetPasswordExpire: null },
      });
      throw new Error('Email could not be sent');
    }
  },

  resetPassword: async (email: string, otp: string, newPassword: string) => {
    const normalizedEmail = normalizeEmail(email);
    const hashedOtp = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        resetPasswordToken: hashedOtp,
        resetPasswordExpire: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AuthenticationError('Invalid or expired reset code');
    }

    const passwordHash = await passwordUtils.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });

    return true;
  }
};