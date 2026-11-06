import { FastifyRequest, FastifyReply } from 'fastify';
import { staffService } from './staff.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';
import { UserRole } from '@prisma/client';

export class StaffController {
  async listStaff(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const staff = await staffService.listStaff(hotelId);
    return reply.send({ success: true, data: staff });
  }

  async createStaff(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const user = await staffService.createStaff(hotelId, req.body as any, req.user.userId);
    return reply.status(201).send({ success: true, data: user });
  }

  async updateRole(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { userId } = req.params as { userId: string };
    const { role } = req.body as { role: UserRole };
    const user = await staffService.updateStaffRole(hotelId, userId, role, req.user.userId);
    return reply.send({ success: true, data: user });
  }

  async toggleStatus(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { userId } = req.params as { userId: string };
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    const user = await staffService.toggleStaffActive(hotelId, userId, req.user.userId, isActive);
    return reply.send({ success: true, data: user });
  }

  async deleteStaff(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { userId } = req.params as { userId: string };
    const result = await staffService.deleteStaff(hotelId, userId, req.user.userId);
    return reply.send(result);
  }
}
