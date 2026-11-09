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

  // Connection and Fleet Diagnostics (Accessible by authenticated users)
  app.get('/devices/diagnostics/system', {
    preHandler: [app.authenticate],
    handler: ctrl.getDiagnostics.bind(ctrl),
  });

  // Dashboard authenticated routes
  app.get('/devices', {
    preHandler: [app.authenticate],
    handler: ctrl.getHotelDevices.bind(ctrl),
  });

  app.get('/devices/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.getDevice.bind(ctrl),
  });

  // Remote Commands with TV ACK
  app.post('/devices/:id/command', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.sendCommand.bind(ctrl),
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

  // Assign TV to Room
  app.post('/devices/:id/assign', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.assignDevice.bind(ctrl),
  });

  // Unassign TV from Room
  app.post('/devices/:id/unassign', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.unassignDevice.bind(ctrl),
  });

  // Safe Delete TV Device
  app.delete('/devices/:id', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.deleteDevice.bind(ctrl),
  });

  // Get available unassigned TV devices
  app.get('/devices/available', {
    preHandler: [app.authenticate],
    handler: ctrl.getAvailableDevices.bind(ctrl),
  });
}

