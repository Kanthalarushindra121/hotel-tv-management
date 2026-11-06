import { FastifyInstance } from 'fastify';
import { DashboardController } from './dashboard.controller';

export async function dashboardRoutes(app: FastifyInstance) {
  const ctrl = new DashboardController();

  app.get('/dashboard/stats', {
    preHandler: [app.requireHotel],
    handler: ctrl.getStats.bind(ctrl),
  });

  app.get('/dashboard/activity', {
    preHandler: [app.requireHotel],
    handler: ctrl.getActivity.bind(ctrl),
  });

  app.get('/dashboard/upcoming-checkouts', {
    preHandler: [app.requireHotel],
    handler: ctrl.getUpcomingCheckouts.bind(ctrl),
  });
}
