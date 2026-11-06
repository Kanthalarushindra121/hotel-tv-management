import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../core/errors';
import { CheckoutPolicy, CheckoutPolicyMode } from '@prisma/client';

export interface SetPolicyInput {
  name?: string;
  mode?: CheckoutPolicyMode;
  fixedTime?: string | null; // "11:00"
  hourlyDuration?: number | null; // 3, 6, 9, 12
}

export class PoliciesService {
  // ─── Set / Upsert Room Policy ──────────────────────────────
  async setRoomPolicy(hotelId: string, roomId: string, data: SetPolicyInput, userId?: string): Promise<CheckoutPolicy> {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    const mode = data.mode || 'FIXED_TIME';
    const fixedTime = mode === 'FIXED_TIME' ? (data.fixedTime || '11:00') : null;
    const hourlyDuration = mode === 'HOURLY' ? (data.hourlyDuration || 3) : null;

    const policy = await prisma.$transaction(async (tx) => {
      const saved = await tx.checkoutPolicy.upsert({
        where: { roomId },
        create: {
          hotelId,
          roomId,
          name: data.name || `${room.roomNumber} Policy`,
          mode,
          fixedTime,
          hourlyDuration,
          isDefault: false,
        },
        update: {
          name: data.name,
          mode,
          fixedTime,
          hourlyDuration,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'CHECKOUT_POLICY_SET',
          resource: 'checkout_policy',
          resourceId: saved.id,
          details: { roomId, mode, fixedTime, hourlyDuration },
          success: true,
        },
      });

      return saved;
    });

    return policy;
  }

  // ─── Set / Upsert Hotel Default Policy ─────────────────────
  async setHotelDefaultPolicy(hotelId: string, data: SetPolicyInput, userId?: string): Promise<CheckoutPolicy> {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel) {
      throw new NotFoundError('Hotel', hotelId);
    }

    const mode = data.mode || 'FIXED_TIME';
    const fixedTime = mode === 'FIXED_TIME' ? (data.fixedTime || '11:00') : null;
    const hourlyDuration = mode === 'HOURLY' ? (data.hourlyDuration || 3) : null;

    const existingDefault = await prisma.checkoutPolicy.findFirst({
      where: { hotelId, roomId: null },
    });

    const policy = await prisma.$transaction(async (tx) => {
      let saved: CheckoutPolicy;

      if (existingDefault) {
        saved = await tx.checkoutPolicy.update({
          where: { id: existingDefault.id },
          data: {
            name: data.name || existingDefault.name,
            mode,
            fixedTime,
            hourlyDuration,
            isDefault: true,
          },
        });
      } else {
        saved = await tx.checkoutPolicy.create({
          data: {
            hotelId,
            roomId: null,
            name: data.name || 'Hotel Default Policy',
            mode,
            fixedTime,
            hourlyDuration,
            isDefault: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'CHECKOUT_POLICY_SET',
          resource: 'checkout_policy',
          resourceId: saved.id,
          details: { defaultHotelPolicy: true, mode, fixedTime, hourlyDuration },
          success: true,
        },
      });

      return saved;
    });

    return policy;
  }

  // ─── Get Hotel Default Policy ──────────────────────────────
  async getHotelDefaultPolicy(hotelId: string): Promise<CheckoutPolicy> {
    const policy = await prisma.checkoutPolicy.findFirst({
      where: { hotelId, roomId: null },
    });

    if (policy) return policy;

    // Return in-memory fallback
    return {
      id: 'default',
      hotelId,
      roomId: null,
      name: 'Default 11:00 AM Fixed Policy',
      mode: 'FIXED_TIME',
      fixedTime: '11:00',
      hourlyDuration: null,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ─── Get Room Policy (room policy -> hotel default -> 11:00 AM fallback) ─
  async getRoomPolicy(hotelId: string, roomId: string): Promise<CheckoutPolicy> {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: { checkoutPolicy: true },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    if (room.checkoutPolicy) {
      return room.checkoutPolicy;
    }

    // Fallback to hotel default policy
    return this.getHotelDefaultPolicy(hotelId);
  }

  // ─── Calculate Checkout Time ───────────────────────────────
  calculateCheckoutTime(
    checkinAt: Date,
    policy: Partial<CheckoutPolicy> & { mode: CheckoutPolicyMode },
    targetDate?: Date
  ): Date {
    if (policy.mode === 'HOURLY') {
      const hours = policy.hourlyDuration || 3;
      return new Date(checkinAt.getTime() + hours * 60 * 60 * 1000);
    }

    if (policy.mode === 'CUSTOM') {
      if (targetDate) return targetDate;
      // Default to +24 hours if no targetDate provided for CUSTOM
      return new Date(checkinAt.getTime() + 24 * 60 * 60 * 1000);
    }

    // FIXED_TIME mode
    const [hours, minutes] = (policy.fixedTime || '11:00').split(':').map(Number);

    if (targetDate) {
      const checkout = new Date(targetDate);
      checkout.setHours(hours, minutes, 0, 0);
      return checkout;
    }

    // Handle same-day if checkin is before that time; otherwise next day
    const checkout = new Date(checkinAt);
    checkout.setHours(hours, minutes, 0, 0);

    if (checkout.getTime() <= checkinAt.getTime()) {
      checkout.setDate(checkout.getDate() + 1);
    }

    return checkout;
  }
}

export const policiesService = new PoliciesService();
