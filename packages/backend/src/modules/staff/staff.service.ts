import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { UserRole } from '@prisma/client';

export interface CreateStaffInput {
  email: string;
  username?: string;
  password?: string;
  temporaryPassword?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'STAFF';
}

const BCRYPT_ROUNDS = 12;

export class StaffService {
  // ─── List Staff ───────────────────────────────────────────
  async listStaff(hotelId: string) {
    const staff = await prisma.user.findMany({
      where: {
        hotelId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    return staff;
  }

  // ─── Create Staff ─────────────────────────────────────────
  async createStaff(hotelId: string, data: CreateStaffInput, callerId: string) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check email uniqueness
    const existingEmail = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      throw new ConflictError('A user with this email already exists');
    }

    // Check username uniqueness if provided
    if (data.username) {
      const existingUsername = await prisma.user.findFirst({
        where: { username: data.username.trim() },
      });
      if (existingUsername) {
        throw new ConflictError('A user with this username already exists');
      }
    }

    // Check subscription user limits
    const subscription = await prisma.subscription.findUnique({
      where: { hotelId },
    });
    if (subscription) {
      const currentCount = await prisma.user.count({
        where: { hotelId, deletedAt: null },
      });
      if (currentCount >= subscription.maxUsers) {
        throw new AppError(
          `User limit of ${subscription.maxUsers} reached for your subscription plan`,
          403,
          'USER_LIMIT_EXCEEDED'
        );
      }
    }

    // Use provided password or temporaryPassword
    const rawPassword = (data.password || data.temporaryPassword || 'Staff@123!').trim();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          hotelId,
          email: normalizedEmail,
          username: data.username?.trim() || normalizedEmail.split('@')[0],
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          phone: data.phone?.trim() || null,
          role: data.role as UserRole,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId: callerId,
          action: 'USER_CREATED',
          resource: 'user',
          resourceId: u.id,
          details: { email: u.email, role: u.role },
          success: true,
        },
      });

      return u;
    });

    return user;
  }

  // ─── Update Staff Role ────────────────────────────────────
  async updateStaffRole(hotelId: string, targetUserId: string, newRole: UserRole, callerId: string) {
    const caller = await prisma.user.findUnique({ where: { id: callerId } });
    if (!caller || (caller.role !== 'OWNER' && !caller.isSuperAdmin)) {
      throw new AppError('Only the hotel OWNER can change staff roles', 403);
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, hotelId, deletedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundError('User', targetUserId);
    }

    if (targetUser.role === 'OWNER' && newRole !== 'OWNER') {
      throw new AppError('Cannot demote the hotel owner', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId: callerId,
          action: 'STAFF_PERMISSION_CHANGED',
          resource: 'user',
          resourceId: targetUserId,
          details: { oldRole: targetUser.role, newRole },
          success: true,
        },
      });

      return u;
    });

    return updated;
  }

  // ─── Toggle Staff Active / Disabled ───────────────────────
  async toggleStaffActive(hotelId: string, targetUserId: string, callerId: string, explicitStatus?: boolean) {
    if (callerId === targetUserId) {
      throw new AppError('You cannot deactivate your own account', 400);
    }

    const caller = await prisma.user.findUnique({ where: { id: callerId } });
    if (!caller) throw new AppError('Caller not found', 401);

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, hotelId, deletedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundError('User', targetUserId);
    }

    if (targetUser.role === 'OWNER') {
      throw new AppError('Cannot deactivate the hotel owner', 400);
    }

    if (caller.role === 'ADMIN' && targetUser.role === 'ADMIN') {
      throw new AppError('Admins cannot deactivate fellow administrators', 403);
    }

    const newActiveState = explicitStatus !== undefined ? explicitStatus : !targetUser.isActive;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { isActive: newActiveState },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId: callerId,
          action: 'USER_UPDATED',
          resource: 'user',
          resourceId: targetUserId,
          details: { action: 'toggle_active', isActive: newActiveState },
          success: true,
        },
      });

      return u;
    });

    return updated;
  }

  // ─── Delete Staff (Soft Delete) ───────────────────────────
  async deleteStaff(hotelId: string, targetUserId: string, callerId: string) {
    if (callerId === targetUserId) {
      throw new AppError('You cannot delete your own account', 400);
    }

    const caller = await prisma.user.findUnique({ where: { id: callerId } });
    if (!caller) throw new AppError('Caller not found', 401);

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, hotelId, deletedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundError('User', targetUserId);
    }

    if (targetUser.role === 'OWNER') {
      throw new AppError('Cannot delete the hotel owner', 400);
    }

    // Role hierarchy: ADMIN cannot delete another ADMIN
    if (caller.role === 'ADMIN' && targetUser.role === 'ADMIN') {
      throw new AppError('Only the OWNER can delete administrators', 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      // Revoke any refresh tokens
      await tx.refreshToken.deleteMany({
        where: { userId: targetUserId },
      });

      // Revoke sessions
      await tx.session.deleteMany({
        where: { userId: targetUserId },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId: callerId,
          action: 'USER_DELETED',
          resource: 'user',
          resourceId: targetUserId,
          details: { email: targetUser.email, role: targetUser.role },
          success: true,
        },
      });
    });

    return { success: true, message: `Staff member ${targetUser.firstName} ${targetUser.lastName} removed successfully` };
  }
}

export const staffService = new StaffService();
