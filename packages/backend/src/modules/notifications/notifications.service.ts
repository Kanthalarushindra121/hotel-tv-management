import { prisma } from '../../config/database';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class NotificationsService {
  async getNotifications(hotelId: string, userId?: string) {
    return prisma.notification.findMany({
      where: {
        hotelId,
        OR: [{ userId: null }, { userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, hotelId: string) {
    return prisma.notification.updateMany({
      where: { id, hotelId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(hotelId: string) {
    return prisma.notification.updateMany({
      where: { hotelId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

export const notificationsService = new NotificationsService();

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', {
    preHandler: [app.authenticate],
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const hotelId = getTenantHotelId(req);
      const list = await notificationsService.getNotifications(hotelId, req.user.userId);
      return reply.send({ success: true, data: list });
    },
  });

  app.post('/notifications/:id/read', {
    preHandler: [app.authenticate],
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const hotelId = getTenantHotelId(req);
      const { id } = req.params as { id: string };
      await notificationsService.markAsRead(id, hotelId);
      return reply.send({ success: true });
    },
  });

  app.post('/notifications/read-all', {
    preHandler: [app.authenticate],
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const hotelId = getTenantHotelId(req);
      await notificationsService.markAllAsRead(hotelId);
      return reply.send({ success: true });
    },
  });
}

