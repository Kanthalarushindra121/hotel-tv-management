import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { emitToHotel, emitToDevice, SOCKET_EVENTS } from '../../core/realtime/socket';
import { devicesService } from '../devices/devices.service';
import { auditService } from '../audit/audit.service';
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
  }, performedById: string) {
    // Validate room belongs to hotel
    const room = await prisma.room.findFirst({
      where: { id: data.roomId, hotelId, deletedAt: null },
      include: {
        currentBooking: { include: { guest: true } },
        device: true,
      },
    });

    if (!room) throw new NotFoundError('Room', data.roomId);

    // Check for active booking conflict
    if (room.currentBooking) {
      throw new ConflictError(
        `Room ${room.roomNumber} already has an active guest: ${room.currentBooking.guest.firstName} ${room.currentBooking.guest.lastName}. Check them out first.`
      );
    }

    // Check for overlapping bookings
    const overlapping = await prisma.booking.findFirst({
      where: {
        roomId: data.roomId,
        hotelId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        deletedAt: null,
        OR: [
          {
            checkInDate: { lte: data.checkOutDate },
            checkOutDate: { gte: data.checkInDate },
          },
        ],
      },
    });
    if (overlapping) {
      throw new ConflictError('Room has an overlapping booking for the selected dates');
    }

    // Calculate nights
    const nights = dayjs(data.checkOutDate).diff(dayjs(data.checkInDate), 'day');
    if (nights <= 0) {
      throw new AppError('Checkout date must be after check-in date', 400);
    }

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

    if (device?.isOnline) {
      // Send personalized guest data to TV
      emitToDevice(device.id, SOCKET_EVENTS.GUEST_CHECKED_IN, {
        guest: {
          firstName: result.guest.firstName,
          // Only send first name to TV — privacy
        },
        booking: {
          id: result.booking.id,
          roomNumber: room.roomNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nights,
          guestCount: data.guestCount || 1,
          checkOutTime: hotel?.settings?.checkOutTime || '11:00',
        },
        hotel: await devicesService.getHotelTvPayload(hotelId, data.roomId),
      });
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
    if (booking.room.device?.isOnline) {
      // Tell TV to clear guest data and return to default
      emitToDevice(booking.room.device.id, SOCKET_EVENTS.GUEST_CHECKED_OUT, {
        bookingId,
        timestamp: new Date().toISOString(),
      });
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

