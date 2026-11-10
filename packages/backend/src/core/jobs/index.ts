import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { emitToHotel, SOCKET_EVENTS } from '../realtime/socket';
import { logger } from '../../config/logger';
import { setupReminderWorker } from './reminder.queue';

export function setupJobs() {
  logger.info('Setting up periodic background tasks...');

  // Setup BullMQ checkout reminder worker
  try {
    setupReminderWorker();
  } catch (err: any) {
    logger.warn(`BullMQ reminder worker skipped (Redis optional): ${err?.message || err}`);
  }

  // Periodic device offline checker (every 60s)
  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - env.DEVICE_OFFLINE_THRESHOLD_MINUTES * 60 * 1000);
      const staleDevices = await prisma.tvDevice.findMany({
        where: {
          isOnline: true,
          lastSeenAt: { lt: threshold },
          deletedAt: null,
        },
      });

      for (const device of staleDevices) {
        await prisma.tvDevice.update({
          where: { id: device.id },
          data: { isOnline: false, status: 'OFFLINE' },
        });

        emitToHotel(device.hotelId, SOCKET_EVENTS.DEVICE_OFFLINE, {
          deviceId: device.id,
          reason: 'heartbeat_timeout',
          timestamp: new Date().toISOString(),
        });

        logger.info(`Device ${device.deviceId} marked offline due to inactivity.`);
      }
    } catch (err) {
      logger.error('Device offline check failed:', err);
    }
  }, 60000);
}

