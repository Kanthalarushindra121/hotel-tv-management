import path from 'path';
import fs from 'fs/promises';
import QRCode from 'qrcode';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError, NotFoundError } from '../../core/errors';
import { emitToHotel, SOCKET_EVENTS } from '../../core/realtime/socket';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertHotel(hotel: unknown, hotelId: string) {
  if (!hotel) throw new NotFoundError('Hotel', hotelId);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class HotelsService {
  // ─── Get hotel with all settings ───────────────────────
  async getHotel(hotelId: string) {
    const hotel = await prisma.hotel.findFirst({
      where: { id: hotelId, deletedAt: null },
      include: {
        settings: true,
        wifiSettings: true,
        amenities: { include: { amenity: true }, orderBy: { sortOrder: 'asc' } },
        houseRules: { orderBy: { sortOrder: 'asc' } },
        checkoutSteps: { orderBy: { sortOrder: 'asc' } },
        photos: { orderBy: { sortOrder: 'asc' } },
        announcements: { orderBy: { createdAt: 'desc' } },
        subscription: true,
        _count: { select: { rooms: true, devices: true, users: true } },
      },
    });
    assertHotel(hotel, hotelId);
    return hotel;
  }

  // ─── Update hotel info ─────────────────────────────────
  async updateHotel(
    hotelId: string,
    data: {
      name?: string;
      description?: string;
      tagline?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      website?: string;
      logoUrl?: string;
      coverImageUrl?: string;
      primaryColor?: string;
      accentColor?: string;
    },
    userId: string,
  ) {
    const existing = await prisma.hotel.findFirst({ where: { id: hotelId, deletedAt: null } });
    assertHotel(existing, hotelId);

    const updatePayload: Record<string, any> = { ...data, updatedAt: new Date() };
    if (data.tagline && !data.description) {
      updatePayload.description = data.tagline;
    }
    delete updatePayload.tagline;

    const updated = await prisma.hotel.update({
      where: { id: hotelId },
      data: updatePayload,
      include: { settings: true, wifiSettings: true },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'HOTEL_UPDATED',
        resource: 'hotel',
        resourceId: hotelId,
        details: data,
        success: true,
      },
    });

    emitToHotel(hotelId, SOCKET_EVENTS.HOTEL_SETTINGS_UPDATED, {
      type: 'hotel',
      data: updated,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // ─── Update hotel settings ─────────────────────────────
  async updateSettings(
    hotelId: string,
    data: {
      checkInTime?: string;
      checkOutTime?: string;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      timezone?: string;
      defaultLanguage?: string;
      currency?: string;
      screensaverDelay?: number;
      guestDataExpiry?: number;
      welcomeMessage?: string;
      defaultWelcomeMsg?: string;
      checkoutMessage?: string;
    },
    userId: string,
  ) {
    const updated = await prisma.hotelSettings.upsert({
      where: { hotelId },
      create: {
        hotelId,
        ...data,
      },
      update: {
        ...data,
      },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'SETTINGS_UPDATED',
        resource: 'hotel_settings',
        resourceId: updated.id,
        details: data,
        success: true,
      },
    });

    emitToHotel(hotelId, SOCKET_EVENTS.HOTEL_SETTINGS_UPDATED, {
      type: 'settings',
      data: updated,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  // ─── Update WiFi settings ──────────────────────────────
  async updateWifi(
    hotelId: string,
    data: {
      networkName: string;
      password?: string;
      securityType?: 'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'OPEN';
      instructions?: string;
    },
    userId: string,
  ) {
    // Build WPA QR string: WIFI:T:WPA;S:<ssid>;P:<password>;;
    const qrString = `WIFI:T:${data.securityType || 'WPA2'};S:${data.networkName};P:${data.password || ''};;`;

    // Ensure uploads dir exists
    const uploadDir = path.resolve(env.UPLOAD_DIR, 'wifi-qr');
    await fs.mkdir(uploadDir, { recursive: true });

    const qrFileName = `wifi-qr-${hotelId}.png`;
    const qrFilePath = path.join(uploadDir, qrFileName);

    // Generate QR code as PNG file
    await QRCode.toFile(qrFilePath, qrString, {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
    });

    const qrCodeUrl = `/uploads/wifi-qr/${qrFileName}`;

    // Upsert wifi settings
    const wifi = await prisma.wifiSettings.upsert({
      where: { hotelId },
      create: {
        hotelId,
        networkName: data.networkName,
        password: data.password || '',
        securityType: data.securityType || 'WPA2',
        qrCodeUrl,
      },
      update: {
        networkName: data.networkName,
        password: data.password || '',
        securityType: data.securityType || 'WPA2',
        qrCodeUrl,
      },
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'WIFI_UPDATED',
        resource: 'wifi_settings',
        resourceId: wifi.id,
        success: true,
      },
    });

    // Emit wifi updated — TVs will refresh QR display
    emitToHotel(hotelId, SOCKET_EVENTS.WIFI_UPDATED, {
      networkName: wifi.networkName,
      securityType: wifi.securityType,
      qrCodeUrl: wifi.qrCodeUrl,
      timestamp: new Date().toISOString(),
    });

    return wifi;
  }

  // ─── Amenities ─────────────────────────────────────────
  async updateAmenities(
    hotelId: string,
    amenities: { amenityId?: string; customName?: string; customIcon?: string; sortOrder?: number; name?: string; icon?: string; hours?: string; isActive?: boolean }[],
  ) {
    // Delete existing and recreate
    await prisma.hotelAmenity.deleteMany({ where: { hotelId } });

    const created = await Promise.all(
      amenities.map((a, idx) => {
        const displayName = a.customName || a.name || 'Amenity';
        const formattedName = a.hours ? `${displayName} (${a.hours})` : displayName;
        return prisma.hotelAmenity.create({
          data: {
            hotelId,
            amenityId: a.amenityId,
            customName: formattedName,
            customIcon: a.customIcon || a.icon || 'sparkles',
            sortOrder: a.sortOrder ?? idx,
            isActive: a.isActive !== false,
          },
          include: { amenity: true },
        });
      }),
    );

    emitToHotel(hotelId, SOCKET_EVENTS.HOTEL_SETTINGS_UPDATED, {
      type: 'amenities',
      data: created,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  // ─── House Rules ───────────────────────────────────────
  async updateHouseRules(
    hotelId: string,
    rules: (string | { rule: string; sortOrder?: number })[],
  ) {
    await prisma.houseRule.deleteMany({ where: { hotelId } });

    const normalized = rules.map((r, idx) =>
      typeof r === 'string' ? { rule: r, sortOrder: idx + 1 } : { rule: r.rule, sortOrder: r.sortOrder ?? idx + 1 }
    );

    const created = await Promise.all(
      normalized.map((r) =>
        prisma.houseRule.create({
          data: {
            hotelId,
            rule: r.rule,
            sortOrder: r.sortOrder,
          },
        }),
      ),
    );

    emitToHotel(hotelId, SOCKET_EVENTS.HOTEL_SETTINGS_UPDATED, {
      type: 'house_rules',
      data: created,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  // ─── Checkout Steps ────────────────────────────────────
  async updateCheckoutSteps(
    hotelId: string,
    steps: (string | { instruction: string; sortOrder?: number })[],
  ) {
    await prisma.checkoutStep.deleteMany({ where: { hotelId } });

    const normalized = steps.map((s, idx) =>
      typeof s === 'string' ? { instruction: s, sortOrder: idx + 1 } : { instruction: s.instruction, sortOrder: s.sortOrder ?? idx + 1 }
    );

    const created = await Promise.all(
      normalized.map((s) =>
        prisma.checkoutStep.create({
          data: {
            hotelId,
            instruction: s.instruction,
            sortOrder: s.sortOrder,
          },
        }),
      ),
    );

    emitToHotel(hotelId, SOCKET_EVENTS.HOTEL_SETTINGS_UPDATED, {
      type: 'checkout_steps',
      data: created,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  // ─── Announcements ─────────────────────────────────────
  async addAnnouncement(
    hotelId: string,
    data: {
      title: string;
      body: string;
      startsAt?: Date;
      endsAt?: Date;
    },
  ) {
    return prisma.announcement.create({
      data: {
        hotelId,
        title: data.title,
        body: data.body,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        isActive: true,
      },
    });
  }

  async deleteAnnouncement(hotelId: string, id: string) {
    const existing = await prisma.announcement.findFirst({ where: { id, hotelId } });
    if (!existing) throw new NotFoundError('Announcement', id);

    await prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  // ─── Photos ────────────────────────────────────────────
  async uploadPhoto(
    hotelId: string,
    file: { filename: string; buffer: Buffer; mimetype: string },
  ) {
    const uploadDir = path.resolve(env.UPLOAD_DIR, 'hotels', hotelId);
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.filename) || '.jpg';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadDir, safeName);

    await fs.writeFile(filePath, file.buffer);

    const url = `/uploads/hotels/${hotelId}/${safeName}`;

    // Count current photos for sortOrder
    const count = await prisma.hotelPhoto.count({ where: { hotelId } });

    const photo = await prisma.hotelPhoto.create({
      data: {
        hotelId,
        url,
        caption: file.filename,
        sortOrder: count,
        mimeType: file.mimetype,
        fileSize: file.buffer.length,
      },
    });

    return photo;
  }

  async deletePhoto(hotelId: string, id: string) {
    const photo = await prisma.hotelPhoto.findFirst({ where: { id, hotelId } });
    if (!photo) throw new NotFoundError('Photo', id);

    await prisma.hotelPhoto.delete({ where: { id } });
    return { success: true };
  }

  // ─── Onboarding ────────────────────────────────────────
  async getOnboardingStatus(hotelId: string) {
    const hotel = await prisma.hotel.findFirst({
      where: { id: hotelId, deletedAt: null },
      select: {
        id: true,
        isOnboarded: true,
        onboardingStep: true,
        name: true,
        settings: { select: { checkInTime: true, checkOutTime: true, timezone: true } },
        wifiSettings: { select: { id: true } },
        amenities: { select: { id: true } },
        houseRules: { select: { id: true } },
        checkoutSteps: { select: { id: true } },
        rooms: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    assertHotel(hotel, hotelId);

    return {
      currentStep: hotel!.onboardingStep,
      isOnboarded: hotel!.isOnboarded,
      steps: {
        1: { label: 'Hotel Info', complete: !!(hotel!.name) },
        2: { label: 'Settings', complete: !!hotel!.settings },
        3: { label: 'WiFi', complete: !!hotel!.wifiSettings },
        4: { label: 'Amenities', complete: hotel!.amenities.length > 0 },
        5: { label: 'House Rules', complete: hotel!.houseRules.length > 0 },
        6: { label: 'Checkout Steps', complete: hotel!.checkoutSteps.length > 0 },
        7: { label: 'Rooms', complete: hotel!.rooms.length > 0 },
      },
    };
  }

  async advanceOnboarding(hotelId: string, step: number) {
    const hotel = await prisma.hotel.findFirst({ where: { id: hotelId, deletedAt: null } });
    assertHotel(hotel, hotelId);

    const totalSteps = 7;
    const nextStep = Math.min(step + 1, totalSteps);
    const isOnboarded = step >= totalSteps;

    const updated = await prisma.hotel.update({
      where: { id: hotelId },
      data: { onboardingStep: nextStep, isOnboarded },
    });

    return { onboardingStep: updated.onboardingStep, isOnboarded: updated.isOnboarded };
  }

  // ─── Dashboard Stats ───────────────────────────────────
  async getDashboardStats(hotelId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalRooms,
      occupiedRooms,
      checkinsTodayCount,
      checkoutsTodayCount,
      deviceCounts,
    ] = await Promise.all([
      prisma.room.count({ where: { hotelId, deletedAt: null } }),
      prisma.room.count({ where: { hotelId, status: 'OCCUPIED', deletedAt: null } }),
      prisma.checkin.count({
        where: { hotelId, checkedInAt: { gte: today, lte: todayEnd } },
      }),
      prisma.checkout.count({
        where: { hotelId, checkedOutAt: { gte: today, lte: todayEnd } },
      }),
      prisma.tvDevice.groupBy({
        by: ['isOnline'],
        where: { hotelId, deletedAt: null },
        _count: { id: true },
      }),
    ]);

    const onlineTvs = deviceCounts.find((d) => d.isOnline)?._count.id ?? 0;
    const offlineTvs = deviceCounts.find((d) => !d.isOnline)?._count.id ?? 0;

    return {
      totalRooms,
      occupiedRooms,
      availableRooms: totalRooms - occupiedRooms,
      checkinsTodayCount,
      checkoutsTodayCount,
      onlineTvs,
      offlineTvs,
    };
  }

  async getScreensaverConfig(hotelId: string) {
    let config = await prisma.screensaverConfig.findUnique({
      where: { hotelId },
    });
    if (!config) {
      config = await prisma.screensaverConfig.create({
        data: {
          hotelId,
          isEnabled: true,
          idleTimeout: 300,
          showClock: true,
          showDate: true,
          showRoomNumber: true,
          showGuestName: true,
          showHotelLogo: true,
          showFacilities: true,
          showWeather: false,
          guestWelcomeTitle: 'Welcome, {guestName}!',
          guestWelcomeSubtitle: 'We hope you enjoy your comfortable stay with us.',
          guestPromoText: 'Dial 9 for 24/7 Concierge and In-Room Dining.',
          defaultWelcomeTitle: 'Welcome to {hotelName}',
          defaultWelcomeSubtitle: 'Experience world-class luxury and personalized hospitality.',
          defaultPromoText: 'High-speed Wi-Fi & 24/7 guest support available.',
        },
      });
    }
    return config;
  }

  async updateScreensaverConfig(hotelId: string, data: any, userId: string) {
    const config = await prisma.screensaverConfig.upsert({
      where: { hotelId },
      update: {
        ...data,
        updatedAt: new Date(),
      },
      create: {
        hotelId,
        ...data,
      },
    });

    emitToHotel(hotelId, 'hotel.screensaver.updated', config);

    try {
      await prisma.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'SETTINGS_UPDATED',
          resource: 'screensaver_config',
          resourceId: config.id,
          details: data,
          success: true,
        },
      });
    } catch (e) {
      console.warn('AuditLog error:', e);
    }

    return config;
  }
}

export const hotelsService = new HotelsService();
