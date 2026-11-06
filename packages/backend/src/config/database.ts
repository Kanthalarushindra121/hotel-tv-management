import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Soft-delete middleware: automatically filter deleted records
prisma.$use(async (params, next) => {
  const modelsWithSoftDelete = ['User', 'Hotel', 'Room', 'TvDevice', 'Guest', 'Booking'];
  
  if (modelsWithSoftDelete.includes(params.model ?? '')) {
    if (params.action === 'findFirst' || params.action === 'findMany') {
      params.args = params.args ?? {};
      params.args.where = {
        ...params.args.where,
        deletedAt: null,
      };
    }
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      params.args.data = { deletedAt: new Date() };
    }
  }
  
  return next(params);
});

