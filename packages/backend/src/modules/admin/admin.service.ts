import { prisma } from '../../config/database';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export class AdminService {
  async getPlatformStats() {
    const [totalHotels, totalUsers, totalDevices, onlineDevices, activeBookings] = await Promise.all([
      prisma.hotel.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.tvDevice.count({ where: { deletedAt: null } }),
      prisma.tvDevice.count({ where: { isOnline: true, deletedAt: null } }),
      prisma.booking.count({ where: { status: 'CHECKED_IN', deletedAt: null } }),
    ]);

    return { totalHotels, totalUsers, totalDevices, onlineDevices, activeBookings };
  }

  async getAllHotels() {
    return prisma.hotel.findMany({
      where: { deletedAt: null },
      include: {
        subscription: true,
        _count: { select: { rooms: true, devices: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const adminService = new AdminService();

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/stats', {
    preHandler: [app.requireSuperAdmin],
    handler: async (_req: FastifyRequest, reply: FastifyReply) => {
      const stats = await adminService.getPlatformStats();
      return reply.send({ success: true, data: stats });
    },
  });

  app.get('/admin/hotels', {
    preHandler: [app.requireSuperAdmin],
    handler: async (_req: FastifyRequest, reply: FastifyReply) => {
      const hotels = await adminService.getAllHotels();
      return reply.send({ success: true, data: hotels });
    },
  });
}

