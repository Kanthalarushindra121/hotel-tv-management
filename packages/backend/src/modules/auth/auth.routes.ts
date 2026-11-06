import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthController } from './auth.controller';

export async function authRoutes(app: FastifyInstance) {
  const ctrl = new AuthController();

  app.post('/auth/register', {
    schema: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        hotelName: z.string().min(2),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        logoUrl: z.string().optional(),
      }),
    },
    handler: ctrl.register.bind(ctrl),
  });

  app.post('/auth/login', {
    schema: {
      body: z.object({
        email: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
        identifier: z.string().min(1).optional(),
        password: z.string().min(1),
      }),
    },
    handler: ctrl.login.bind(ctrl),
  });

  app.post('/auth/refresh', {
    schema: {
      body: z.object({
        refreshToken: z.string().min(1),
      }),
    },
    handler: ctrl.refreshToken.bind(ctrl),
  });

  app.post('/auth/logout', {
    preHandler: [app.authenticate],
    handler: ctrl.logout.bind(ctrl),
  });

  app.post('/auth/forgot-password', {
    schema: {
      body: z.object({
        email: z.string().email(),
      }),
    },
    handler: ctrl.forgotPassword.bind(ctrl),
  });

  app.post('/auth/reset-password', {
    schema: {
      body: z.object({
        token: z.string().min(1),
        password: z.string().min(8),
      }),
    },
    handler: ctrl.resetPassword.bind(ctrl),
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
    handler: ctrl.me.bind(ctrl),
  });
}

