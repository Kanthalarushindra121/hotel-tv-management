import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import { auditService } from '../audit/audit.service';

export class AuthController {
  async register(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as any;

    const result = await authService.register(body);

    await auditService.log({
      userId: result.user.id,
      hotelId: result.hotel.id,
      action: 'USER_CREATED',
      resource: 'user',
      resourceId: result.user.id,
      details: { email: result.user.email, role: 'OWNER' },
      ipAddress: req.ip,
      success: true,
    });

    return reply.status(201).send({
      success: true,
      data: result,
    });
  }

  async login(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as any;
    const identifier = body.email || body.username || body.identifier;
    const { password } = body;

    const result = await authService.login(
      identifier,
      password,
      req.ip,
      req.headers['user-agent']
    );

    await auditService.log({
      userId: result.user.id,
      hotelId: result.hotel?.id,
      action: 'USER_LOGIN',
      resource: 'session',
      ipAddress: req.ip,
      success: true,
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  async refreshToken(req: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = req.body as { refreshToken: string };
    const result = await authService.refreshTokens(refreshToken);
    return reply.send({ success: true, data: result });
  }

  async logout(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as { userId: string };
    const { refreshToken } = req.body as { refreshToken?: string };

    await authService.logout(user.userId, refreshToken);

    return reply.send({ success: true, message: 'Logged out successfully' });
  }

  async forgotPassword(req: FastifyRequest, reply: FastifyReply) {
    const { email } = req.body as { email: string };
    await authService.forgotPassword(email);
    return reply.send({
      success: true,
      message: 'If this email exists, a reset link has been sent.',
    });
  }

  async resetPassword(req: FastifyRequest, reply: FastifyReply) {
    const { token, password } = req.body as { token: string; password: string };
    await authService.resetPassword(token, password);
    return reply.send({ success: true, message: 'Password reset successfully' });
  }

  async me(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as { userId: string };
    const { prisma } = await import('../../config/database');

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { hotel: { include: { settings: true, subscription: true } } },
    });

    if (!dbUser) {
      return reply.status(404).send({ success: false, message: 'User not found' });
    }

    return reply.send({
      success: true,
      data: {
        user: authService.sanitizeUser(dbUser),
        hotel: dbUser.hotel,
      },
    });
  }
}

