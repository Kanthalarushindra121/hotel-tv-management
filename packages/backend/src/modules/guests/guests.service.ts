import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../core/errors';

export class GuestsService {
  async getGuests(hotelId: string, search?: string, page = 1, limit = 20) {
    const where: any = { hotelId, deletedAt: null };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        include: {
          bookings: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { room: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.guest.count({ where }),
    ]);

    return {
      guests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async deleteGuest(hotelId: string, guestId: string, userId?: string) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, hotelId, deletedAt: null },
    });
    if (!guest) throw new NotFoundError('Guest', guestId);

    await prisma.guest.update({
      where: { id: guestId },
      data: { deletedAt: new Date() },
    });

    try {
      await prisma.auditLog.create({
        data: {
          hotelId,
          userId: userId || null,
          action: 'GUEST_UPDATED',
          resource: 'guest',
          resourceId: guestId,
          details: { action: 'DELETED', name: `${guest.firstName} ${guest.lastName}` },
          success: true,
        },
      });
    } catch {}

    return { success: true, message: 'Guest record removed successfully' };
  }

  async getGuest(hotelId: string, guestId: string) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, hotelId, deletedAt: null },
      include: {
        bookings: {
          include: { room: true, checkin: true, checkout: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!guest) throw new NotFoundError('Guest', guestId);
    return guest;
  }

  async createGuest(
    hotelId: string,
    data: { firstName: string; lastName: string; email?: string; phone?: string; nationality?: string; notes?: string },
    userId: string
  ) {
    const guest = await prisma.guest.create({
      data: {
        hotelId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        nationality: data.nationality,
        notes: data.notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'GUEST_CREATED',
        resource: 'guest',
        resourceId: guest.id,
        details: { name: `${guest.firstName} ${guest.lastName}` },
        success: true,
      },
    });

    return guest;
  }

  async updateGuest(
    hotelId: string,
    guestId: string,
    data: { firstName?: string; lastName?: string; email?: string; phone?: string; notes?: string },
    userId: string
  ) {
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, hotelId, deletedAt: null },
    });
    if (!guest) throw new NotFoundError('Guest', guestId);

    const updated = await prisma.guest.update({
      where: { id: guestId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'GUEST_UPDATED',
        resource: 'guest',
        resourceId: guestId,
        details: data,
        success: true,
      },
    });

    return updated;
  }
}

export const guestsService = new GuestsService();

