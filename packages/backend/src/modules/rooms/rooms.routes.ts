import { FastifyInstance } from 'fastify';
import { RoomsController } from './rooms.controller';

export async function roomRoutes(app: FastifyInstance) {
  const ctrl = new RoomsController();

  app.get('/rooms', {
    preHandler: [app.authenticate],
    handler: ctrl.getRooms.bind(ctrl),
  });

  app.get('/rooms/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.getRoom.bind(ctrl),
  });

  app.post('/rooms', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.createRoom.bind(ctrl),
  });

  app.post('/rooms/bulk', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.createRoomsBulk.bind(ctrl),
  });

  app.put('/rooms/:id', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.updateRoom.bind(ctrl),
  });

  app.delete('/rooms/:id', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.deleteRoom.bind(ctrl),
  });

  // Assign TV to room
  app.post('/rooms/:id/assign-tv', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.assignTv.bind(ctrl),
  });

  // Unassign TV from room
  app.post('/rooms/:id/unassign-tv', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.unassignTv.bind(ctrl),
  });

  // Available rooms without an assigned TV
  app.get('/rooms/available', {
    preHandler: [app.authenticate],
    handler: ctrl.getAvailableRooms.bind(ctrl),
  });
}

