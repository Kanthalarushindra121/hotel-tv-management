import { FastifyRequest, FastifyReply } from 'fastify';
import { hotelsService } from './hotels.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class HotelsController {
  async getHotel(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const hotel = await hotelsService.getHotel(hotelId);
    return reply.send({ success: true, data: hotel });
  }

  async updateHotel(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const updated = await hotelsService.updateHotel(hotelId, req.body as any, req.user.userId);
    return reply.send({ success: true, data: updated });
  }

  async updateSettings(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const updated = await hotelsService.updateSettings(hotelId, req.body as any, req.user.userId);
    return reply.send({ success: true, data: updated });
  }

  async updateWifi(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const updated = await hotelsService.updateWifi(hotelId, req.body as any, req.user.userId);
    return reply.send({ success: true, data: updated });
  }

  async getWifi(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const hotel = await hotelsService.getHotel(hotelId);
    return reply.send({ success: true, data: hotel?.wifiSettings || null });
  }

  async getDashboardStats(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const stats = await hotelsService.getDashboardStats(hotelId);
    return reply.send({ success: true, data: stats });
  }

  async getAmenities(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const hotel = await hotelsService.getHotel(hotelId);
    return reply.send({ success: true, data: hotel?.amenities || [] });
  }

  async updateAmenities(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const body = req.body as any;
    const amenities = Array.isArray(body) ? body : body?.amenities || [];
    const res = await hotelsService.updateAmenities(hotelId, amenities);
    return reply.send({ success: true, data: res });
  }

  async updateHouseRules(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { rules } = req.body as { rules: string[] };
    const res = await hotelsService.updateHouseRules(hotelId, rules);
    return reply.send({ success: true, data: res });
  }

  async updateCheckoutSteps(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { steps } = req.body as { steps: string[] };
    const res = await hotelsService.updateCheckoutSteps(hotelId, steps);
    return reply.send({ success: true, data: res });
  }

  async getScreensaver(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const config = await hotelsService.getScreensaverConfig(hotelId);
    return reply.send({ success: true, data: config });
  }

  async updateScreensaver(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const config = await hotelsService.updateScreensaverConfig(hotelId, req.body, req.user.userId);
    return reply.send({ success: true, data: config });
  }
}

export const hotelsController = new HotelsController();

