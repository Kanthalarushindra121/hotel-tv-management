import { FastifyRequest, FastifyReply } from 'fastify';
import { roomsService } from './rooms.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class RoomsController {
  async getRooms(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const query = req.query as any;
    const rooms = await roomsService.getRooms(hotelId, {
      status: query.status,
      floor: query.floor ? Number(query.floor) : undefined,
    });
    return reply.send({ success: true, data: rooms });
  }

  async getRoom(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const room = await roomsService.getRoom(hotelId, id);
    return reply.send({ success: true, data: room });
  }

  async createRoom(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const room = await roomsService.createRoom(hotelId, req.body as any, req.user.userId);
    return reply.status(201).send({ success: true, data: room });
  }

  async createRoomsBulk(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { roomNumbers, floor } = req.body as { roomNumbers: string[]; floor?: number };
    const rooms = await roomsService.createRoomsBulk(hotelId, roomNumbers, req.user.userId, floor);
    return reply.status(201).send({ success: true, data: rooms });
  }

  async updateRoom(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const room = await roomsService.updateRoom(hotelId, id, req.body as any, req.user.userId);
    return reply.send({ success: true, data: room });
  }

  async deleteRoom(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const res = await roomsService.deleteRoom(hotelId, id, req.user.userId);
    return reply.send({ success: true, data: res });
  }

  async assignTv(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const { tvDeviceId } = req.body as { tvDeviceId: string };
    const res = await roomsService.assignTv(hotelId, id, tvDeviceId, req.user.userId);
    return reply.send({ success: true, data: res });
  }

  async unassignTv(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const res = await roomsService.unassignTv(hotelId, id, req.user.userId);
    return reply.send({ success: true, data: res });
  }

  async getAvailableRooms(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { devicesService } = await import('../devices/devices.service');
    const rooms = await devicesService.getAvailableRooms(hotelId);
    return reply.send({ success: true, data: rooms });
  }
}

