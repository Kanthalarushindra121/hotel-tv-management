import { FastifyInstance } from 'fastify';
import { PoliciesController } from './policies.controller';

export async function policyRoutes(app: FastifyInstance) {
  const ctrl = new PoliciesController();

  app.get('/policies/hotel/default', {
    preHandler: [app.requireHotel],
    handler: ctrl.getHotelDefault.bind(ctrl),
  });

  app.put('/policies/hotel/default', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.setHotelDefault.bind(ctrl),
  });

  app.get('/policies/room/:roomId', {
    preHandler: [app.requireHotel],
    handler: ctrl.getRoomPolicy.bind(ctrl),
  });

  app.put('/policies/room/:roomId', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.setRoomPolicy.bind(ctrl),
  });
}
