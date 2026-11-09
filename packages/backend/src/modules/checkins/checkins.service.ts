import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { emitToHotel, emitToDevice, SOCKET_EVENTS } from '../../core/realtime/socket';
import { devicesService } from '../devices/devices.service';
import { auditService } from '../audit/audit.service';
import { dashboardService } from '../dashboard/dashboard.service';
import { scheduleCheckoutReminder, cancelCheckoutReminder } from '../../core/jobs/reminder.queue';
import { env } from '../../config/env';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export class CheckinService {
  // ─── Create booking + check-in in one flow ─────────────
  async checkIn(hotelId: string, data: {
    guestId?: string;
    guestData?: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
    };
    roomId: string;
    checkInDate: Date;
    checkOutDate: Date;
    guestCount?: number;
    specialRequests?: string;
    internalNotes?: string;
    source?: 'MANUAL' | 'PMS' | 'API';
    forceCheckIn?: boolean;
  }, performedById: string) {
    // Validate room belongs to hotel
    let room = await prisma.room.findFirst({
      where: { id: data.roomId, hotelId, deletedAt: null },
      include: {
        currentBooking: { include: { guest: true } },
        device: true,
      },
    });

    if (!room) throw new NotFoundError('Room', data.roomId);

    // 1. Auto-complete any expired bookings on this room whose checkout has passed
    await prisma.booking.updateMany({
      where: {
        roomId: data.roomId,
        hotelId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkOutDate: { lte: new Date() },
        deletedAt: null,
      },
      data: { status: 'CHECKED_OUT', actualCheckoutAt: new Date() },
    });

    // 2. Check for active booking conflict on room
    if (room.currentBooking) {
      const isExpired = new Date(room.currentBooking.checkOutDate).getTime() <= Date.now();
      if (isExpired || data.forceCheckIn) {
        await prisma.booking.update({
          where: { id: room.currentBooking.id },
          data: { status: 'CHECKED_OUT', actualCheckoutAt: new Date() },
        });
        await prisma.room.update({
          where: { id: room.id },
          data: { currentBookingId: null, status: 'AVAILABLE' },
        });
        room.currentBooking = null;
      } else {
        throw new ConflictError(
          `Room ${room.roomNumber} already has an active guest: ${room.currentBooking.guest.firstName} ${room.currentBooking.guest.lastName}. Check them out first.`
        );
      }
    }

    // 3. Check for overlapping non-expired active bookings
    const overlapping = await prisma.booking.findFirst({
      where: {
        roomId: data.roomId,
        hotelId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkOutDate: { gt: new Date() },
        deletedAt: null,
        OR: [
          {
            checkInDate: { lt: data.checkOutDate },
            checkOutDate: { gt: data.checkInDate },
          },
        ],
      },
      include: { guest: true },
    });

    if (overlapping) {
      if (data.forceCheckIn) {
        await prisma.booking.update({
          where: { id: overlapping.id },
          data: { status: 'CHECKED_OUT', actualCheckoutAt: new Date() },
        });
      } else {
        throw new ConflictError(
          `Room ${room.roomNumber} has an active booking for ${overlapping.guest.firstName} ${overlapping.guest.lastName} until ${new Date(overlapping.checkOutDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}. Please check them out or confirm replacement.`
        );
      }
    }

    const checkInMs = new Date(data.checkInDate).getTime();
    const checkOutMs = new Date(data.checkOutDate).getTime();
    if (isNaN(checkInMs) || isNaN(checkOutMs) || checkOutMs <= checkInMs) {
      throw new AppError('Checkout date and time must be after check-in date and time', 400);
    }

    // Calculate nights (at least 1 for billing/record purposes, e.g. for hourly stays)
    const diffDays = dayjs(data.checkOutDate).diff(dayjs(data.checkInDate), 'day', true);
    const nights = Math.max(1, Math.round(diffDays));

    const result = await prisma.$transaction(async (tx) => {
      // Create or find guest
      let guest;
      if (data.guestId) {
        guest = await tx.guest.findFirst({
          where: { id: data.guestId, hotelId, deletedAt: null },
        });
        if (!guest) throw new NotFoundError('Guest', data.guestId);
      } else if (data.guestData) {
        const cleanPhone = data.guestData.phone?.trim();
        const cleanEmail = data.guestData.email?.trim();
        if (cleanPhone || cleanEmail) {
          guest = await tx.guest.findFirst({
            where: {
              hotelId,
              deletedAt: null,
              OR: [
                ...(cleanPhone ? [{ phone: cleanPhone }] : []),
                ...(cleanEmail ? [{ email: cleanEmail }] : []),
              ],
            },
          });
        }
        if (!guest) {
          guest = await tx.guest.create({
            data: {
              hotelId,
              firstName: data.guestData.firstName || 'Guest',
              lastName: data.guestData.lastName || '',
              phone: cleanPhone || null,
              email: cleanEmail || null,
            },
          });
        }
      } else {
        throw new AppError('Guest information required', 400);
      }

      // Create booking
      const booking = await tx.booking.create({
        data: {
          hotelId,
          roomId: data.roomId,
          guestId: guest.id,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nights,
          guestCount: data.guestCount || 1,
          source: data.source || 'MANUAL',
          status: 'CHECKED_IN',
          specialRequests: data.specialRequests,
          internalNotes: data.internalNotes,
          createdById: performedById,
        },
        include: {
          guest: true,
          room: { include: { device: true } },
        },
      });

      // Create checkin record
      await tx.checkin.create({
        data: {
          bookingId: booking.id,
          hotelId,
          checkedInBy: performedById,
        },
      });

      // Update room status + current booking
      await tx.room.update({
        where: { id: data.roomId },
        data: {
          status: 'OCCUPIED',
          currentBookingId: booking.id,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          hotelId,
          userId: performedById,
          action: 'GUEST_CHECKED_IN',
          resource: 'booking',
          resourceId: booking.id,
          details: {
            guestName: `${guest.firstName} ${guest.lastName}`,
            roomNumber: booking.room.roomNumber,
            checkInDate: data.checkInDate,
            checkOutDate: data.checkOutDate,
          },
          success: true,
        },
      });

      return { booking, guest };
    });

    // ─── Emit real-time events ────────────────────────────
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        settings: true,
        wifiSettings: true,
        amenities: { include: { amenity: true } },
        houseRules: true,
        checkoutSteps: true,
        photos: true,
      },
    });

    // Find the room's TV device
    const device = await prisma.tvDevice.findFirst({
      where: { roomId: data.roomId, deletedAt: null },
    });

    if (device) {
      // Send personalized guest data to TV immediately
      const tvPayload = {
        guestName: result.guest.firstName,
        guest: {
          id: result.guest.id,
          firstName: result.guest.firstName,
          lastName: result.guest.lastName,
          name: `${result.guest.firstName} ${result.guest.lastName}`.trim(),
        },
        roomNumber: room.roomNumber,
        checkoutTime: hotel?.settings?.checkOutTime || '11:00 AM',
        booking: {
          id: result.booking.id,
          roomNumber: room.roomNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nights,
          guestCount: data.guestCount || 1,
          checkOutTime: hotel?.settings?.checkOutTime || '11:00 AM',
        },
        hotel: await devicesService.getHotelTvPayload(hotelId, data.roomId),
      };
      emitToDevice(device.id, SOCKET_EVENTS.GUEST_CHECKED_IN, tvPayload);
      emitToDevice(device.id, 'guest.checked_in', tvPayload);
      if (device.deviceId && device.deviceId !== device.id) {
        emitToDevice(device.deviceId, SOCKET_EVENTS.GUEST_CHECKED_IN, tvPayload);
        emitToDevice(device.deviceId, 'guest.checked_in', tvPayload);
      }
    }

    // Notify all hotel dashboard users
    emitToHotel(hotelId, SOCKET_EVENTS.GUEST_CHECKED_IN, {
      bookingId: result.booking.id,
      guestName: `${result.guest.firstName} ${result.guest.lastName}`,
      roomNumber: room.roomNumber,
      roomId: data.roomId,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      tvOnline: device?.isOnline || false,
      timestamp: new Date().toISOString(),
    });

    // Create notification
    await prisma.notification.create({
      data: {
        hotelId,
        type: 'GUEST_CHECKED_IN',
        title: 'Guest checked in',
        body: `${result.guest.firstName} ${result.guest.lastName} checked into Room ${room.roomNumber}`,
        data: { bookingId: result.booking.id, roomId: data.roomId },
      },
    });

    // Schedule checkout reminder
    const reminderMinutes = env.CHECKOUT_REMINDER_MINUTES || 60;
    await scheduleCheckoutReminder(
      result.booking.id,
      hotelId,
      data.checkOutDate,
      reminderMinutes
    );

    // Invalidate dashboard stats cache
    dashboardService.invalidateDashboardCache(hotelId);

    return result.booking;
  }

  // ─── Check out ─────────────────────────────────────────
  async checkOut(hotelId: string, bookingId: string, data: {
    notes?: string;
    earlyCheckout?: boolean;
  }, performedById: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId, status: 'CHECKED_IN', deletedAt: null },
      include: {
        guest: true,
        room: { include: { device: true } },
        checkin: true,
      },
    });

    if (!booking) {
      throw new NotFoundError('Active booking', bookingId);
    }

    await prisma.$transaction(async (tx) => {
      // Create checkout record
      await tx.checkout.create({
        data: {
          bookingId,
          hotelId,
          checkedOutBy: performedById,
          notes: data.notes,
          earlyCheckout: data.earlyCheckout || false,
        },
      });

      // Update booking status
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CHECKED_OUT',
          actualCheckoutAt: new Date(),
        },
      });

      // Update room: clear current booking, set to cleaning
      await tx.room.update({
        where: { id: booking.roomId },
        data: {
          status: 'CLEANING',
          currentBookingId: null,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          hotelId,
          userId: performedById,
          action: 'GUEST_CHECKED_OUT',
          resource: 'booking',
          resourceId: bookingId,
          details: {
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            roomNumber: booking.room.roomNumber,
          },
          success: true,
        },
      });
    });

    // ─── Emit real-time events ────────────────────────────
    if (booking.room.device) {
      // Tell TV to clear guest data and return to default
      const clearPayload = {
        bookingId,
        action: 'CLEAR_GUEST',
        roomNumber: booking.room.roomNumber,
        timestamp: new Date().toISOString(),
      };
      emitToDevice(booking.room.device.id, SOCKET_EVENTS.GUEST_CHECKED_OUT, clearPayload);
      emitToDevice(booking.room.device.id, 'guest.checked_out', clearPayload);
      if (booking.room.device.deviceId && booking.room.device.deviceId !== booking.room.device.id) {
        emitToDevice(booking.room.device.deviceId, SOCKET_EVENTS.GUEST_CHECKED_OUT, clearPayload);
        emitToDevice(booking.room.device.deviceId, 'guest.checked_out', clearPayload);
      }
    }

    // Notify hotel dashboard
    emitToHotel(hotelId, SOCKET_EVENTS.GUEST_CHECKED_OUT, {
      bookingId,
      guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
      roomNumber: booking.room.roomNumber,
      roomId: booking.roomId,
      tvOnline: booking.room.device?.isOnline || false,
      timestamp: new Date().toISOString(),
    });

    // Create notification
    await prisma.notification.create({
      data: {
        hotelId,
        type: 'GUEST_CHECKED_OUT',
        title: 'Guest checked out',
        body: `${booking.guest.firstName} ${booking.guest.lastName} checked out of Room ${booking.room.roomNumber}`,
        data: { bookingId, roomId: booking.roomId },
      },
    });

    // Cancel any pending checkout reminder
    await cancelCheckoutReminder(bookingId);

    // Invalidate dashboard stats cache
    dashboardService.invalidateDashboardCache(hotelId);

    return { success: true, message: 'Checkout completed' };
  }

  // ─── Get today's activity ──────────────────────────────
  async getTodayActivity(hotelId: string, timezone: string) {
    const hotelNow = dayjs().tz(timezone);
    const todayStart = hotelNow.startOf('day').toDate();
    const todayEnd = hotelNow.endOf('day').toDate();

    const [checkins, checkouts, upcoming] = await Promise.all([
      prisma.checkin.findMany({
        where: {
          hotelId,
          checkedInAt: { gte: todayStart, lte: todayEnd },
        },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
        orderBy: { checkedInAt: 'desc' },
      }),
      prisma.checkout.findMany({
        where: {
          hotelId,
          checkedOutAt: { gte: todayStart, lte: todayEnd },
        },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
        orderBy: { checkedOutAt: 'desc' },
      }),
      // Upcoming check-ins today (confirmed but not yet checked in)
      prisma.booking.findMany({
        where: {
          hotelId,
          status: 'CONFIRMED',
          checkInDate: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
        include: { guest: true, room: true },
      }),
    ]);

    return { checkins, checkouts, upcoming };
  }
}

export const checkinService = new CheckinService();

