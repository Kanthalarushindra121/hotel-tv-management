import { FastifyInstance } from 'fastify';
import { hotelsController } from './hotels.controller';

export async function hotelRoutes(app: FastifyInstance) {
  // Get Hotel profile
  app.get('/hotel', {
    preHandler: [app.authenticate],
    handler: hotelsController.getHotel.bind(hotelsController),
  });
  app.get('/hotel/profile', {
    preHandler: [app.authenticate],
    handler: hotelsController.getHotel.bind(hotelsController),
  });
  app.get('/hotels/profile', {
    preHandler: [app.authenticate],
    handler: hotelsController.getHotel.bind(hotelsController),
  });

  // Update Hotel profile
  app.put('/hotel', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateHotel.bind(hotelsController),
  });
  app.put('/hotel/profile', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateHotel.bind(hotelsController),
  });
  app.put('/hotels/profile', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateHotel.bind(hotelsController),
  });

  // Settings
  app.put('/hotel/settings', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateSettings.bind(hotelsController),
  });
  app.put('/hotels/settings', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateSettings.bind(hotelsController),
  });

  // Wi-Fi
  app.get('/hotel/wifi', {
    preHandler: [app.authenticate],
    handler: hotelsController.getWifi.bind(hotelsController),
  });
  app.get('/hotels/wifi', {
    preHandler: [app.authenticate],
    handler: hotelsController.getWifi.bind(hotelsController),
  });
  app.put('/hotel/wifi', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateWifi.bind(hotelsController),
  });
  app.put('/hotels/wifi', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateWifi.bind(hotelsController),
  });

  // Stats
  app.get('/hotel/stats', {
    preHandler: [app.authenticate],
    handler: hotelsController.getDashboardStats.bind(hotelsController),
  });
  app.get('/hotels/stats', {
    preHandler: [app.authenticate],
    handler: hotelsController.getDashboardStats.bind(hotelsController),
  });

  // Amenities
  app.get('/hotel/amenities', {
    preHandler: [app.authenticate],
    handler: hotelsController.getAmenities.bind(hotelsController),
  });
  app.get('/hotels/amenities', {
    preHandler: [app.authenticate],
    handler: hotelsController.getAmenities.bind(hotelsController),
  });
  app.put('/hotel/amenities', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateAmenities.bind(hotelsController),
  });
  app.put('/hotels/amenities', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateAmenities.bind(hotelsController),
  });

  app.put('/hotel/house-rules', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateHouseRules.bind(hotelsController),
  });

  app.put('/hotel/checkout-steps', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateCheckoutSteps.bind(hotelsController),
  });

  // Screensaver Settings
  app.get('/hotel/screensaver', {
    preHandler: [app.authenticate],
    handler: hotelsController.getScreensaver.bind(hotelsController),
  });
  app.get('/hotels/screensaver', {
    preHandler: [app.authenticate],
    handler: hotelsController.getScreensaver.bind(hotelsController),
  });
  app.put('/hotel/screensaver', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateScreensaver.bind(hotelsController),
  });
  app.put('/hotels/screensaver', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: hotelsController.updateScreensaver.bind(hotelsController),
  });
}

