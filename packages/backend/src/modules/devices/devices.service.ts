import { nanoid } from 'nanoid';
import { customAlphabet } from 'nanoid';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { redis } from '../../config/redis';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { emitToHotel, emitToDevice, emitToDeviceWithAck, SOCKET_EVENTS } from '../../core/realtime/socket';
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

    const mappedDeviceInfo = {
      deviceModel: deviceInfo?.model || (deviceInfo as any)?.deviceModel,
      deviceBrand: deviceInfo?.brand || (deviceInfo as any)?.deviceBrand,
      osVersion: deviceInfo?.osVersion,
      appVersion: deviceInfo?.appVersion,
      screenWidth: deviceInfo?.screenWidth,
      screenHeight: deviceInfo?.screenHeight,
    };

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
          ...mappedDeviceInfo,
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
          ...mappedDeviceInfo,
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

    if (!deviceDbId) {
      throw new AppError('Invalid or expired TV pairing code. No TV display found with this code. Please check the TV screen.', 400, 'PAIRING_CODE_INVALID');
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
          pairingCode: cleanCode,
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

    // Generate device token containing both hardwareId (deviceId) and database UUID (dbId)
    const deviceToken = jwt.sign(
      {
        deviceId: device.deviceId,
        dbId: deviceDbId,
        hotelId,
      },
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

    // Send pairing confirmation to TV via WebSocket across all identifier channels
    const pairPayload = {
      deviceToken,
      hotel: updatedDevice.hotel,
      room: updatedDevice.room,
    };
    emitToDevice(deviceDbId, SOCKET_EVENTS.DEVICE_PAIRED, pairPayload);
    emitToDevice(deviceDbId, 'DEVICE_PAIRED', pairPayload);
    if (device.deviceId && device.deviceId !== deviceDbId) {
      emitToDevice(device.deviceId, SOCKET_EVENTS.DEVICE_PAIRED, pairPayload);
      emitToDevice(device.deviceId, 'DEVICE_PAIRED', pairPayload);
    }

    // Notify hotel dashboard
    emitToHotel(hotelId, SOCKET_EVENTS.DEVICE_PAIRED, {
      device: updatedDevice,
      timestamp: new Date().toISOString(),
    });

    return { device: updatedDevice, deviceToken };
  }

  // ─── Get hotel's TV devices ────────────────────────────
  async getHotelDevices(hotelId: string) {
    const devices = await prisma.tvDevice.findMany({
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

    const now = Date.now();
    return devices.map((d) => {
      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const isRecentlySeen = (now - lastSeenMs) < 90000; // heartbeat within 90s
      const isRecentlyPaired = d.pairedAt ? (now - new Date(d.pairedAt).getTime()) < 120000 : false;
      const computedOnline = Boolean((d.isOnline && isRecentlySeen) || isRecentlyPaired);

      return {
        ...d,
        isOnline: computedOnline,
        status: computedOnline ? 'ONLINE' : (d.status === 'PAIRED' ? 'OFFLINE' : d.status),
      };
    });
  }

  // ─── Get single device ─────────────────────────────────
  async getDevice(hotelId: string, deviceId: string) {
    const device = await prisma.tvDevice.findFirst({
      where: {
        OR: [{ id: deviceId }, { deviceId }],
        hotelId,
        deletedAt: null,
      },
      include: {
        room: { include: { currentBooking: { include: { guest: true } } } },
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
      },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);

    const now = Date.now();
    const lastSeenMs = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
    const isRecentlySeen = (now - lastSeenMs) < 90000;
    const isRecentlyPaired = device.pairedAt ? (now - new Date(device.pairedAt).getTime()) < 120000 : false;
    const computedOnline = Boolean((device.isOnline && isRecentlySeen) || isRecentlyPaired);

    return {
      ...device,
      isOnline: computedOnline,
      status: computedOnline ? 'ONLINE' : (device.status === 'PAIRED' ? 'OFFLINE' : device.status),
    };
  }

  // ─── Send Remote Command with Mandatory ACK ──────────
  async sendCommand(hotelId: string, deviceId: string, command: string, payload?: any) {
    const device = await prisma.tvDevice.findFirst({
      where: { id: deviceId, hotelId, deletedAt: null },
      include: { room: true },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);

    const validCommands = [
      'REFRESH_SCREEN',
      'UPDATE_ROOM',
      'REFRESH_WIFI',
      'SEND_MESSAGE',
      'CHECKOUT_REMINDER',
      'CHECKOUT_NOTIFY',
      'CLEAR_GUEST',
    ];
    if (!validCommands.includes(command)) {
      throw new AppError(`Invalid remote command: ${command}. Valid commands: ${validCommands.join(', ')}`, 400);
    }

    // Try primary room (database UUID)
    let ackResult = await emitToDeviceWithAck(device.id, SOCKET_EVENTS.DEVICE_COMMAND, {
      command,
      payload,
      deviceId: device.id,
      hardwareId: device.deviceId,
      roomNumber: device.room?.roomNumber,
      timestamp: new Date().toISOString(),
    }, 5000);

    // If no socket in primary room, try hardwareId room
    if (!ackResult.acknowledged && device.deviceId && device.deviceId !== device.id) {
      ackResult = await emitToDeviceWithAck(device.deviceId, SOCKET_EVENTS.DEVICE_COMMAND, {
        command,
        payload,
        deviceId: device.id,
        hardwareId: device.deviceId,
        roomNumber: device.room?.roomNumber,
        timestamp: new Date().toISOString(),
      }, 5000);
    }

    if (!ackResult.acknowledged) {
      throw new AppError(ackResult.error || `TV device did not acknowledge command '${command}'`, 504, 'DEVICE_ACK_TIMEOUT');
    }

    return {
      success: true,
      command,
      acknowledged: true,
      ackData: ackResult.ackData,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Connection & Fleet Diagnostics ──────────────────
  async getDiagnostics() {
    let dbStatus = 'CONNECTED';
    let redisStatus = 'CONNECTED';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'DISCONNECTED';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'DISCONNECTED';
    }

    const devices = await prisma.tvDevice.findMany({
      where: { deletedAt: null },
      select: { id: true, isOnline: true, lastSeenAt: true, pairedAt: true, status: true },
    });

    const now = Date.now();
    const onlineCount = devices.filter((d) => {
      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      return (now - lastSeenMs) < 90000 || (d.pairedAt && (now - new Date(d.pairedAt).getTime()) < 120000);
    }).length;

    return {
      backendReachable: true,
      serverTime: new Date().toISOString(),
      lanIp: '192.168.29.219',
      port: env.PORT,
      database: dbStatus,
      redis: redisStatus,
      fleet: {
        totalDevices: devices.length,
        onlineDevices: onlineCount,
        offlineDevices: devices.length - onlineCount,
      },
    };
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
  async moveDevice(hotelId: string, deviceId: string, newRoomId: string, userId?: string) {
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
    if (existing && existing.id !== device.id) {
      throw new ConflictError('Target room already has a TV');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.tvDevice.update({
        where: { id: device.id },
        data: { roomId: newRoomId },
        include: { room: true },
      });

      try {
        await tx.auditLog.create({
          data: {
            hotelId,
            userId: userId || null,
            action: 'DEVICE_MOVED',
            resource: 'tv_device',
            resourceId: device.id,
            details: { from: device.roomId, to: newRoomId },
            success: true,
          },
        });
      } catch (e) {
        console.warn('AuditLog warning during moveDevice:', e);
      }

      return d;
    });

    // Push updated room info to TV
    const payload = await this.getHotelTvPayload(hotelId, newRoomId);
    emitToDevice(device.id, SOCKET_EVENTS.CONTENT_UPDATED, { ...payload, room: updated.room });
    if (device.deviceId && device.deviceId !== device.id) {
      emitToDevice(device.deviceId, SOCKET_EVENTS.CONTENT_UPDATED, { ...payload, room: updated.room });
    }

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
        screensaverConfig: true,
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
    let activeGuest: any = null;
    if (roomId) {
      room = await prisma.room.findFirst({
        where: { id: roomId, hotelId, deletedAt: null },
        include: { wifiZone: true },
      });
      if (room?.currentBookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: room.currentBookingId },
          include: { guest: true },
        });
        if (booking && booking.status === 'CHECKED_IN') {
          activeGuest = {
            id: booking.guest.id,
            name: `${booking.guest.firstName} ${booking.guest.lastName}`.trim(),
            firstName: booking.guest.firstName,
            checkIn: booking.checkInDate,
            checkOut: booking.checkOutDate,
            checkoutTime: hotel.settings?.checkOutTime || '11:00 AM',
          };
        }
      }
    }

    // ─── Wi-Fi Matching Logic ───────────────────────
    let wifiPayload: {
      networkName: string;
      securityType: string;
      password?: string;
      qrCodeUrl?: string | null;
      qrString?: string | null;
      isCustomZone?: boolean;
      status: 'MATCHED' | 'NOT_FOUND' | 'ROOM_ZONE' | 'CONNECTED_UNMATCHED';
      matchedSsid?: string | null;
      message?: string;
    } | null = null;

    const cleanConnectedSsid = connectedSsid?.trim().replace(/^"|"$/g, '');

    if (cleanConnectedSsid && cleanConnectedSsid !== '<unknown ssid>' && cleanConnectedSsid !== '0x') {
      // 1. Try matching room's assigned wifiZone first
      if (room?.wifiZone && room.wifiZone.isActive && room.wifiZone.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase()) {
        const password = this.getDecryptedZonePassword(room.wifiZone);
        const qrString = buildWifiQrString(cleanConnectedSsid, password, room.wifiZone.securityType, room.wifiZone.isHidden);
        let qrCodeUrl: string | null = null;
        try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
        wifiPayload = {
          networkName: cleanConnectedSsid,
          securityType: room.wifiZone.securityType,
          password: password || '',
          qrCodeUrl,
          qrString,
          isCustomZone: true,
          status: 'MATCHED',
          matchedSsid: room.wifiZone.ssid,
        };
      }

      // 2. Try matching any of the hotel's configured wifiZones
      if (!wifiPayload && hotel.wifiZones && hotel.wifiZones.length > 0) {
        let matchedZone = hotel.wifiZones.find(z => 
          z.isActive && z.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase() && 
          room?.floor && z.floorCoverage && z.floorCoverage.includes(String(room.floor))
        );
        if (!matchedZone) {
          matchedZone = hotel.wifiZones.find(z => z.isActive && z.ssid.toLowerCase() === cleanConnectedSsid.toLowerCase());
        }

        if (matchedZone) {
          const password = this.getDecryptedZonePassword(matchedZone);
          const qrString = buildWifiQrString(cleanConnectedSsid, password, matchedZone.securityType, matchedZone.isHidden);
          let qrCodeUrl: string | null = null;
          try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
          wifiPayload = {
            networkName: cleanConnectedSsid,
            securityType: matchedZone.securityType,
            password: password || '',
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
          cleanConnectedSsid,
          hotel.wifiSettings.password,
          hotel.wifiSettings.securityType,
          hotel.wifiSettings.isHidden
        );
        wifiPayload = {
          networkName: cleanConnectedSsid,
          securityType: hotel.wifiSettings.securityType,
          password: hotel.wifiSettings.password || '',
          qrCodeUrl: hotel.wifiSettings.qrCodeUrl,
          qrString,
          isCustomZone: false,
          status: 'MATCHED',
          matchedSsid: hotel.wifiSettings.networkName,
        };
      }

      // 4. Connected SSID does not match any configured zone:
      // Never display a misleading or unrelated QR code
      if (!wifiPayload) {
        wifiPayload = {
          networkName: cleanConnectedSsid,
          securityType: 'UNKNOWN',
          password: '',
          qrCodeUrl: null,
          qrString: null,
          isCustomZone: false,
          status: 'CONNECTED_UNMATCHED',
          matchedSsid: null,
          message: `Connected to ${cleanConnectedSsid} (Unmatched Wi-Fi zone)`,
        };
      }
    }

    // If connected SSID not detected (e.g. Ethernet LAN or permission restricted)
    if (!wifiPayload) {
      if (room?.wifiZone && room.wifiZone.isActive) {
        const password = this.getDecryptedZonePassword(room.wifiZone);
        const qrString = buildWifiQrString(room.wifiZone.ssid, password, room.wifiZone.securityType, room.wifiZone.isHidden);
        let qrCodeUrl: string | null = null;
        try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
        wifiPayload = {
          networkName: room.wifiZone.ssid,
          securityType: room.wifiZone.securityType,
          password: password || '',
          qrCodeUrl,
          qrString,
          isCustomZone: true,
          status: 'ROOM_ZONE',
          matchedSsid: room.wifiZone.ssid,
        };
      } else if (hotel.wifiZones && hotel.wifiZones.length > 0) {
        const activeZone = hotel.wifiZones.find(z => z.isActive) || hotel.wifiZones[0];
        const password = this.getDecryptedZonePassword(activeZone);
        const qrString = buildWifiQrString(activeZone.ssid, password, activeZone.securityType, activeZone.isHidden);
        let qrCodeUrl: string | null = null;
        try { qrCodeUrl = await QRCode.toDataURL(qrString); } catch {}
        wifiPayload = {
          networkName: activeZone.ssid,
          securityType: activeZone.securityType,
          password: password || '',
          qrCodeUrl,
          qrString,
          isCustomZone: true,
          status: 'ROOM_ZONE',
          matchedSsid: activeZone.ssid,
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
          password: hotel.wifiSettings.password || '',
          qrCodeUrl: hotel.wifiSettings.qrCodeUrl,
          qrString,
          isCustomZone: false,
          status: 'ROOM_ZONE',
          matchedSsid: hotel.wifiSettings.networkName,
        };
      } else {
        wifiPayload = {
          networkName: '',
          securityType: 'OPEN',
          password: '',
          qrCodeUrl: null,
          qrString: null,
          isCustomZone: false,
          status: 'NOT_FOUND',
          message: 'No Wi-Fi zone configured for this hotel',
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
      room: room ? {
        id: room.id,
        number: room.roomNumber,
        floor: room.floor,
        wifiZone: room.wifiZone ? {
          id: room.wifiZone.id,
          name: room.wifiZone.name,
          ssid: room.wifiZone.ssid,
        } : null,
      } : null,
      guest: activeGuest,
      amenities: hotel.amenities.map((a) => ({
        id: a.id,
        name: a.customName || a.amenity?.name,
        icon: a.customIcon || a.amenity?.icon,
      })),
      houseRules: hotel.houseRules.map((r) => r.rule),
      checkoutSteps: hotel.checkoutSteps.map((s) => s.instruction),
      photos: hotel.photos,
      announcements: hotel.announcements,
      screensaver: hotel.screensaverConfig,
      syncedAt: new Date().toISOString(),
    };
  }

  // ─── Assign TV to Room (Strict 1-to-1 with atomic replacement) ───
  async assignDeviceToRoom(
    hotelId: string,
    deviceId: string,
    roomId: string,
    userId?: string,
    replaceExisting: boolean = true
  ) {
    const device = await prisma.tvDevice.findFirst({
      where: {
        OR: [{ id: deviceId }, { deviceId }],
        hotelId,
        deletedAt: null,
      },
      include: { room: true },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);

    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: { device: true },
    });
    if (!room) throw new NotFoundError('Room', roomId);

    let replacedDeviceId: string | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. If another TV is assigned to this target room
      const existingTvOnRoom = await tx.tvDevice.findFirst({
        where: { roomId, deletedAt: null },
      });

      if (existingTvOnRoom && existingTvOnRoom.id !== device.id) {
        if (!replaceExisting) {
          throw new ConflictError(
            `Room ${room.roomNumber} already has TV '${existingTvOnRoom.name || existingTvOnRoom.deviceId}' assigned. Replace it or unassign first.`
          );
        }
        // Safely unassign previous TV
        await tx.tvDevice.update({
          where: { id: existingTvOnRoom.id },
          data: {
            roomId: null,
            status: 'UNPAIRED',
            screenState: 'UNPAIRED',
          },
        });
        replacedDeviceId = existingTvOnRoom.id;
      }

      // If device was previously in a different room, clear it
      if (device.roomId && device.roomId !== roomId) {
        await tx.tvDevice.update({
          where: { id: device.id },
          data: { roomId: null },
        });
      }

      // 2. Assign current TV to new room
      const d = await tx.tvDevice.update({
        where: { id: device.id },
        data: {
          roomId,
          status: 'PAIRED',
          screenState: 'DEFAULT_MODE',
        },
        include: { room: true },
      });

      // 3. Audit log (Valid AuditAction enum: DEVICE_MOVED or DEVICE_PAIRED)
      try {
        await tx.auditLog.create({
          data: {
            hotelId,
            userId: userId || null,
            action: device.roomId ? 'DEVICE_MOVED' : 'DEVICE_PAIRED',
            resource: 'tv_device',
            resourceId: device.id,
            details: {
              roomId,
              roomNumber: room.roomNumber,
              replacedDeviceId,
              previousRoomId: device.roomId,
            },
            success: true,
          },
        });
      } catch (e) {
        console.warn('AuditLog warning during assignDeviceToRoom:', e);
      }

      return d;
    });

    // Notify previously assigned TV if replaced
    if (replacedDeviceId) {
      emitToDevice(replacedDeviceId, SOCKET_EVENTS.SCREEN_REFRESH, { action: 'UNASSIGNED' });
    }

    // Push new room payload to newly assigned TV
    try {
      const payload = await this.getHotelTvPayload(hotelId, roomId);
      emitToDevice(device.id, SOCKET_EVENTS.CONTENT_UPDATED, { ...payload, room: updated.room });
      if (device.deviceId && device.deviceId !== device.id) {
        emitToDevice(device.deviceId, SOCKET_EVENTS.CONTENT_UPDATED, { ...payload, room: updated.room });
      }
    } catch {}

    // Notify dashboard
    emitToHotel(hotelId, 'device.assignment.updated', {
      deviceId: device.id,
      roomId,
      roomNumber: room.roomNumber,
      replacedDeviceId,
      action: 'ASSIGNED',
    });

    return updated;
  }

  // ─── Unassign TV from Room (Preserves device record & credentials) ───
  async unassignDevice(hotelId: string, deviceId: string, userId?: string) {
    const device = await prisma.tvDevice.findFirst({
      where: {
        OR: [{ id: deviceId }, { deviceId }],
        hotelId,
        deletedAt: null,
      },
      include: { room: true },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);

    const oldRoomId = device.roomId;
    const oldRoomNumber = device.room?.roomNumber;

    await prisma.$transaction(async (tx) => {
      await tx.tvDevice.update({
        where: { id: device.id },
        data: {
          roomId: null,
          status: 'UNPAIRED',
          screenState: 'UNPAIRED',
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            hotelId,
            userId: userId || null,
            action: 'DEVICE_UNPAIRED',
            resource: 'tv_device',
            resourceId: device.id,
            details: { previousRoomId: oldRoomId, previousRoomNumber: oldRoomNumber },
            success: true,
          },
        });
      } catch (e) {
        console.warn('AuditLog warning during unassignDevice:', e);
      }
    });

    // Signal TV to clear room state and show pairing / unassigned screen
    emitToDevice(device.id, SOCKET_EVENTS.SCREEN_REFRESH, { action: 'UNASSIGNED' });
    if (device.deviceId && device.deviceId !== device.id) {
      emitToDevice(device.deviceId, SOCKET_EVENTS.SCREEN_REFRESH, { action: 'UNASSIGNED' });
    }

    // Notify dashboard
    emitToHotel(hotelId, 'device.assignment.updated', {
      deviceId: device.id,
      roomId: null,
      previousRoomId: oldRoomId,
      action: 'UNASSIGNED',
    });

    return {
      success: true,
      message: `TV device '${device.name || device.deviceId}' unassigned successfully.`,
    };
  }

  // ─── Safe Delete TV Device (Revokes token, severs session, preserves audit) ───
  async deleteDevice(hotelId: string, deviceId: string, userId?: string) {
    const device = await prisma.tvDevice.findFirst({
      where: {
        OR: [{ id: deviceId }, { deviceId }],
        hotelId,
        deletedAt: null,
      },
      include: { room: true },
    });
    if (!device) throw new NotFoundError('TV device', deviceId);

    await prisma.$transaction(async (tx) => {
      // Disconnect room first to avoid foreign key / unique constraints
      if (device.roomId) {
        await tx.tvDevice.update({
          where: { id: device.id },
          data: { roomId: null },
        });
      }

      await tx.tvDevice.update({
        where: { id: device.id },
        data: {
          deletedAt: new Date(),
          roomId: null,
          deviceToken: null,
          isOnline: false,
          status: 'OFFLINE',
          screenState: 'UNPAIRED',
          pairingCode: null,
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            hotelId,
            userId: userId || null,
            action: 'DEVICE_UNPAIRED',
            resource: 'tv_device',
            resourceId: device.id,
            details: {
              deviceId: device.deviceId,
              name: device.name,
              lastRoomNumber: device.room?.roomNumber,
              action: 'DELETED',
            },
            success: true,
          },
        });
      } catch (e) {
        console.warn('AuditLog warning during deleteDevice:', e);
      }
    });

    // Disconnect and revoke token on TV
    emitToDevice(device.id, 'DEVICE_REVOKED', {
      message: 'This TV registration has been removed by hotel administration.',
    });
    if (device.deviceId && device.deviceId !== device.id) {
      emitToDevice(device.deviceId, 'DEVICE_REVOKED', {
        message: 'This TV registration has been removed by hotel administration.',
      });
    }

    // Notify dashboard
    emitToHotel(hotelId, 'device.deleted', { deviceId: device.id });

    return {
      success: true,
      message: `TV device '${device.name || device.deviceId}' has been safely deleted and its session revoked.`,
    };
  }

  // ─── Get Unassigned TV Devices for Room Assignment Dropdowns ───
  async getAvailableDevices(hotelId: string) {
    return prisma.tvDevice.findMany({
      where: {
        hotelId,
        roomId: null,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Get Rooms without any Assigned TV ───
  async getAvailableRooms(hotelId: string) {
    return prisma.room.findMany({
      where: {
        hotelId,
        deletedAt: null,
        device: null,
      },
      include: {
        roomType: true,
        wifiZone: true,
      },
      orderBy: { roomNumber: 'asc' },
    });
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
    // For unpaired devices — assign to default or auto-create placeholder hotel
    let hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!hotel) {
      hotel = await prisma.hotel.create({
        data: {
          name: 'SmartStay Hotel',
          slug: 'smartstay-hotel-' + Date.now(),
          phone: '+91 800 555 0199',
          email: 'contact@smartstay.com',
          country: 'India',
        },
      });
    }
    return hotel.id;
  }
}

export const devicesService = new DevicesService();

