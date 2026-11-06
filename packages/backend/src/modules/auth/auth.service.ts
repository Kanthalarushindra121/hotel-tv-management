import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { redis } from '../../config/redis';
import { AppError } from '../../core/errors';
import { UserRole } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  hotelId: string | null;
  role: UserRole;
  isSuperAdmin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BLACKLIST_PREFIX = 'rt:blacklist:';

export class AuthService {
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    hotelName: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    logoUrl?: string;
  }) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new AppError('Email already registered', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Create hotel + owner in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create hotel with all property profile details
      const hotel = await tx.hotel.create({
        data: {
          name: data.hotelName.trim(),
          slug: this.generateSlug(data.hotelName),
          email: normalizedEmail,
          phone: data.phone?.trim() || null,
          address: data.address?.trim() || null,
          city: data.city?.trim() || null,
          state: data.state?.trim() || null,
          country: data.country?.trim() || 'India',
          postalCode: data.postalCode?.trim() || null,
          logoUrl: data.logoUrl?.trim() || null,
          isOnboarded: true,
          onboardingStep: 10,
        },
      });

      // Create hotel settings with hotel-specific welcome messaging
      await tx.hotelSettings.create({
        data: {
          hotelId: hotel.id,
          welcomeMessage: 'Welcome',
          defaultWelcomeMsg: `Welcome to ${data.hotelName.trim()}`,
          checkoutMessage: 'Thank you for staying with us. We look forward to welcoming you again.',
        },
      });

      // Create trial subscription
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial
      await tx.subscription.create({
        data: {
          hotelId: hotel.id,
          plan: 'STARTER',
          status: 'TRIAL',
          trialEndsAt: trialEnd,
        },
      });

      // Create owner user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          username: normalizedEmail.split('@')[0],
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          phone: data.phone?.trim() || null,
          role: 'OWNER',
          hotelId: hotel.id,
        },
      });

      return { user, hotel };
    });

    // Generate tokens
    const tokens = await this.generateTokens(result.user);

    return {
      user: this.sanitizeUser(result.user),
      hotel: result.hotel,
      tokens,
    };
  }

  async login(identifier: string, password: string, ipAddress?: string, userAgent?: string) {
    const clean = (identifier || '').trim();
    if (!clean) {
      throw new AppError('Email or username is required', 400);
    }

    const cleanLower = clean.toLowerCase();

    // Support logging in via email OR username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanLower },
          { username: clean },
          { username: cleanLower },
        ],
        deletedAt: null,
      },
      include: { hotel: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    return {
      user: this.sanitizeUser(user),
      hotel: user.hotel,
      tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    // Check blacklist
    const blacklisted = await redis.get(`${REFRESH_TOKEN_BLACKLIST_PREFIX}${refreshToken}`);
    if (blacklisted) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Find token in DB
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(stored.user);

    return { tokens };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Blacklist the refresh token
      await redis.setex(
        `${REFRESH_TOKEN_BLACKLIST_PREFIX}${refreshToken}`,
        30 * 24 * 60 * 60, // 30 days
        '1'
      );
      await prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { revokedAt: new Date() },
      });
    }
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) return;

    const token = nanoid(32);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await redis.setex(`pwd:reset:${token}`, 3600, user.id);

    // TODO: Send email with reset link
    // await emailService.sendPasswordReset(user.email, token);
    console.log(`[DEV] Password reset token for ${email}: ${token}`);
  }

  async resetPassword(token: string, newPassword: string) {
    const userId = await redis.get(`pwd:reset:${token}`);
    if (!userId) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await redis.del(`pwd:reset:${token}`);

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    } catch {
      throw new AppError('Invalid or expired access token', 401);
    }
  }

  private async generateTokens(
    user: { id: string; hotelId: string | null; role: UserRole; isSuperAdmin: boolean },
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    const payload: TokenPayload = {
      userId: user.id,
      hotelId: user.hotelId,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
    });

    const refreshToken = nanoid(64);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
        ipAddress,
        deviceInfo: userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const unique = nanoid(6).toLowerCase();
    return `${base}-${unique}`;
  }

  sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    hotelId: string | null;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      hotelId: user.hotelId,
      isSuperAdmin: user.isSuperAdmin,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();

