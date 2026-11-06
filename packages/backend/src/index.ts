import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { registerRoutes } from './routes';
import { setupSocketIO } from './core/realtime/socket';
import { setupJobs } from './core/jobs';

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true }
      } : undefined,
    },
    trustProxy: true,
  });

  // ─── Zod Schema Validator Compiler ─────────────────────────
  app.setValidatorCompiler(({ schema }: any) => {
    return (data: any) => {
      if (schema && typeof schema.safeParse === 'function') {
        const result = schema.safeParse(data);
        if (result.success) {
          return { value: result.data };
        }
        return { error: result.error };
      }
      return { value: data };
    };
  });

  // ─── Security ──────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // set at nginx level in production
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // In development or if request has no Origin (e.g. Android TV, curl, mobile), allow
      if (!origin || env.NODE_ENV !== 'production') {
        return cb(null, true);
      }
      const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
      if (origins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error('CORS Not Allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });

  // Rate limiting — Redis optional (falls back to in-process memory store)
  try {
    await app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip,
    });
  } catch (e) {
    logger.warn('Rate limit plugin failed to load, skipping: ' + String(e));
  }

  // ─── File uploads ──────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    },
  });

  // ─── Static files (uploaded media) ─────────────────────────
  const uploadPath = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: uploadPath,
    prefix: '/uploads/',
  });

  // ─── Routes ────────────────────────────────────────────────
  await registerRoutes(app);

  // ─── Health endpoints ──────────────────────────────────────
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (err) {
      return { status: 'degraded', error: String(err) };
    }
  });

  app.get('/ready', async (_, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ ready: true });
    } catch {
      return reply.status(503).send({ ready: false });
    }
  });

  // ─── HTTP + Socket.IO ──────────────────────────────────────
  const io = new Server(app.server, {
    cors: {
      origin: env.CORS_ORIGINS.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  setupSocketIO(io);

  // ─── Background Jobs ───────────────────────────────────────
  setupJobs();

  // ─── Start server ──────────────────────────────────────────
  await app.ready();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(`🚀 SmartStay TV Backend running on port ${env.PORT}`);
  logger.info(`📊 Environment: ${env.NODE_ENV}`);

  // ─── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

