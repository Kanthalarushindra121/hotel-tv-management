import { FastifyRequest, FastifyReply } from 'fastify';
import { wifiService } from './wifi.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class WifiController {
  async listZones(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const zones = await wifiService.listZones(hotelId);
    return reply.send({ success: true, data: zones });
  }

  async getZone(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { zoneId } = req.params as { zoneId: string };
    const zone = await wifiService.getZone(hotelId, zoneId);
    return reply.send({ success: true, data: zone });
  }

  async createZone(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const zone = await wifiService.createZone(hotelId, req.body as any, req.user?.userId);
    return reply.status(201).send({ success: true, data: zone });
  }

  async updateZone(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { zoneId } = req.params as { zoneId: string };
    const zone = await wifiService.updateZone(hotelId, zoneId, req.body as any, req.user?.userId);
    return reply.send({ success: true, data: zone });
  }

  async deleteZone(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { zoneId } = req.params as { zoneId: string };
    const result = await wifiService.deleteZone(hotelId, zoneId, req.user?.userId);
    return reply.send(result);
  }

  async assignRooms(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { zoneId } = req.params as { zoneId: string };
    const { roomIds } = req.body as { roomIds: string[] };
    const result = await wifiService.assignRoomsToZone(hotelId, zoneId, roomIds, req.user?.userId);
    return reply.send(result);
  }

  async getRoomQr(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { roomId } = req.params as { roomId: string };
    const qrData = await wifiService.getZoneQrData(hotelId, roomId);
    return reply.send({ success: true, data: qrData });
  }
}
