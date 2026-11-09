import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  checkoutsToday: number;
  checkinsToday: number;
  activeGuests: number;
  connectedTvs: number;
  offlineTvs: number;
  unpairedTvs: number;
  totalWifiZones: number;
  activeWifiZones: number;
  upcomingCheckouts: any[];
  recentActivity: any[];
}

export class DashboardService {
  async invalidateDashboardCache(hotelId: string) {
    try {
      await redis.del(`dashboard:stats:${hotelId}`);
    } catch {}
  }

  async getDashboardStats(hotelId: string, tz?: string): Promise<DashboardStats> {
    const cacheKey = `dashboard:stats:${hotelId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Continue to fetch if cache read fails
    }

    // Determine hotel timezone
    let hotelTz = tz;
    if (!hotelTz) {
      const settings = await prisma.hotelSettings.findUnique({ where: { hotelId } });
      hotelTz = settings?.timezone || 'Asia/Kolkata';
    }

    const now = dayjs().tz(hotelTz);
    const todayStart = now.startOf('day').toDate();
    const todayEnd = now.endOf('day').toDate();
    const next24h = now.add(24, 'hour').toDate();

    const [
      totalRooms,
      occupiedRooms,
      availableRooms,
      cleaningRooms,
      maintenanceRooms,
      checkinsToday,
      checkoutsToday,
      activeGuests,
      connectedTvs,
      offlineTvs,
      unpairedTvs,
      totalWifiZones,
      activeWifiZones,
      upcomingCheckouts,
      recentCheckins,
      recentCheckouts,
    ] = await Promise.all([
      // Rooms
      prisma.room.count({ where: { hotelId, deletedAt: null } }),
      prisma.room.count({ where: { hotelId, status: 'OCCUPIED', deletedAt: null } }),
      prisma.room.count({ where: { hotelId, status: 'AVAILABLE', deletedAt: null } }),
      prisma.room.count({ where: { hotelId, status: 'CLEANING', deletedAt: null } }),
      prisma.room.count({
        where: {
          hotelId,
          status: { in: ['MAINTENANCE', 'OUT_OF_ORDER'] },
          deletedAt: null,
        },
      }),

      // Today
      prisma.checkin.count({
        where: { hotelId, checkedInAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.checkout.count({
        where: { hotelId, checkedOutAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.booking.count({
        where: { hotelId, status: 'CHECKED_IN', deletedAt: null },
      }),

      // TVs
      prisma.tvDevice.count({
        where: { hotelId, isOnline: true, deletedAt: null },
      }),
      prisma.tvDevice.count({
        where: { hotelId, isOnline: false, status: { not: 'UNPAIRED' }, deletedAt: null },
      }),
      prisma.tvDevice.count({
        where: { hotelId, status: 'UNPAIRED', deletedAt: null },
      }),

      // Wi-Fi Zones
      prisma.wifiZone.count({ where: { hotelId } }),
      prisma.wifiZone.count({ where: { hotelId, isActive: true } }),

      // Upcoming checkouts (next 24 hours)
      prisma.booking.findMany({
        where: {
          hotelId,
          status: 'CHECKED_IN',
          checkOutDate: { gte: todayStart, lte: next24h },
          deletedAt: null,
        },
        include: {
          guest: true,
          room: { include: { device: true } },
          checkoutReminder: true,
        },
        orderBy: { checkOutDate: 'asc' },
      }),

      // Recent 10 checkins
      prisma.checkin.findMany({
        where: { hotelId },
        take: 10,
        orderBy: { checkedInAt: 'desc' },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
      }),

      // Recent 10 checkouts
      prisma.checkout.findMany({
        where: { hotelId },
        take: 10,
        orderBy: { checkedOutAt: 'desc' },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
      }),
    ]);

    // Combine recent activity into unified list
    const checkinItems = recentCheckins.map((c) => ({
      id: c.id,
      type: 'CHECKIN' as const,
      timestamp: c.checkedInAt,
      bookingId: c.bookingId,
      guestName: `${c.booking.guest.firstName} ${c.booking.guest.lastName}`,
      roomNumber: c.booking.room.roomNumber,
      notes: c.notes,
    }));

    const checkoutItems = recentCheckouts.map((c) => ({
      id: c.id,
      type: 'CHECKOUT' as const,
      timestamp: c.checkedOutAt,
      bookingId: c.bookingId,
      guestName: `${c.booking.guest.firstName} ${c.booking.guest.lastName}`,
      roomNumber: c.booking.room.roomNumber,
      earlyCheckout: c.earlyCheckout,
      notes: c.notes,
    }));

    const recentActivity = [...checkinItems, ...checkoutItems]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    const result: DashboardStats = {
      totalRooms,
      occupiedRooms,
      availableRooms,
      cleaningRooms,
      maintenanceRooms,
      checkoutsToday,
      checkinsToday,
      activeGuests,
      connectedTvs,
      offlineTvs,
      unpairedTvs,
      totalWifiZones,
      activeWifiZones,
      upcomingCheckouts,
      recentActivity,
    };

    try {
      await redis.setex(cacheKey, 10, JSON.stringify(result));
    } catch {
      // Continue if cache write fails
    }

    return result;
  }

  // ─── Recent Activity (recent 20 events) ───────────────────
  async getRecentActivity(hotelId: string, limit: number = 20) {
    const [checkins, checkouts] = await Promise.all([
      prisma.checkin.findMany({
        where: { hotelId },
        take: limit,
        orderBy: { checkedInAt: 'desc' },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
      }),
      prisma.checkout.findMany({
        where: { hotelId },
        take: limit,
        orderBy: { checkedOutAt: 'desc' },
        include: {
          booking: {
            include: { guest: true, room: true },
          },
        },
      }),
    ]);

    const checkinItems = checkins.map((c) => ({
      id: c.id,
      type: 'CHECKIN',
      timestamp: c.checkedInAt,
      bookingId: c.bookingId,
      guestName: `${c.booking.guest.firstName} ${c.booking.guest.lastName}`,
      roomNumber: c.booking.room.roomNumber,
      notes: c.notes,
    }));

    const checkoutItems = checkouts.map((c) => ({
      id: c.id,
      type: 'CHECKOUT',
      timestamp: c.checkedOutAt,
      bookingId: c.bookingId,
      guestName: `${c.booking.guest.firstName} ${c.booking.guest.lastName}`,
      roomNumber: c.booking.room.roomNumber,
      earlyCheckout: c.earlyCheckout,
      notes: c.notes,
    }));

    return [...checkinItems, ...checkoutItems]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // ─── Upcoming Checkouts (next 24 hours) ────────────────────
  async getUpcomingCheckouts(hotelId: string, tz?: string) {
    let hotelTz = tz;
    if (!hotelTz) {
      const settings = await prisma.hotelSettings.findUnique({ where: { hotelId } });
      hotelTz = settings?.timezone || 'Asia/Kolkata';
    }

    const now = dayjs().tz(hotelTz);
    const start = now.startOf('day').toDate();
    const end = now.add(24, 'hour').toDate();

    return prisma.booking.findMany({
      where: {
        hotelId,
        status: 'CHECKED_IN',
        checkOutDate: { gte: start, lte: end },
        deletedAt: null,
      },
      include: {
        guest: true,
        room: { include: { device: true } },
        checkoutReminder: true,
      },
      orderBy: { checkOutDate: 'asc' },
    });
  }
}

export const dashboardService = new DashboardService();
