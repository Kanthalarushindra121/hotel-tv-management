import { FastifyInstance } from 'fastify';
import { setupAuthMiddleware } from '../core/middleware/auth.middleware';
import { AppError } from '../core/errors';

import { authRoutes } from '../modules/auth/auth.routes';
import { hotelRoutes } from '../modules/hotels/hotels.routes';
import { roomRoutes } from '../modules/rooms/rooms.routes';
import { guestRoutes } from '../modules/guests/guests.routes';
import { bookingRoutes } from '../modules/bookings/bookings.routes';
import { checkinRoutes } from '../modules/checkins/checkins.routes';
import { deviceRoutes } from '../modules/devices/devices.routes';
import { notificationRoutes } from '../modules/notifications/notifications.service';
import { adminRoutes } from '../modules/admin/admin.service';
import { wifiRoutes } from '../modules/wifi/wifi.routes';
import { policyRoutes } from '../modules/policies/policies.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { staffRoutes } from '../modules/staff/staff.routes';

export async function registerRoutes(app: FastifyInstance) {
  // Setup JWT & role middleware decorators
  setupAuthMiddleware(app);

  // Global Error Handler
  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.validation,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'An internal server error occurred',
    });
  });

  // Register modular API routes with /api/v1 prefix
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(hotelRoutes, { prefix: '/api/v1' });
  await app.register(roomRoutes, { prefix: '/api/v1' });
  await app.register(guestRoutes, { prefix: '/api/v1' });
  await app.register(bookingRoutes, { prefix: '/api/v1' });
  await app.register(checkinRoutes, { prefix: '/api/v1' });
  await app.register(deviceRoutes, { prefix: '/api/v1' });
  await app.register(notificationRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(wifiRoutes, { prefix: '/api/v1' });
  await app.register(policyRoutes, { prefix: '/api/v1' });
  await app.register(dashboardRoutes, { prefix: '/api/v1' });
  await app.register(staffRoutes, { prefix: '/api/v1' });
}

