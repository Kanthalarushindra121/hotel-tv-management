import { FastifyInstance } from 'fastify';
import { GuestsController } from './guests.controller';

export async function guestRoutes(app: FastifyInstance) {
  const ctrl = new GuestsController();

  app.get('/guests', {
    preHandler: [app.authenticate],
    handler: ctrl.getGuests.bind(ctrl),
  });

  app.get('/guests/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.getGuest.bind(ctrl),
  });

  app.post('/guests', {
    preHandler: [app.authenticate],
    handler: ctrl.createGuest.bind(ctrl),
  });

  app.put('/guests/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.updateGuest.bind(ctrl),
  });
}

