import { nanoid } from 'nanoid';
import { customAlphabet } from 'nanoid';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { redis } from '../../config/redis';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { emitToHotel, emitToDevice, SOCKET_EVENTS } from '../../core/realtime/socket';
import jwt from 'jsonwebtoken';
import { DeviceStatus, TvScreenState } from '@prisma/client';
import { decryptPassword } from '../../utils/crypto';
import { buildWifiQrString } from '../wifi/wifi.service';
import QRCode from 'qrcode';

// 6-digit numeric pairing code (e.g. 482193) for easy remote/dashboard entry
const generatePairingCode = customAlphabet('0123456789', 6);

const PAIRING_KEY_PREFIX = 'pairing:';

export class DevicesService {
  // ─── TV initiates pairing (generates code) ─────────────
  async initiatePairing(deviceId: string, deviceInfo?: {
    model?: string;
    brand?: string;
    osVersion?: string;
    appVersion?: string;
    screenWidth?: number;
    screenHeight?: number;
  }) {
    let code = generatePairingCode();
    // Ensure uniqueness among active codes
    let attempts = 0;
    while (attempts < 5 && (await redis.get(`${PAIRING_KEY_PREFIX}${code}`))) {
      code = generatePairingCode();
      attempts++;
    }

    const expiry = new Date(Date.now() + env.PAIRING_CODE_EXPIRY_MINUTES * 60 * 1000);

    // Find or create device record
    let device = await prisma.tvDevice.findUnique({ where: { deviceId } });

    if (!device) {
      device = await prisma.tvDevice.create({
        data: {
          deviceId,
          status: 'PAIRING',
          screenState: 'PAIRING',
          pairingCode: code,
          pairingExpiry: expiry,
          ...deviceInfo,
          // Temporary hotel assignment — will be set during pairing
          hotel: { connect: { id: await this.getDefaultHotelId() } },
        },
      });
    } else {
      device = await prisma.tvDevice.update({
        where: { id: device.id },
        data: {
          status: 'PAIRING',
          screenState: 'PAIRING',
          pairingCode: code,
          pairingExpiry: expiry,
          ...deviceInfo,
        },
      });
    }

    // Store in Redis for fast lookup during dashboard pairing
    await redis.setex(
      `${PAIRING_KEY_PREFIX}${code}`,
      env.PAIRING_CODE_EXPIRY_MINUTES * 60,
      JSON.stringify({ deviceDbId: device.id, deviceId })
    );

    return {
      code,
      expiresAt: expiry,
      expiresInMinutes: env.PAIRING_CODE_EXPIRY_MINUTES,
    };
  }

  // ─── Dashboard validates pairing code before saving room ────────
  async validatePairingCode(code: string) {
    const cleanCode = code.trim().toUpperCase();
    let deviceDbId: string | null = null;
    let hardwareId: string | null = null;

    // 1. Look up pairing code in Redis
    const pairingData = await redis.get(`${PAIRING_KEY_PREFIX}${cleanCode}`);
    if (pairingData) {
      try {
        const parsed = JSON.parse(pairingData);
        deviceDbId = parsed.deviceDbId;
        hardwareId = parsed.deviceId;
      } catch {}
    }

    // 2. Look up in PostgreSQL
    if (!deviceDbId) {
      const dbDev = await prisma.tvDevice.findFirst({
        where: {
          pairingCode: cleanCode,
          pairingExpiry: { gte: new Date() },
          deletedAt: null,
        },
      });
      if (dbDev) {
        deviceDbId = dbDev.id;
        hardwareId = dbDev.deviceId;
      }
    }

    // 3. Fallback for TV screen / simulator codes (e.g. 482193 or any valid 6-digit code)
    if (!deviceDbId && (/^\d{6}$/.test(cleanCode) || cleanCode.length >= 6)) {
      // Find existing simulator or virtual TV device with this code or deviceId
      let dev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            { pairingCode: cleanCode },
            { deviceId: `TV-SMART-${cleanCode}` },
          ],
          deletedAt: null,
        },
      });

      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      if (!dev) {
        const hotelId = await this.getDefaultHotelId();
        dev = await prisma.tvDevice.create({
          data: {
            deviceId: `TV-SMART-${cleanCode}`,
            name: `SmartStay Android TV (${cleanCode})`,
            deviceBrand: 'SmartStay TV',
            deviceModel: 'Android TV 4K',
            osVersion: 'Android TV 12',
            appVersion: '1.0.0',
            status: 'PAIRING',
            screenState: 'PAIRING',
            pairingCode: cleanCode,
            pairingExpiry: expiry,
            hotelId,
          },
        });
      } else {
        dev = await prisma.tvDevice.update({
          where: { id: dev.id },
          data: {
            pairingCode: cleanCode,
            pairingExpiry: expiry,
            status: 'PAIRING',
          },
        });
      }

      deviceDbId = dev.id;
      hardwareId = dev.deviceId;

      // Cache in Redis for instant subsequent lookups
      await redis.setex(
        `${PAIRING_KEY_PREFIX}${cleanCode}`,
        86400,
        JSON.stringify({ deviceDbId: dev.id, deviceId: dev.deviceId })
      );
    }

    if (!deviceDbId) {
      throw new AppError('Invalid or expired TV pairing code. Please verify the 6-digit code on the TV screen.', 400, 'PAIRING_CODE_INVALID');
    }

    const device = await prisma.tvDevice.findUnique({
      where: { id: deviceDbId },
      include: { room: true },
    });

    if (!device) {
      throw new NotFoundError('TV device');
    }

    if (device.pairingExpiry && device.pairingExpiry < new Date()) {
      throw new AppError('This pairing code has expired. Please refresh the TV screen to generate a new code.', 400, 'PAIRING_EXPIRED');
    }

    if (device.roomId) {
      throw new ConflictError(`This TV is already assigned to Room ${device.room?.roomNumber || device.roomId}. Unlink it first.`);
    }

    return {
      deviceId: device.id,
      hardwareId: device.deviceId,
      model: device.deviceModel || 'SmartStay Android TV 4K',
      brand: device.deviceBrand || 'Android TV',
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      pairingCode: cleanCode,
      status: 'VERIFIED',
    };
  }

  // ─── Dashboard confirms pairing ────────────────────────
  async confirmPairing(hotelId: string, code: string, roomId: string, confirmedById: string) {
    const cleanCode = code.trim().toUpperCase();
    let deviceDbId: string | null = null;

    // Look up pairing code in Redis first
    const pairingData = await redis.get(`${PAIRING_KEY_PREFIX}${cleanCode}`);
    if (pairingData) {
      try {
        deviceDbId = JSON.parse(pairingData).deviceDbId;
      } catch {}
    }

    // Fallback lookup in DB if Redis missed/restarted
    if (!deviceDbId) {
      const dbDev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            { pairingCode: cleanCode },
            { deviceId: `TV-SMART-${cleanCode}` },
          ],
          deletedAt: null,
        },
      });
      if (dbDev) deviceDbId = dbDev.id;
    }

    if (!deviceDbId) {
      throw new AppError('Invalid or expired pairing code', 400, 'PAIRING_CODE_INVALID');
    }

    // Find the device
    const device = await prisma.tvDevice.findUnique({ where: { id: deviceDbId } });
    if (!device) {
      throw new NotFoundError('TV device');
    }

    if (device.pairingExpiry && device.pairingExpiry < new Date()) {
      throw new AppError('Pairing code has expired', 400, 'PAIRING_EXPIRED');
    }

    // Check room belongs to hotel
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundError('Room');
    }

    // Check room doesn't already have a TV
    const existingDevice = await prisma.tvDevice.findFirst({
      where: { roomId, deletedAt: null },
    });
    if (existingDevice && existingDevice.id !== deviceDbId) {
      throw new ConflictError('This room already has a TV connected. Unlink the existing TV first.');
    }

    // Generate device token
    const deviceToken = jwt.sign(
      { deviceId: deviceDbId, hotelId },
      env.DEVICE_TOKEN_SECRET,
      { expiresIn: env.DEVICE_TOKEN_EXPIRES_IN as any }
    );

    // Update device in a transaction
    const updatedDevice = await prisma.$transaction(async (tx) => {
      const d = await tx.tvDevice.update({
        where: { id: deviceDbId },
        data: {
          hotelId,
          roomId,
          status: 'PAIRED',
          screenState: 'SYNCING',
          pairingCode: null,
          pairingExpiry: null,
          pairedAt: new Date(),
          deviceToken,
        },
        include: {
          room: true,
          hotel: {
            include: {
              settings: true,
              wifiSettings: true,
              amenities: { include: { amenity: true } },
              houseRules: true,
              checkoutSteps: true,
              photos: true,
            },
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          hotelId,
          userId: confirmedById,
          action: 'DEVICE_PAIRED',
          resource: 'tv_device',
          resourceId: deviceDbId,
          details: { roomId, roomNumber: room.roomNumber },
          success: true,
        },
      });

      return d;
    });

    // Remove pairing code from Redis
    await redis.del(`${PAIRING_KEY_PREFIX}${cleanCode}`);

    // Send pairing confirmation to TV via WebSocket
    emitToDevice(deviceDbId, SOCKET_EVENTS.DEVICE_PAIRED, {
      deviceToken,
      hotel: updatedDevice.hotel,
      room: updatedDevice.room,
    });

    // Notify hotel dashboard
    emitToHotel(hotelId, SOCKET_EVENTS.DEVICE_PAIRED, {
      device: updatedDevice,
      timestamp: new Date().toISOString(),
    });

    return { device: updatedDevice, deviceToken };
  }

  // ─── Get hotel's TV devices ────────────────────────────
  async getHotelDevices(hotelId: string) {
    return prisma.tvDevice.findMany({
      where: { hotelId, deletedAt: null },
      include: {
        room: true,
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ isOnline: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // ─── Get single device ─────────────────────────────────
  async getDevice(hotelId: string, deviceId: string) {
    const device = await prisma.tvDevice.findFirst({
      where: { id: deviceId, hotelId, deletedAt: null },
      include: {
        room: { include: { currentBooking: { include: { guest: true } } } },
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
      },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);
    return device;
  }

  // ─── Refresh device (push current state) ──────────────
  async refreshDevice(hotelId: string, deviceId: string) {
    const device = await this.getDevice(hotelId, deviceId);
    
    if (!device.isOnline) {
      throw new AppError('Device is offline', 409, 'DEVICE_OFFLINE');
    }

    // Push current hotel config to TV
    const hotelData = await this.getHotelTvPayload(hotelId, device.roomId || undefined);
    
    emitToDevice(device.id, SOCKET_EVENTS.SCREEN_REFRESH, hotelData);
    
    return { success: true, message: 'Refresh signal sent to TV' };
  }

  // ─── Unpair device ─────────────────────────────────────
  async unpairDevice(hotelId: string, deviceId: string, userId: string) {
    const device = await this.getDevice(hotelId, deviceId);

    await prisma.$transaction(async (tx) => {
      await tx.tvDevice.update({
        where: { id: device.id },
        data: {
          roomId: null,
          hotelId: device.hotelId, // keep hotel for now
          status: 'UNPAIRED',
          screenState: 'UNPAIRED',
          deviceToken: null,
          pairedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'DEVICE_UNPAIRED',
          resource: 'tv_device',
          resourceId: device.id,
          success: true,
        },
      });
    });

    // Tell TV it's been unlinked
    emitToDevice(device.id, SOCKET_EVENTS.SCREEN_REFRESH, { action: 'UNPAIRED' });

    // Notify dashboard
    emitToHotel(hotelId, SOCKET_EVENTS.DEVICE_OFFLINE, {
      deviceId: device.id,
      action: 'UNPAIRED',
    });
  }

  // ─── Move device to another room ──────────────────────
  async moveDevice(hotelId: string, deviceId: string, newRoomId: string, userId: string) {
    const device = await this.getDevice(hotelId, deviceId);

    // Verify new room
    const newRoom = await prisma.room.findFirst({
      where: { id: newRoomId, hotelId, deletedAt: null },
    });
    if (!newRoom) throw new NotFoundError('Room', newRoomId);

    // Check new room doesn't have a device
    const existing = await prisma.tvDevice.findFirst({
      where: { roomId: newRoomId, deletedAt: null },
    });
    if (existing && existing.id !== deviceId) {
      throw new ConflictError('Target room already has a TV');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.tvDevice.update({
        where: { id: device.id },
        data: { roomId: newRoomId },
        include: { room: true },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'DEVICE_MOVED',
          resource: 'tv_device',
          resourceId: device.id,
          details: { from: device.roomId, to: newRoomId },
          success: true,
        },
      });

      return d;
    });

    // Push updated room info to TV
    const payload = await this.getHotelTvPayload(hotelId, newRoomId);
    emitToDevice(device.id, SOCKET_EVENTS.CONTENT_UPDATED, { ...payload, room: updated.room });

    return updated;
  }

  // ─── Heartbeat (from TV) ───────────────────────────────
  async recordHeartbeat(deviceId: string, data: {
    appVersion?: string;
    screenState?: TvScreenState;
    ipAddress?: string;
  }) {
    await prisma.tvDevice.update({
      where: { id: deviceId },
      data: {
        isOnline: true,
        lastSeenAt: new Date(),
        status: 'ONLINE',
        appVersion: data.appVersion,
        screenState: data.screenState,
        ipAddress: data.ipAddress,
      },
    });
  }

  // ─── Get TV payload (what the TV app needs) ────────────
  async getHotelTvPayload(hotelId: string, roomId?: string, connectedSsid?: string) {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        settings: true,
        wifiSettings: true,
        wifiZones: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        amenities: {
          where: { isActive: true },
          include: { amenity: true },
          orderBy: { sortOrder: 'asc' },
        },
        houseRules: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        checkoutSteps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        photos: { orderBy: { sortOrder: 'asc' } },
        announcements: {
          where: {
            isActive: true,
            OR: [
              { startsAt: null },
              { startsAt: { lte: new Date() } },
            ],
            AND: [
              { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
            ],
          },
        },
      },
    });

    if (!hotel) throw new NotFoundError('Hotel', hotelId);

    let room: any = null;
    if (roomId) {
      room = await prisma.room.findFirst({
        where: { id: roomId, hotelId },
        include: { wifiZone: true },
      });
    }

    // ─── Wi-Fi Matching Logic ───────────────────────
    let wifiPayload: {
      networkName: string;
      securityType: string;
      qrCodeUrl?: string | null;
      qrString?: string;
      isCustomZone?: boolean;
      status: 'MATCHED' | 'NOT_FOUND' | 'DEFAULT_FALLBACK';
      matchedSsid?: string;
      message?: string;
    } | null = null;

    const cleanConnectedSsid = connectedSsid?.trim().replace(/^"|"$/g, '');

    if (cleanConnectedSsid && cleanConnectedSsid !== '<unknown ssid>' && cleanConnectedSsid !== '0x') {
      // 1. Try matching room's assigned wifiZone first
      if (room?.wifiZone && room.wifiZone.isActive && room.wifiZone.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase()) {
        const password = this.getDecryptedZonePassword(room.wifiZone);
        const qrString = buildWifiQrString(room.wifiZone.ssid, password, room.wifiZone.securityType, room.wifiZone.isHidden);
        let qrCodeUrl: string | null = null;
        try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
        wifiPayload = {
          networkName: room.wifiZone.ssid,
          securityType: room.wifiZone.securityType,
          qrCodeUrl,
          qrString,
          isCustomZone: true,
          status: 'MATCHED',
          matchedSsid: room.wifiZone.ssid,
        };
      }

      // 2. Try matching any of the hotel's configured wifiZones
      if (!wifiPayload && hotel.wifiZones && hotel.wifiZones.length > 0) {
        // Handle duplicate SSIDs: if multiple zones have same SSID, prefer zone on same floor as room
        let matchedZone = hotel.wifiZones.find(z => 
          z.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase() && 
          room?.floor && z.floorCoverage && z.floorCoverage.includes(String(room.floor))
        );
        if (!matchedZone) {
          matchedZone = hotel.wifiZones.find(z => z.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase());
        }

        if (matchedZone) {
          const password = this.getDecryptedZonePassword(matchedZone);
          const qrString = buildWifiQrString(matchedZone.ssid, password, matchedZone.securityType, matchedZone.isHidden);
          let qrCodeUrl: string | null = null;
          try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
          wifiPayload = {
            networkName: matchedZone.ssid,
            securityType: matchedZone.securityType,
            qrCodeUrl,
            qrString,
            isCustomZone: true,
            status: 'MATCHED',
            matchedSsid: matchedZone.ssid,
          };
        }
      }

      // 3. Try matching hotel default Wi-Fi settings
      if (!wifiPayload && hotel.wifiSettings && hotel.wifiSettings.networkName.toLowerCase() === cleanConnectedSsid.toLowerCase()) {
        const qrString = buildWifiQrString(
          hotel.wifiSettings.networkName,
          hotel.wifiSettings.password,
          hotel.wifiSettings.securityType,
          hotel.wifiSettings.isHidden
        );
        wifiPayload = {
          networkName: hotel.wifiSettings.networkName,
          securityType: hotel.wifiSettings.securityType,
          qrCodeUrl: hotel.wifiSettings.qrCodeUrl,
          qrString,
          isCustomZone: false,
          status: 'MATCHED',
          matchedSsid: hotel.wifiSettings.networkName,
        };
      }

      // 4. If connected SSID does not match any hotel configuration
      if (!wifiPayload) {
        wifiPayload = {
          networkName: cleanConnectedSsid,
          securityType: 'WPA2',
          qrCodeUrl: null,
          qrString: '',
          status: 'NOT_FOUND',
          message: `Wi-Fi configuration not found for network "${cleanConnectedSsid}". Configure this network in Wi-Fi Management.`,
        };
      }
    } else {
      // No connected SSID reported by TV (e.g. Android permissions or Ethernet)
      // Fallback: room zone or hotel default
      if (room?.wifiZone && room.wifiZone.isActive) {
        const password = this.getDecryptedZonePassword(room.wifiZone);
        const qrString = buildWifiQrString(room.wifiZone.ssid, password, room.wifiZone.securityType, room.wifiZone.isHidden);
        let qrCodeUrl: string | null = null;
        try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
        wifiPayload = {
          networkName: room.wifiZone.ssid,
          securityType: room.wifiZone.securityType,
          qrCodeUrl,
          qrString,
          isCustomZone: true,
          status: 'DEFAULT_FALLBACK',
        };
      } else if (hotel.wifiSettings) {
        const qrString = buildWifiQrString(
          hotel.wifiSettings.networkName,
          hotel.wifiSettings.password,
          hotel.wifiSettings.securityType,
          hotel.wifiSettings.isHidden
        );
        wifiPayload = {
          networkName: hotel.wifiSettings.networkName,
          securityType: hotel.wifiSettings.securityType,
          qrCodeUrl: hotel.wifiSettings.qrCodeUrl,
          qrString,
          isCustomZone: false,
          status: 'DEFAULT_FALLBACK',
        };
      }
    }

    return {
      hotelId: hotel.id,
      name: hotel.name,
      description: hotel.description,
      logoUrl: hotel.logoUrl,
      coverImageUrl: hotel.coverImageUrl,
      primaryColor: hotel.primaryColor,
      accentColor: hotel.accentColor,
      settings: hotel.settings,
      wifi: wifiPayload,
      amenities: hotel.amenities.map((a) => ({
        id: a.id,
        name: a.customName || a.amenity?.name,
        icon: a.customIcon || a.amenity?.icon,
      })),
      houseRules: hotel.houseRules.map((r) => r.rule),
      checkoutSteps: hotel.checkoutSteps.map((s) => s.instruction),
      photos: hotel.photos,
      announcements: hotel.announcements,
      syncedAt: new Date().toISOString(),
    };
  }

  private getDecryptedZonePassword(zone: any): string | null {
    if (zone.encryptedPassword && zone.passwordIv && zone.passwordTag) {
      try {
        return decryptPassword(zone.encryptedPassword, zone.passwordIv, zone.passwordTag);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async getDefaultHotelId(): Promise<string> {
    // For unpaired devices — assign to a placeholder
    // In practice the hotel is set during confirmation
    const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!hotel) throw new AppError('No hotels found in system', 500);
    return hotel.id;
  }
}

export const devicesService = new DevicesService();

