import { Server, Socket } from 'socket.io';
import { authService } from '../../modules/auth/auth.service';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// ─── Event types ──────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Server → Client
  GUEST_CHECKED_IN: 'guest.checked_in',
  GUEST_CHECKED_OUT: 'guest.checked_out',
  BOOKING_UPDATED: 'booking.updated',
  DEVICE_PAIRED: 'device.paired',
  DEVICE_ONLINE: 'device.online',
  DEVICE_OFFLINE: 'device.offline',
  HOTEL_SETTINGS_UPDATED: 'hotel.settings.updated',
  WIFI_UPDATED: 'wifi.updated',
  SCREEN_REFRESH: 'screen.refresh',
  CONTENT_UPDATED: 'content.updated',
  ROOM_STATUS_UPDATED: 'room.status.updated',
  CHECKOUT_REMINDER: 'checkout.reminder',
  CHECKOUT_OVERDUE: 'checkout.overdue',
  NOTIFICATION: 'notification',
  DEVICE_COMMAND: 'device.command',
  
  // Client → Server (TV devices)
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_REGISTER: 'device.register',
  SCREEN_STATE_CHANGED: 'device.screen_state_changed',
  
  // Client → Server (dashboard)
  JOIN_HOTEL: 'hotel.join',
  LEAVE_HOTEL: 'hotel.leave',
} as const;

// ─── Room naming ──────────────────────────────────────────
export const getHotelRoom = (hotelId: string) => `hotel:${hotelId}`;
export const getDeviceRoom = (deviceId: string) => `device:${deviceId}`;

export function setupSocketIO(io: Server) {
  _io = io;

  // ─── Authentication middleware ────────────────────────────
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.slice(7);
    const deviceToken = socket.handshake.auth.deviceToken;
    const deviceId = socket.handshake.auth.deviceId;

    // 1. Paired TV device authentication
    if (deviceToken && deviceId) {
      try {
        const payload = jwt.verify(deviceToken, env.DEVICE_TOKEN_SECRET) as {
          deviceId?: string;
          dbId?: string;
          hotelId: string;
        };

        const targetId = payload.dbId || payload.deviceId || deviceId;
        const device = await prisma.tvDevice.findFirst({
          where: {
            OR: [
              { id: targetId },
              { deviceId: targetId },
              { id: deviceId },
              { deviceId: deviceId },
            ],
            deletedAt: null,
          },
          select: { id: true, deviceId: true, hotelId: true, roomId: true, status: true },
        });

        if (!device) {
          logger.warn({ targetId }, 'Device not found with provided token, falling back to deviceId lookup');
        } else {
          socket.data.type = 'device';
          socket.data.deviceId = device.id;
          socket.data.hardwareId = device.deviceId;
          socket.data.hotelId = device.hotelId;
          socket.data.roomId = device.roomId;
          return next();
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Invalid device token supplied in socket connection, attempting deviceId fallback');
      }
    }

    // 2. Fallback device authentication by deviceId (hardware fingerprint)
    if (deviceId) {
      try {
        const device = await prisma.tvDevice.findFirst({
          where: {
            OR: [
              { id: deviceId },
              { deviceId: deviceId },
            ],
            deletedAt: null,
          },
          select: { id: true, deviceId: true, hotelId: true, roomId: true, status: true },
        });

        if (device && (device.status === 'PAIRED' || device.hotelId)) {
          socket.data.type = 'device';
          socket.data.deviceId = device.id;
          socket.data.hardwareId = device.deviceId;
          socket.data.hotelId = device.hotelId;
          socket.data.roomId = device.roomId;
          return next();
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Failed fallback device lookup');
      }

      // Unpaired TV connection (allows receiving DEVICE_PAIRED in real-time)
      socket.data.type = 'unpaired_device';
      socket.data.deviceId = deviceId;
      return next();
    }

    // 3. User (dashboard/mobile) authentication
    if (token) {
      try {
        const payload = authService.verifyAccessToken(token);
        socket.data.type = 'user';
        socket.data.userId = payload.userId;
        socket.data.hotelId = payload.hotelId;
        socket.data.role = payload.role;
        socket.data.isSuperAdmin = payload.isSuperAdmin;
        return next();
      } catch {
        return next(new Error('Invalid access token'));
      }
    }

    return next(new Error('Authentication required'));
  });

  io.on('connection', async (socket: Socket) => {
    logger.debug({ socketId: socket.id, type: socket.data.type }, 'Socket connected');

    if (socket.data.type === 'device') {
      await handleDeviceConnect(io, socket);
    } else if (socket.data.type === 'unpaired_device') {
      const { deviceId } = socket.data;
      socket.join(getDeviceRoom(deviceId));
      logger.info({ deviceId }, 'Unpaired TV connected to socket and waiting for pairing event');
    } else {
      await handleUserConnect(io, socket);
    }

    socket.on('disconnect', async () => {
      if (socket.data.type === 'device') {
        await handleDeviceDisconnect(io, socket);
      }
      logger.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });
}

// ─── Device handlers ──────────────────────────────────────
async function handleDeviceConnect(io: Server, socket: Socket) {
  const { deviceId, hardwareId, hotelId } = socket.data;

  // Join rooms for hotel, database UUID, and hardware ID
  if (hotelId) socket.join(getHotelRoom(hotelId));
  if (deviceId) socket.join(getDeviceRoom(deviceId));
  if (hardwareId && hardwareId !== deviceId) socket.join(getDeviceRoom(hardwareId));

  // Mark device online
  await prisma.tvDevice.update({
    where: { id: deviceId },
    data: {
      isOnline: true,
      lastSeenAt: new Date(),
      status: 'ONLINE',
    },
  });

  // Log heartbeat
  await prisma.deviceHeartbeat.create({
    data: {
      deviceId,
      isOnline: true,
      ipAddress: socket.handshake.address,
    },
  });

  // Notify hotel dashboard
  if (hotelId) {
    socket.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.DEVICE_ONLINE, {
      deviceId,
      hardwareId,
      timestamp: new Date().toISOString(),
    });
  }

  // Push immediate fresh TV state and room occupancy to the TV on startup/connection
  try {
    const { devicesService } = await import('../../modules/devices/devices.service');
    const deviceRecord = await prisma.tvDevice.findUnique({
      where: { id: deviceId },
      include: { room: true },
    });
    if (deviceRecord?.hotelId) {
      const payload = await devicesService.getHotelTvPayload(
        deviceRecord.hotelId,
        deviceRecord.roomId || undefined
      );
      socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
        ...payload,
        device: deviceRecord,
      });
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to emit initial TV payload on socket connection');
  }

  // Allow TV to request fresh state on demand
  socket.on('device.request_sync', async (data?: { connectedSsid?: string }) => {
    try {
      const { devicesService } = await import('../../modules/devices/devices.service');
      const dev = await prisma.tvDevice.findUnique({
        where: { id: deviceId },
        include: { room: true },
      });
      if (dev?.hotelId) {
        const payload = await devicesService.getHotelTvPayload(
          dev.hotelId,
          dev.roomId || undefined,
          data?.connectedSsid
        );
        socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
          ...payload,
          device: dev,
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'device.request_sync failed');
    }
  });

  // Handle TV reporting its connected Wi-Fi SSID
  socket.on('device.wifi.reported', async (data: { connectedSsid: string }) => {
    try {
      const { devicesService } = await import('../../modules/devices/devices.service');
      const dev = await prisma.tvDevice.findUnique({
        where: { id: deviceId },
        include: { room: true },
      });
      if (dev?.hotelId && data?.connectedSsid) {
        const payload = await devicesService.getHotelTvPayload(
          dev.hotelId,
          dev.roomId || undefined,
          data.connectedSsid
        );
        socket.emit('wifi.updated', payload.wifi);
        socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
          ...payload,
          device: dev,
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'device.wifi.reported failed');
    }
  });

  // Handle heartbeat
  socket.on(SOCKET_EVENTS.DEVICE_HEARTBEAT, async (data: {
    appVersion?: string;
    screenState?: string;
    ipAddress?: string;
  }) => {
    await prisma.tvDevice.update({
      where: { id: deviceId },
      data: {
        isOnline: true,
        lastSeenAt: new Date(),
        status: 'ONLINE',
        appVersion: data?.appVersion,
        ipAddress: data?.ipAddress || socket.handshake.address,
      },
    });

    await prisma.deviceHeartbeat.create({
      data: {
        deviceId,
        isOnline: true,
        appVersion: data?.appVersion,
        screenState: (data?.screenState as any) || undefined,
        ipAddress: data?.ipAddress || socket.handshake.address,
      },
    });
  });

  // Handle screen state change
  socket.on(SOCKET_EVENTS.SCREEN_STATE_CHANGED, async (data: { screenState: string }) => {
    await prisma.tvDevice.update({
      where: { id: deviceId },
      data: { screenState: data.screenState as any },
    });

    if (hotelId) {
      socket.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.ROOM_STATUS_UPDATED, {
        deviceId,
        screenState: data.screenState,
      });
    }
  });
}

async function handleDeviceDisconnect(io: Server, socket: Socket) {
  const { deviceId, hotelId } = socket.data;
  if (!deviceId) return;

  try {
    await prisma.tvDevice.update({
      where: { id: deviceId },
      data: { isOnline: false, status: 'OFFLINE', lastSeenAt: new Date() },
    });

    await prisma.deviceHeartbeat.create({
      data: { deviceId, isOnline: false },
    });

    if (hotelId) {
      io.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.DEVICE_OFFLINE, {
        deviceId,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    logger.warn({ err: err.message, deviceId }, 'Failed to record device disconnect');
  }
}

// ─── User handlers ────────────────────────────────────────
async function handleUserConnect(io: Server, socket: Socket) {
  const { hotelId, isSuperAdmin } = socket.data;

  // Join hotel room for real-time updates
  if (hotelId) {
    socket.join(getHotelRoom(hotelId));
    logger.debug({ hotelId }, 'User joined hotel room');
  }

  socket.on(SOCKET_EVENTS.JOIN_HOTEL, (data: { hotelId: string }) => {
    if (isSuperAdmin || socket.data.hotelId === data?.hotelId) {
      socket.join(getHotelRoom(data.hotelId));
    }
  });

  socket.on(SOCKET_EVENTS.LEAVE_HOTEL, (data: { hotelId: string }) => {
    if (data?.hotelId) {
      socket.leave(getHotelRoom(data.hotelId));
    }
  });
}

// ─── Emit helpers (for use in services) ──────────────────
let _io: Server | null = null;

export function getIO(): Server {
  if (!_io) throw new Error('Socket.IO not initialized');
  return _io;
}

export function emitToHotel(hotelId: string, event: string, data: unknown) {
  try {
    if (!_io) return;
    _io.to(getHotelRoom(hotelId)).emit(event, data);
  } catch (err) {
    console.warn(`[Socket] emitToHotel failed for hotel ${hotelId}:`, err);
  }
}

export function emitToDevice(deviceId: string, event: string, data: unknown) {
  try {
    if (!_io) return;
    _io.to(getDeviceRoom(deviceId)).emit(event, data);
  } catch (err) {
    console.warn(`[Socket] emitToDevice failed for device ${deviceId}:`, err);
  }
}

export async function emitToDeviceWithAck(
  deviceId: string,
  event: string,
  payload: unknown,
  timeoutMs = 5000
): Promise<{ acknowledged: boolean; ackData?: any; error?: string }> {
  if (!_io) {
    return { acknowledged: false, error: 'TV device is not currently connected via WebSocket' };
  }
  const io = _io;
  const room = getDeviceRoom(deviceId);
  try {
    const sockets = await io.in(room).fetchSockets();
    if (sockets.length === 0) {
      return { acknowledged: false, error: 'TV device is not currently connected via WebSocket' };
    }
    const targetSocket = sockets[0];
    const ackData = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Device did not acknowledge command within ${timeoutMs}ms`));
      }, timeoutMs);

      targetSocket.emit(event, payload, (response: any) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

    return { acknowledged: true, ackData };
  } catch (err: any) {
    return { acknowledged: false, error: err.message || 'Device command timeout' };
  }
}
