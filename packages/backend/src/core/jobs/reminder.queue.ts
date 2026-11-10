import { Queue, Worker, Job } from 'bullmq';
import { redis, isRedisAvailable } from '../../config/redis';
import { prisma } from '../../config/database';
import { emitToDevice, emitToHotel, SOCKET_EVENTS } from '../realtime/socket';
import { logger } from '../../config/logger';

let queueInstance: Queue | null = null;

function getReminderQueue(): Queue | null {
  if (!isRedisAvailable()) return null;
  if (!queueInstance) {
    try {
      const queueConnection = redis.duplicate({ maxRetriesPerRequest: null });
      queueInstance = new Queue('checkout-reminders', {
        connection: queueConnection,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      });
    } catch (e: any) {
      logger.warn(`Failed to initialize reminder BullMQ: ${e.message}`);
      return null;
    }
  }
  return queueInstance;
}

export const reminderQueue = {
  async remove(jobId: string) {
    const q = getReminderQueue();
    if (q) return q.remove(jobId);
  },
  async add(name: string, data: any, opts: any) {
    const q = getReminderQueue();
    if (q) return q.add(name, data, opts);
    return { id: `local_${Date.now()}` } as any;
  },
};

export async function scheduleCheckoutReminder(
  bookingId: string,
  hotelId: string,
  checkoutAt: Date,
  reminderMinutesBefore: number = 60
): Promise<string | undefined> {
  const reminderAt = new Date(checkoutAt.getTime() - reminderMinutesBefore * 60 * 1000);
  const delay = reminderAt.getTime() - Date.now();

  if (delay <= 0) {
    logger.info(`Reminder for booking ${bookingId} is in the past — skipping`);
    return;
  }

  let jobId: string | undefined = undefined;

  if (isRedisAvailable()) {
    try {
      await Promise.race([
        (async () => {
          await reminderQueue.remove(bookingId).catch(() => {});
          const job = await reminderQueue.add(
            'send-reminder',
            { bookingId, hotelId, checkoutAt: checkoutAt.toISOString() },
            { jobId: bookingId, delay }
          );
          jobId = job?.id;
        })(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (err: any) {
      logger.warn(`BullMQ reminder skipped: ${err.message}`);
    }
  }

  // Persist reminder record in DB
  try {
    await prisma.checkoutReminder.upsert({
      where: { bookingId },
      create: { bookingId, hotelId, scheduledAt: reminderAt, jobId: jobId || 'local' },
      update: { scheduledAt: reminderAt, jobId: jobId || 'local', isCancelled: false, isSent: false, sentAt: null },
    });
  } catch (err: any) {
    logger.warn(`CheckoutReminder upsert skipped: ${err.message}`);
  }

  return jobId;
}

export async function cancelCheckoutReminder(bookingId: string): Promise<void> {
  if (isRedisAvailable()) {
    try {
      await Promise.race([
        reminderQueue.remove(bookingId).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {}
  }
  await prisma.checkoutReminder.updateMany({
    where: { bookingId, isSent: false },
    data: { isCancelled: true },
  }).catch(() => {});
}

export function setupReminderWorker() {
  if (!isRedisAvailable()) {
    logger.info('Redis is in memory fallback — skipping BullMQ checkout reminder worker');
    return null;
  }

  try {
    const workerConnection = redis.duplicate({ maxRetriesPerRequest: null });


  const worker = new Worker(
    'checkout-reminders',
    async (job: Job) => {
      const { bookingId, hotelId } = job.data;

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, status: 'CHECKED_IN' },
        include: {
          guest: true,
          room: { include: { device: true } },
        },
      });

      if (!booking) {
        logger.info(`Reminder: booking ${bookingId} not found or not checked in — skipping`);
        return;
      }

      // Update TV screen state
      if (booking.room.device?.isOnline) {
        emitToDevice(booking.room.device.id, SOCKET_EVENTS.CHECKOUT_REMINDER, {
          bookingId,
          guestFirstName: booking.guest.firstName,
          checkOutDate: booking.checkOutDate,
          roomNumber: booking.room.roomNumber,
        });
      }

      // Notify hotel dashboard
      emitToHotel(hotelId, SOCKET_EVENTS.CHECKOUT_REMINDER, {
        bookingId,
        guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
        roomNumber: booking.room.roomNumber,
        checkOutDate: booking.checkOutDate,
      });

      // Mark reminder as sent
      await prisma.checkoutReminder.updateMany({
        where: { bookingId },
        data: { isSent: true, sentAt: new Date() },
      });

      // Notification record for dashboard
      await prisma.notification.create({
        data: {
          hotelId,
          type: 'CHECKOUT_REMINDER',
          title: 'Checkout Reminder',
          body: `Guest in Room ${booking.room.roomNumber} (${booking.guest.firstName} ${booking.guest.lastName}) is scheduled for checkout soon.`,
          data: { bookingId, roomNumber: booking.room.roomNumber },
        },
      }).catch((err) => logger.error(`Failed to create reminder notification: ${err.message}`));

      // Audit log
      await prisma.auditLog.create({
        data: {
          hotelId,
          action: 'CHECKOUT_REMINDER_SENT',
          resource: 'booking',
          resourceId: bookingId,
          details: { roomNumber: booking.room.roomNumber, scheduledAt: job.timestamp },
          success: true,
        },
      }).catch(() => {});

      logger.info(`Checkout reminder sent for booking ${bookingId}`);
    },
    { connection: workerConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Reminder job ${job?.id} failed: ${err.message}`);
  });

  return worker;
  } catch (err: any) {
    logger.warn(`Failed to initialize reminder BullMQ worker: ${err.message}`);
    return null;
  }
}

