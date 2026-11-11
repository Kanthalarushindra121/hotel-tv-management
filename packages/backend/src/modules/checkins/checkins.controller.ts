import { FastifyRequest, FastifyReply } from 'fastify';
import { checkinService } from './checkins.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';
import { prisma } from '../../config/database';

export class CheckinsController {
  async checkIn(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const body = req.body as any;

    // Parse guest name (support both structured guestData and flat guestName)
    let firstName = body.guestData?.firstName || body.firstName;
    let lastName = body.guestData?.lastName || body.lastName || '';
    if (!firstName && body.guestName) {
      const parts = String(body.guestName).trim().split(/\s+/);
      firstName = parts[0] || 'Guest';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName) firstName = 'Guest';

    // Parse checkInDate (defaults to right now if not provided)
    let checkInDate = body.checkInDate ? new Date(body.checkInDate) : new Date();
    if (isNaN(checkInDate.getTime())) checkInDate = new Date();

    // Parse checkOutDate (supports custom date/time, hourly duration, or nights)
    let checkOutDate: Date | null = null;
    const rawCheckOut = body.checkOutDate || body.checkOut;
    if (rawCheckOut && String(rawCheckOut).trim()) {
      const parsed = new Date(rawCheckOut);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > checkInDate.getTime()) {
        checkOutDate = parsed;
      }
    }

    if (!checkOutDate) {
      const hours = Number(body.hours || body.stayHours);
      if (hours && hours > 0) {
        checkOutDate = new Date(checkInDate.getTime() + hours * 60 * 60 * 1000);
      } else {
        const nights = Math.max(1, Number(body.nights) || 1);
        const hotelSettings = await prisma.hotelSettings.findUnique({
          where: { hotelId },
          select: { checkOutTime: true },
        });
        const rawTime = (hotelSettings?.checkOutTime || '11:00').trim();
        let targetHour = 11;
        let targetMin = 0;
        const match = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (match) {
          targetHour = parseInt(match[1], 10);
          targetMin = parseInt(match[2], 10);
          const period = match[3]?.toUpperCase();
          if (period === 'PM' && targetHour < 12) targetHour += 12;
          if (period === 'AM' && targetHour === 12) targetHour = 0;
        }
        checkOutDate = new Date(checkInDate.getTime());
        checkOutDate.setDate(checkOutDate.getDate() + nights);
        checkOutDate.setHours(targetHour, targetMin, 0, 0);
      }
    }

    const guestData = body.guestData || {
      firstName,
      lastName,
      phone: body.phone && String(body.phone).trim() ? String(body.phone).trim() : undefined,
      email: body.email && String(body.email).trim() ? String(body.email).trim() : undefined,
    };

    const booking = await checkinService.checkIn(
      hotelId,
      {
        guestId: body.guestId,
        guestData,
        roomId: body.roomId,
        checkInDate,
        checkOutDate,
        guestCount: Number(body.guestCount) || 1,
        specialRequests: body.specialRequests || undefined,
        internalNotes: body.internalNotes || undefined,
        source: body.source || 'MANUAL',
        forceCheckIn: Boolean(body.forceCheckIn),
        stayType: body.stayType || body.checkoutPolicy,
        checkoutPolicy: body.checkoutPolicy,
      },
      req.user.userId
    );
    return reply.status(201).send({
      success: true,
      message: 'Guest successfully checked in. TV updated.',
      data: booking,
    });
  }

  async checkOut(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const body = (req.body || {}) as any;
    const params = (req.params || {}) as any;
    const bookingId = params.bookingId || body.bookingId;
    const res = await checkinService.checkOut(hotelId, bookingId, body, req.user.userId);
    return reply.send({ success: true, data: res });
  }

  async getTodayActivity(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const activity = await checkinService.getTodayActivity(hotelId, 'Asia/Kolkata');
    return reply.send({ success: true, data: activity });
  }
}

