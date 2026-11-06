import { FastifyInstance } from 'fastify';
import { BookingsController } from './bookings.controller';

export async function bookingRoutes(app: FastifyInstance) {
  const ctrl = new BookingsController();

  app.get('/bookings', {
    preHandler: [app.authenticate],
    handler: ctrl.getBookings.bind(ctrl),
  });

  app.get('/bookings/:id', {
    preHandler: [app.authenticate],
    handler: ctrl.getBooking.bind(ctrl),
  });

  app.post('/bookings', {
    preHandler: [app.authenticate],
    handler: ctrl.createBooking.bind(ctrl),
  });

  app.post('/bookings/:id/cancel', {
    preHandler: [app.authenticate],
    handler: ctrl.cancelBooking.bind(ctrl),
  });
}

