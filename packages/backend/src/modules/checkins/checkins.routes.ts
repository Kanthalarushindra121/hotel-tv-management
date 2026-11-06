import { FastifyInstance } from 'fastify';
import { CheckinsController } from './checkins.controller';

export async function checkinRoutes(app: FastifyInstance) {
  const ctrl = new CheckinsController();

  app.post('/checkins', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.checkIn.bind(ctrl),
  });

  app.post('/checkins/check-in', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.checkIn.bind(ctrl),
  });

  app.post('/checkouts', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.checkOut.bind(ctrl),
  });

  app.post('/checkins/check-out/:bookingId', {
    preHandler: [app.requireRole('OWNER', 'ADMIN', 'RECEPTIONIST')],
    handler: ctrl.checkOut.bind(ctrl),
  });

  app.get('/today', {
    preHandler: [app.authenticate],
    handler: ctrl.getTodayActivity.bind(ctrl),
  });
}

