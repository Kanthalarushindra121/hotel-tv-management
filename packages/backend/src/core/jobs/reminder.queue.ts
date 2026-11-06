import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../../config/redis';
import { prisma } from '../../config/database';
import { emitToDevice, emitToHotel, SOCKET_EVENTS } from '../realtime/socket';
import { logger } from '../../config/logger';

const queueConnection = redis.duplicate({ maxRetriesPerRequest: null });

export const reminderQueue = new Queue('checkout-reminders', {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

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

  // Use bookingId as job ID to prevent duplicates
  await reminderQueue.remove(bookingId).catch(() => {});

  const job = await reminderQueue.add(
    'send-reminder',
    { bookingId, hotelId, checkoutAt: checkoutAt.toISOString() },
    { jobId: bookingId, delay }
  );

  // Persist reminder record
  await prisma.checkoutReminder.upsert({
    where: { bookingId },
    create: { bookingId, hotelId, scheduledAt: reminderAt, jobId: job.id },
    update: { scheduledAt: reminderAt, jobId: job.id, isCancelled: false, isSent: false, sentAt: null },
  });

  return job.id;
}

export async function cancelCheckoutReminder(bookingId: string): Promise<void> {
  await reminderQueue.remove(bookingId).catch(() => {});
  await prisma.checkoutReminder.updateMany({
    where: { bookingId, isSent: false },
    data: { isCancelled: true },
  });
}

export function setupReminderWorker() {
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
}
