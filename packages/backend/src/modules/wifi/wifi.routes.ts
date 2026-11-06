import { FastifyInstance } from 'fastify';
import { WifiController } from './wifi.controller';

export async function wifiRoutes(app: FastifyInstance) {
  const ctrl = new WifiController();

  app.get('/wifi', {
    preHandler: [app.requireHotel],
    handler: ctrl.listZones.bind(ctrl),
  });

  app.post('/wifi', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.createZone.bind(ctrl),
  });

  app.get('/wifi/:zoneId', {
    preHandler: [app.requireHotel],
    handler: ctrl.getZone.bind(ctrl),
  });

  app.put('/wifi/:zoneId', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.updateZone.bind(ctrl),
  });

  app.delete('/wifi/:zoneId', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.deleteZone.bind(ctrl),
  });

  app.post('/wifi/:zoneId/assign-rooms', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.assignRooms.bind(ctrl),
  });

  app.get('/wifi/room/:roomId/qr', {
    preHandler: [app.requireHotel],
    handler: ctrl.getRoomQr.bind(ctrl),
  });
}
