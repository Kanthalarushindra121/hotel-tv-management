import { FastifyRequest, FastifyReply } from 'fastify';
import { guestsService } from './guests.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class GuestsController {
  async getGuests(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const query = req.query as any;
    const res = await guestsService.getGuests(
      hotelId,
      query.search,
      query.page ? Number(query.page) : 1,
      query.limit ? Number(query.limit) : 20
    );
    return reply.send({ success: true, ...res });
  }

  async getGuest(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const guest = await guestsService.getGuest(hotelId, id);
    return reply.send({ success: true, data: guest });
  }

  async createGuest(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const guest = await guestsService.createGuest(hotelId, req.body as any, req.user.userId);
    return reply.status(201).send({ success: true, data: guest });
  }

  async updateGuest(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const guest = await guestsService.updateGuest(hotelId, id, req.body as any, req.user.userId);
    return reply.send({ success: true, data: guest });
  }
}

