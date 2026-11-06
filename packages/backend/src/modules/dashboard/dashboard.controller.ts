import { FastifyRequest, FastifyReply } from 'fastify';
import { dashboardService } from './dashboard.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class DashboardController {
  async getStats(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const tz = (req.query as any)?.timezone;
    const stats = await dashboardService.getDashboardStats(hotelId, tz);
    return reply.send({ success: true, data: stats });
  }

  async getActivity(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const limit = (req.query as any)?.limit ? Number((req.query as any).limit) : 20;
    const activity = await dashboardService.getRecentActivity(hotelId, limit);
    return reply.send({ success: true, data: activity });
  }

  async getUpcomingCheckouts(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const tz = (req.query as any)?.timezone;
    const checkouts = await dashboardService.getUpcomingCheckouts(hotelId, tz);
    return reply.send({ success: true, data: checkouts });
  }
}
