import { FastifyRequest, FastifyReply } from 'fastify';
import { policiesService } from './policies.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class PoliciesController {
  async getHotelDefault(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const policy = await policiesService.getHotelDefaultPolicy(hotelId);
    return reply.send({ success: true, data: policy });
  }

  async setHotelDefault(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const policy = await policiesService.setHotelDefaultPolicy(hotelId, req.body as any, req.user?.userId);
    return reply.send({ success: true, data: policy });
  }

  async getRoomPolicy(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { roomId } = req.params as { roomId: string };
    const policy = await policiesService.getRoomPolicy(hotelId, roomId);
    return reply.send({ success: true, data: policy });
  }

  async setRoomPolicy(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { roomId } = req.params as { roomId: string };
    const policy = await policiesService.setRoomPolicy(hotelId, roomId, req.body as any, req.user?.userId);
    return reply.send({ success: true, data: policy });
  }
}
