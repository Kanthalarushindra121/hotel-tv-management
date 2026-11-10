import Redis from 'ioredis';
import { env } from './env';

class MemoryStore {
  private store: Map<string, { value: string; expiresAt: number | null }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async ping(): Promise<'PONG'> { return 'PONG'; }

  duplicate() { return this as any; }

  on(_event: string, _handler: (...args: any[]) => void) { return this as any; }

  disconnect() {}

  quit() {}
}

let isUsingMemoryFallback = false;

function createRedisClient() {
  if (!env.REDIS_URL || env.REDIS_URL.trim() === '' || env.REDIS_URL === 'memory') {
    isUsingMemoryFallback = true;
    console.log('ℹ️  Using built-in in-memory cache/pairing store (No external Redis required).');
    return new MemoryStore() as any;
  }

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
    lazyConnect: false,
  });

  client.on('error', (err: Error) => {
    if (!isUsingMemoryFallback) {
      console.warn(`⚠️  Redis notice (${err.message}) — using in-memory store for pairing/cache if unavailable.`);
      isUsingMemoryFallback = true;
    }
  });

  client.on('connect', () => {
    isUsingMemoryFallback = false;
    console.log('✅ Redis connected');
  });

  return client;
}

const redisClient = createRedisClient();
const memoryStore = new MemoryStore();

export const redis: any = new Proxy(redisClient, {
  get(target, prop) {
    const original = (target as any)[prop];
    if (typeof original !== 'function') return original;

    return async (...args: any[]) => {
      if (isUsingMemoryFallback || target.status !== 'ready') {
        return await (memoryStore as any)[prop]?.(...args);
      }
      try {
        return await original.apply(target, args);
      } catch (err: any) {
        isUsingMemoryFallback = true;
        return await (memoryStore as any)[prop]?.(...args);
      }
    };
  },
});

export const redisSub = redis;
export const redisPub = redis;

export function isRedisAvailable(): boolean {
  return !isUsingMemoryFallback && redisClient && redisClient.status === 'ready';
}

