import { FastifyInstance } from 'fastify';
import { DevicesController } from './devices.controller';

export async function deviceRoutes(app: FastifyInstance) {
  const ctrl = new DevicesController();

  // TV Device self-pairing endpoint (no user login required)
  app.post('/devices/pairing/initiate', ctrl.initiatePairing.bind(ctrl));

  // TV Heartbeat
  app.post('/devices/:id/heartbeat', ctrl.heartbeat.bind(ctrl));

  // TV Payload (publicly syncable for paired device via TV token/hotelId)
  app.get('/devices/payload/:hotelId', ctrl.getTvPayload.bind(ctrl));

  // Dashboard authenticated routes
  app.get('/devices', {
    preHandler: [app.authenticate],
    handler: ctrl.getHotelDevices.bind(ctrl),
  });

  app.get('/devices/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.getDevice.bind(ctrl),
  });

  // Validate pairing code before creating room
  app.post('/devices/pairing/validate', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.validatePairingCode.bind(ctrl),
  });

  app.post('/devices/pairing/confirm', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.confirmPairing.bind(ctrl),
  });

  app.post('/devices/:id/refresh', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.refreshDevice.bind(ctrl),
  });

  app.post('/devices/:id/unpair', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.unpairDevice.bind(ctrl),
  });

  app.put('/devices/:id/move', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.moveDevice.bind(ctrl),
  });
}

