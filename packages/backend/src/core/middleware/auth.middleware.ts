import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { authService, TokenPayload } from '../../modules/auth/auth.service';
import { UserRole } from '@prisma/client';
import { AppError } from '../errors';

// Extend FastifyRequest with user payload
declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload;
    hotelId: string;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuperAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireHotel: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function setupAuthMiddleware(app: FastifyInstance) {
  // Authenticate middleware — verifies JWT access token
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Missing authorization token', 401);
    }

    const token = authHeader.slice(7);
    const payload = authService.verifyAccessToken(token);
    req.user = payload;
    
    // Set hotelId from token for tenant isolation
    if (payload.hotelId) {
      req.hotelId = payload.hotelId;
    }
  });

  // Role-based access control
  app.decorate('requireRole', (...roles: UserRole[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(req, reply);
      if (!roles.includes(req.user.role) && !req.user.isSuperAdmin) {
        throw new AppError('Insufficient permissions', 403);
      }
    };
  });

  // Super admin only
  app.decorate('requireSuperAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (!req.user.isSuperAdmin) {
      throw new AppError('Super admin access required', 403);
    }
  });

  // Ensure user belongs to a hotel
  app.decorate('requireHotel', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (!req.user.hotelId) {
      throw new AppError('Hotel association required', 403);
    }
  });
}

// ─── Tenant isolation helper ──────────────────────────────
// Guarantees every query is scoped to the authenticated hotel
export function getTenantHotelId(req: FastifyRequest): string {
  if (req.user.isSuperAdmin) {
    // Super admins can pass hotelId as param/query
    const hotelId = (req.params as Record<string, string>).hotelId 
      || (req.query as Record<string, string>).hotelId;
    if (!hotelId) {
      throw new AppError('Hotel ID required for super admin operations', 400);
    }
    return hotelId;
  }
  
  if (!req.user.hotelId) {
    throw new AppError('No hotel associated with this account', 403);
  }
  
  return req.user.hotelId;
}

