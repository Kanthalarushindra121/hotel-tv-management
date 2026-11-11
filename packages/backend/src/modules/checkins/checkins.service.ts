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
    stayType?: string;
    checkoutPolicy?: string;
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

    // Resolve guest record before entering transaction to minimize interactive tx duration
    let guest: any;
    if (data.guestId) {
      guest = await prisma.guest.findFirst({
        where: { id: data.guestId, hotelId, deletedAt: null },
      });
      if (!guest) throw new NotFoundError('Guest', data.guestId);
    } else if (data.guestData) {
      const cleanPhone = data.guestData.phone?.trim();
      const cleanEmail = data.guestData.email?.trim();
      if (cleanPhone || cleanEmail) {
        guest = await prisma.guest.findFirst({
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
        guest = await prisma.guest.create({
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

    // Determine stay type category (HOURLY, FIXED, CUSTOM)
    let stayType = 'FIXED';
    const policyRaw = (data.stayType || data.checkoutPolicy || '').toUpperCase();
    if (policyRaw.includes('HOURLY')) {
      stayType = 'HOURLY';
    } else if (policyRaw.includes('CUSTOM')) {
      stayType = 'CUSTOM';
    } else {
      stayType = 'FIXED';
    }

    // Atomic transaction for state transition with extended timeout for cloud database
    const booking = await prisma.$transaction(async (tx) => {
      // Create booking
      const newBooking = await tx.booking.create({
        data: {
          hotelId,
          roomId: data.roomId,
          guestId: guest.id,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nights,
          stayType,
          guestCount: data.guestCount || 1,
          source: data.source || 'MANUAL',
          status: 'CHECKED_IN',
          specialRequests: data.specialRequests,
          internalNotes: data.internalNotes,
          createdById: performedById,
        },
      });

      // Create checkin record
      await tx.checkin.create({
        data: {
          bookingId: newBooking.id,
          hotelId,
          checkedInBy: performedById,
        },
      });

      // Update room status + current booking
      await tx.room.update({
        where: { id: data.roomId },
        data: {
          status: 'OCCUPIED',
          currentBookingId: newBooking.id,
        },
      });

      return newBooking;
    }, { maxWait: 20000, timeout: 35000 });

    // Non-blocking post-checkin tasks (audit, notifications, tv broadcast, reminder)
    prisma.auditLog.create({
      data: {
        hotelId,
        userId: performedById,
        action: 'GUEST_CHECKED_IN',
        resource: 'booking',
        resourceId: booking.id,
        details: {
          guestName: `${guest.firstName} ${guest.lastName}`,
          roomNumber: room.roomNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
        },
        success: true,
      },
    }).catch(() => {});

    // ─── Emit real-time events ────────────────────────────
    const tvPayloadHotelPromise = devicesService.getHotelTvPayload(hotelId, data.roomId);
    const devicePromise = prisma.tvDevice.findFirst({
      where: { roomId: data.roomId, deletedAt: null },
    });

    Promise.all([tvPayloadHotelPromise, devicePromise]).then(([hotelTvPayload, device]) => {
      const guestFullName = `${guest.firstName} ${guest.lastName}`.trim();
      const tvPayload = {
        guestName: guestFullName,
        name: guestFullName,
        guest: {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          name: guestFullName,
        },
        roomId: data.roomId,
        roomNumber: room.roomNumber,
        checkoutTime: hotelTvPayload?.settings?.checkOutTime || '11:00 AM',
        booking: {
          id: booking.id,
          roomNumber: room.roomNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          checkOutTimestamp: new Date(data.checkOutDate).getTime(),
          nights,
          stayType,
          guestCount: data.guestCount || 1,
          checkOutTime: hotelTvPayload?.settings?.checkOutTime || '11:00 AM',
        },
        hotel: hotelTvPayload,
      };

      if (device) {
        emitToDevice(device.id, SOCKET_EVENTS.GUEST_CHECKED_IN, tvPayload);
        emitToDevice(device.id, 'guest.checked_in', tvPayload);
        if (device.deviceId && device.deviceId !== device.id) {
          emitToDevice(device.deviceId, SOCKET_EVENTS.GUEST_CHECKED_IN, tvPayload);
          emitToDevice(device.deviceId, 'guest.checked_in', tvPayload);
        }
      }

      // Broadcast to hotel dashboard & hotel room
      emitToHotel(hotelId, SOCKET_EVENTS.GUEST_CHECKED_IN, tvPayload);
      emitToHotel(hotelId, 'guest.checked_in', tvPayload);
    }).catch(() => {});

    // Schedule checkout reminder according to stay category and hotel settings
    (async () => {
      try {
        const hotelSettings = await prisma.hotelSettings.findUnique({
          where: { hotelId },
          select: {
            checkoutAdvanceHourlyMinutes: true,
            checkoutAdvanceFixedMinutes: true,
            checkoutAdvanceCustomMinutes: true,
          },
        });
        let reminderMinutes = 120;
        if (stayType === 'HOURLY') {
          reminderMinutes = hotelSettings?.checkoutAdvanceHourlyMinutes ?? 20;
        } else if (stayType === 'CUSTOM') {
          reminderMinutes = hotelSettings?.checkoutAdvanceCustomMinutes ?? 120;
        } else {
          reminderMinutes = hotelSettings?.checkoutAdvanceFixedMinutes ?? 120;
        }
        await scheduleCheckoutReminder(
          booking.id,
          hotelId,
          data.checkOutDate,
          reminderMinutes
        );
      } catch (err) {
        console.warn('[CheckinService] Error scheduling checkout reminder:', err);
      }
    })();

    // Create notification
    prisma.notification.create({
      data: {
        hotelId,
        type: 'GUEST_CHECKED_IN',
        title: 'Guest checked in',
        body: `${guest.firstName} ${guest.lastName} checked into Room ${room.roomNumber}`,
        data: { bookingId: booking.id, roomId: data.roomId },
      },
    }).catch(() => {});

    // Invalidate dashboard stats cache
    dashboardService.invalidateDashboardCache(hotelId);

    return {
      ...booking,
      guest,
      room,
    };
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
    }, { maxWait: 15000, timeout: 30000 });


    // ─── Emit real-time events ────────────────────────────
    if (booking.room.device) {
      // Tell TV to clear guest data and return to default
      const clearPayload = {
        bookingId,
        action: 'CLEAR_GUEST',
        roomId: booking.roomId,
        roomNumber: booking.room.roomNumber,
        timestamp: new Date().toISOString(),
      };
      emitToDevice(booking.room.device.id, SOCKET_EVENTS.GUEST_CHECKED_OUT, clearPayload);
      emitToDevice(booking.room.device.id, 'guest.checked_out', clearPayload);
      if (booking.room.device.deviceId && booking.room.device.deviceId !== booking.room.device.id) {
        emitToDevice(booking.room.device.deviceId, SOCKET_EVENTS.GUEST_CHECKED_OUT, clearPayload);
        emitToDevice(booking.room.device.deviceId, 'guest.checked_out', clearPayload);
      }
      emitToHotel(hotelId, SOCKET_EVENTS.GUEST_CHECKED_OUT, clearPayload);
      emitToHotel(hotelId, 'guest.checked_out', clearPayload);
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

