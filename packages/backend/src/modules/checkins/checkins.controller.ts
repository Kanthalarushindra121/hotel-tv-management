import { FastifyRequest, FastifyReply } from 'fastify';
import { checkinService } from './checkins.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

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

    // Parse checkOutDate (defaults to checkInDate + nights if not provided or empty)
    let checkOutDate: Date;
    if (body.checkOutDate) {
      checkOutDate = new Date(body.checkOutDate);
    } else if (body.checkOut && String(body.checkOut).trim()) {
      checkOutDate = new Date(body.checkOut);
    } else {
      const nights = Math.max(1, Number(body.nights) || 1);
      checkOutDate = new Date(checkInDate.getTime() + nights * 24 * 60 * 60 * 1000);
    }
    if (isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
      const nights = Math.max(1, Number(body.nights) || 1);
      checkOutDate = new Date(checkInDate.getTime() + nights * 24 * 60 * 60 * 1000);
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

