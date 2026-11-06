import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../core/errors';
import { BookingStatus } from '@prisma/client';
import dayjs from 'dayjs';

export class BookingsService {
  async getBookings(hotelId: string, filters?: { status?: BookingStatus; roomId?: string }) {
    const where: any = { hotelId, deletedAt: null };
    if (filters?.status) where.status = filters.status;
    if (filters?.roomId) where.roomId = filters.roomId;

    return prisma.booking.findMany({
      where,
      include: {
        guest: true,
        room: true,
        checkin: true,
        checkout: true,
      },
      orderBy: { checkInDate: 'desc' },
    });
  }

  async getBooking(hotelId: string, bookingId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId, deletedAt: null },
      include: {
        guest: true,
        room: { include: { device: true } },
        checkin: true,
        checkout: true,
      },
    });
    if (!booking) throw new NotFoundError('Booking', bookingId);
    return booking;
  }

  async createBooking(
    hotelId: string,
    data: {
      roomId: string;
      guestId: string;
      checkInDate: Date;
      checkOutDate: Date;
      guestCount?: number;
      specialRequests?: string;
    },
    userId: string
  ) {
    const nights = dayjs(data.checkOutDate).diff(dayjs(data.checkInDate), 'day');
    if (nights <= 0) {
      throw new AppError('Checkout date must be after check-in date', 400);
    }

    const booking = await prisma.booking.create({
      data: {
        hotelId,
        roomId: data.roomId,
        guestId: data.guestId,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nights,
        guestCount: data.guestCount ?? 1,
        specialRequests: data.specialRequests,
        status: 'CONFIRMED',
        createdById: userId,
      },
      include: { guest: true, room: true },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'BOOKING_CREATED',
        resource: 'booking',
        resourceId: booking.id,
        details: { roomId: data.roomId, guestId: data.guestId },
        success: true,
      },
    });

    return booking;
  }

  async cancelBooking(hotelId: string, bookingId: string, userId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId, deletedAt: null },
    });
    if (!booking) throw new NotFoundError('Booking', bookingId);

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'BOOKING_CANCELLED',
        resource: 'booking',
        resourceId: bookingId,
        success: true,
      },
    });

    return updated;
  }
}

export const bookingsService = new BookingsService();

