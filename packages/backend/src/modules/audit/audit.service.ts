import { prisma } from '../../config/database';
import { AuditAction } from '@prisma/client';

export class AuditService {
  async log(data: {
    hotelId?: string | null;
    userId?: string | null;
    action: AuditAction;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    errorMsg?: string;
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          hotelId: data.hotelId || undefined,
          userId: data.userId || undefined,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          details: data.details as any,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          success: data.success ?? true,
          errorMsg: data.errorMsg,
        },
      });
    } catch (err) {
      // Don't let audit failures break the main flow
      console.error('Audit log failed:', err);
    }
  }

  async getLogs(hotelId: string, filters?: {
    page?: number;
    limit?: number;
    action?: AuditAction;
    userId?: string;
    resource?: string;
    from?: Date;
    to?: Date;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { hotelId };
    if (filters?.action) where.action = filters.action;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.resource) where.resource = filters.resource;
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters?.from) where.createdAt.gte = filters.from;
      if (filters?.to) where.createdAt.lte = filters.to;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const auditService = new AuditService();

