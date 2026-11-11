import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { SecurityType } from '@prisma/client';
import { encryptPassword, decryptPassword } from '../../utils/crypto';
import { emitToDevice, emitToHotel, SOCKET_EVENTS } from '../../core/realtime/socket';
import QRCode from 'qrcode';

export interface CreateWifiZoneInput {
  name: string;
  ssid: string;
  password?: string | null;
  securityType?: SecurityType;
  isHidden?: boolean;
  floorCoverage?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateWifiZoneInput {
  name?: string;
  ssid?: string;
  password?: string | null;
  securityType?: SecurityType;
  isHidden?: boolean;
  floorCoverage?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export function buildWifiQrString(
  ssid: string,
  password?: string | null,
  securityType: SecurityType = 'WPA2',
  isHidden: boolean = false
): string {
  const escapeVal = (val: string) => val.replace(/([\\;,":])/g, '\\$1');
  
  let type = 'WPA';
  if (securityType === 'OPEN') {
    type = 'nopass';
  } else if (securityType === 'WEP') {
    type = 'WEP';
  } else {
    type = 'WPA';
  }
  
  const escapedSsid = escapeVal(ssid);
  const escapedPassword = password ? escapeVal(password) : '';
  const hidden = isHidden ? 'H:true;' : '';
  
  if (type === 'nopass') {
    return `WIFI:S:${escapedSsid};T:nopass;;${hidden};`;
  }
  
  return `WIFI:S:${escapedSsid};T:${type};P:${escapedPassword};${hidden};`;
}

export class WifiService {
  // ─── Create Zone ──────────────────────────────────────────
  async createZone(hotelId: string, data: CreateWifiZoneInput, userId?: string) {
    let encryptedPassword: string | null = null;
    let passwordIv: string | null = null;
    let passwordTag: string | null = null;

    if (data.password && data.securityType !== 'OPEN') {
      const encrypted = encryptPassword(data.password);
      encryptedPassword = encrypted.encrypted;
      passwordIv = encrypted.iv;
      passwordTag = encrypted.tag;
    }

    const zone = await prisma.$transaction(async (tx) => {
      const newZone = await tx.wifiZone.create({
        data: {
          hotelId,
          name: data.name,
          ssid: data.ssid,
          encryptedPassword,
          passwordIv,
          passwordTag,
          securityType: data.securityType || 'WPA2',
          isHidden: data.isHidden ?? false,
          floorCoverage: data.floorCoverage,
          description: data.description,
          isActive: data.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'WIFI_ZONE_CREATED',
          resource: 'wifi_zone',
          resourceId: newZone.id,
          details: { name: newZone.name, ssid: newZone.ssid },
          success: true,
        },
      });

      return newZone;
    });

    return this.maskZone(zone);
  }

  // ─── List Zones ───────────────────────────────────────────
  async listZones(hotelId: string) {
    const zones = await prisma.wifiZone.findMany({
      where: { hotelId },
      include: {
        _count: { select: { rooms: true } },
        rooms: {
          select: { id: true, roomNumber: true, floor: true },
          orderBy: { roomNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return zones.map((zone) => this.maskZone(zone));
  }

  // ─── Get Zone ─────────────────────────────────────────────
  async getZone(hotelId: string, zoneId: string) {
    const zone = await prisma.wifiZone.findFirst({
      where: { id: zoneId, hotelId },
      include: {
        rooms: {
          select: { id: true, roomNumber: true, floor: true },
          orderBy: { roomNumber: 'asc' },
        },
        _count: { select: { rooms: true } },
      },
    });

    if (!zone) {
      throw new NotFoundError('Wi-Fi Zone', zoneId);
    }

    return this.maskZone(zone);
  }

  // ─── Update Zone ──────────────────────────────────────────
  async updateZone(hotelId: string, zoneId: string, data: UpdateWifiZoneInput, userId?: string) {
    const existing = await prisma.wifiZone.findFirst({
      where: { id: zoneId, hotelId },
      include: { rooms: { include: { device: true } } },
    });

    if (!existing) {
      throw new NotFoundError('Wi-Fi Zone', zoneId);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.ssid !== undefined) updateData.ssid = data.ssid;
    if (data.securityType !== undefined) updateData.securityType = data.securityType;
    if (data.isHidden !== undefined) updateData.isHidden = data.isHidden;
    if (data.floorCoverage !== undefined) updateData.floorCoverage = data.floorCoverage;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    let passwordChanged = false;
    if (data.password !== undefined) {
      if (data.password && (data.securityType || existing.securityType) !== 'OPEN') {
        const encrypted = encryptPassword(data.password);
        updateData.encryptedPassword = encrypted.encrypted;
        updateData.passwordIv = encrypted.iv;
        updateData.passwordTag = encrypted.tag;
        passwordChanged = true;
      } else {
        updateData.encryptedPassword = null;
        updateData.passwordIv = null;
        updateData.passwordTag = null;
        passwordChanged = true;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const z = await tx.wifiZone.update({
        where: { id: zoneId },
        data: updateData,
        include: {
          rooms: {
            select: { id: true, roomNumber: true, floor: true },
          },
          _count: { select: { rooms: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'WIFI_ZONE_UPDATED',
          resource: 'wifi_zone',
          resourceId: zoneId,
          details: { name: z.name, passwordChanged },
          success: true,
        },
      });

      return z;
    });

    // Emit updates to all hotel TVs with decrypted password & matched status
    const plainPassword = passwordChanged ? data.password : (existing.encryptedPassword && existing.passwordIv && existing.passwordTag ? decryptPassword(existing.encryptedPassword, existing.passwordIv, existing.passwordTag) : '');
    const wifiPayload = {
      zoneId,
      ssid: updated.ssid,
      networkName: updated.ssid,
      password: plainPassword || '',
      securityType: updated.securityType,
      status: 'MATCHED',
      timestamp: new Date().toISOString(),
    };

    try {
      const { devicesService } = await import('../devices/devices.service');
      const hotelDevices = await prisma.tvDevice.findMany({
        where: { hotelId, deletedAt: null },
        include: { room: true },
      });
      for (const dev of hotelDevices) {
        const devPayload = await devicesService.getHotelTvPayload(hotelId, dev.roomId || undefined);
        emitToDevice(dev.id, SOCKET_EVENTS.WIFI_UPDATED, devPayload.wifi);
        emitToDevice(dev.id, 'wifi.updated', devPayload.wifi);
        emitToDevice(dev.id, SOCKET_EVENTS.CONTENT_UPDATED, devPayload);
        if (dev.deviceId && dev.deviceId !== dev.id) {
          emitToDevice(dev.deviceId, SOCKET_EVENTS.WIFI_UPDATED, devPayload.wifi);
          emitToDevice(dev.deviceId, 'wifi.updated', devPayload.wifi);
          emitToDevice(dev.deviceId, SOCKET_EVENTS.CONTENT_UPDATED, devPayload);
        }
      }
    } catch (broadcastErr) {
      console.warn('[WiFiService] Device broadcast warning:', broadcastErr);
    }

    // Also notify hotel dashboard and hotel broadcast channel
    emitToHotel(hotelId, SOCKET_EVENTS.WIFI_UPDATED, wifiPayload);
    emitToHotel(hotelId, 'wifi.updated', wifiPayload);
    emitToHotel(hotelId, SOCKET_EVENTS.CONTENT_UPDATED, { wifi: wifiPayload });

    return this.maskZone(updated);
  }

  // ─── Delete Zone ──────────────────────────────────────────
  async deleteZone(hotelId: string, zoneId: string, userId?: string) {
    const zone = await prisma.wifiZone.findFirst({
      where: { id: zoneId, hotelId },
      include: { _count: { select: { rooms: true } } },
    });

    if (!zone) {
      throw new NotFoundError('Wi-Fi Zone', zoneId);
    }

    if (zone._count.rooms > 0) {
      throw new ConflictError(`Cannot delete Wi-Fi zone with ${zone._count.rooms} assigned room(s). Reassign them first.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.wifiZone.delete({ where: { id: zoneId } });
      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'WIFI_ZONE_UPDATED',
          resource: 'wifi_zone',
          resourceId: zoneId,
          details: { action: 'deleted', name: zone.name },
          success: true,
        },
      });
    });

    return { success: true, message: 'Wi-Fi zone deleted successfully' };
  }

  // ─── Assign Rooms to Zone ─────────────────────────────────
  async assignRoomsToZone(hotelId: string, zoneId: string, roomIds: string[], userId?: string) {
    const zone = await prisma.wifiZone.findFirst({
      where: { id: zoneId, hotelId },
    });

    if (!zone) {
      throw new NotFoundError('Wi-Fi Zone', zoneId);
    }

    // Verify rooms belong to hotel
    const validRooms = await prisma.room.findMany({
      where: { id: { in: roomIds }, hotelId, deletedAt: null },
      include: { device: true },
    });

    if (validRooms.length !== roomIds.length) {
      throw new AppError('Some rooms do not belong to this hotel or were not found', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.room.updateMany({
        where: { id: { in: roomIds }, hotelId },
        data: { wifiZoneId: zoneId },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'WIFI_ZONE_UPDATED',
          resource: 'wifi_zone',
          resourceId: zoneId,
          details: { action: 'assign_rooms', roomCount: roomIds.length, roomIds },
          success: true,
        },
      });
    });

    // Emit updates to affected room devices
    for (const r of validRooms) {
      if (r.device?.isOnline) {
        emitToDevice(r.device.id, SOCKET_EVENTS.WIFI_UPDATED, {
          zoneId,
          ssid: zone.ssid,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      success: true,
      message: `${roomIds.length} room(s) assigned to zone "${zone.name}"`,
      assignedRoomCount: roomIds.length,
    };
  }

  // ─── Get Zone QR Data for Room ────────────────────────────
  async getZoneQrData(hotelId: string, roomId: string) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: {
        wifiZone: true,
        hotel: { include: { wifiSettings: true } },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    if (room.wifiZone && room.wifiZone.isActive) {
      let password: string | null = null;
      if (room.wifiZone.encryptedPassword && room.wifiZone.passwordIv && room.wifiZone.passwordTag) {
        password = decryptPassword(
          room.wifiZone.encryptedPassword,
          room.wifiZone.passwordIv,
          room.wifiZone.passwordTag
        );
      }

      const qrString = buildWifiQrString(
        room.wifiZone.ssid,
        password,
        room.wifiZone.securityType,
        room.wifiZone.isHidden
      );

      const qrCodeUrl = await QRCode.toDataURL(qrString);

      return {
        zoneId: room.wifiZone.id,
        zoneName: room.wifiZone.name,
        ssid: room.wifiZone.ssid,
        securityType: room.wifiZone.securityType,
        isHidden: room.wifiZone.isHidden,
        qrString,
        qrCodeUrl,
        isCustomZone: true,
      };
    }

    // Fallback to hotel default wifi settings
    if (room.hotel.wifiSettings) {
      const ws = room.hotel.wifiSettings;
      const qrString = buildWifiQrString(
        ws.networkName,
        ws.password,
        ws.securityType,
        ws.isHidden
      );

      const qrCodeUrl = ws.qrCodeUrl || await QRCode.toDataURL(qrString);

      return {
        zoneId: null,
        zoneName: 'Hotel Default',
        ssid: ws.networkName,
        securityType: ws.securityType,
        isHidden: ws.isHidden,
        qrString,
        qrCodeUrl,
        isCustomZone: false,
      };
    }

    throw new NotFoundError('No Wi-Fi configuration found for this room or hotel');
  }

  // ─── Get Room Wi-Fi Payload (used by TV payload) ─────────
  async getRoomWifiPayload(roomId: string): Promise<{ ssid: string; qrString: string; qrCodeUrl?: string } | null> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        wifiZone: true,
        hotel: { include: { wifiSettings: true } },
      },
    });

    if (!room) return null;

    if (room.wifiZone && room.wifiZone.isActive) {
      let password: string | null = null;
      if (room.wifiZone.encryptedPassword && room.wifiZone.passwordIv && room.wifiZone.passwordTag) {
        try {
          password = decryptPassword(
            room.wifiZone.encryptedPassword,
            room.wifiZone.passwordIv,
            room.wifiZone.passwordTag
          );
        } catch {
          password = null;
        }
      }

      const qrString = buildWifiQrString(
        room.wifiZone.ssid,
        password,
        room.wifiZone.securityType,
        room.wifiZone.isHidden
      );

      return {
        ssid: room.wifiZone.ssid,
        qrString,
      };
    }

    if (room.hotel.wifiSettings) {
      const ws = room.hotel.wifiSettings;
      const qrString = buildWifiQrString(
        ws.networkName,
        ws.password,
        ws.securityType,
        ws.isHidden
      );

      return {
        ssid: ws.networkName,
        qrString,
        qrCodeUrl: ws.qrCodeUrl || undefined,
      };
    }

    return null;
  }

  // ─── Helper to mask zone passwords ────────────────────────
  private maskZone<T extends Record<string, any>>(zone: T): Omit<T, 'encryptedPassword' | 'passwordIv' | 'passwordTag'> & { hasPassword: boolean; passwordMasked: string | null } {
    const { encryptedPassword, passwordIv, passwordTag, ...rest } = zone as any;
    return {
      ...rest,
      hasPassword: Boolean(encryptedPassword),
      passwordMasked: encryptedPassword ? '••••••••' : null,
    };
  }
}

export const wifiService = new WifiService();
