import { FastifyRequest, FastifyReply } from 'fastify';
import { bookingsService } from './bookings.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class BookingsController {
  async getBookings(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const query = req.query as any;
    const bookings = await bookingsService.getBookings(hotelId, {
      status: query.status,
      roomId: query.roomId,
    });
    return reply.send({ success: true, data: bookings });
  }

  async getBooking(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const booking = await bookingsService.getBooking(hotelId, id);
    return reply.send({ success: true, data: booking });
  }

  async createBooking(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const booking = await bookingsService.createBooking(hotelId, req.body as any, req.user.userId);
    return reply.status(201).send({ success: true, data: booking });
  }

  async cancelBooking(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const booking = await bookingsService.cancelBooking(hotelId, id, req.user.userId);
    return reply.send({ success: true, data: booking });
  }
}

