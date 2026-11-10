import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  DEVICE_TOKEN_SECRET: z.string().min(32),
  DEVICE_TOKEN_EXPIRES_IN: z.string().default('365d'),
  
  ENCRYPTION_KEY: z.string().min(16),
  CHECKOUT_REMINDER_MINUTES: z.coerce.number().default(60),
  
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  
  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(8),
  
  PAIRING_CODE_EXPIRY_MINUTES: z.coerce.number().default(120),
  PAIRING_CODE_LENGTH: z.coerce.number().default(6),
  
  DEVICE_OFFLINE_THRESHOLD_MINUTES: z.coerce.number().default(5),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().default(60),
  
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

