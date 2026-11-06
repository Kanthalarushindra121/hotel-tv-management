import { FastifyInstance } from 'fastify';
import { StaffController } from './staff.controller';

export async function staffRoutes(app: FastifyInstance) {
  const ctrl = new StaffController();

  app.get('/staff', {
    preHandler: [app.requireHotel],
    handler: ctrl.listStaff.bind(ctrl),
  });

  app.post('/staff', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.createStaff.bind(ctrl),
  });

  app.put('/staff/:userId/role', {
    preHandler: [app.requireRole('OWNER')],
    handler: ctrl.updateRole.bind(ctrl),
  });

  app.put('/staff/:userId/status', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.toggleStatus.bind(ctrl),
  });

  app.delete('/staff/:userId', {
    preHandler: [app.requireRole('OWNER', 'ADMIN')],
    handler: ctrl.deleteStaff.bind(ctrl),
  });
}
