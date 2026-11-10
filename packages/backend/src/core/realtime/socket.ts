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

        // Only authenticate as paired device if status is PAIRED and assigned to a room
        if (device && device.status === 'PAIRED' && device.roomId) {
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
      socket.data.hardwareId = deviceId;
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
  const { deviceId, hardwareId } = socket.data;

  // Resolve true database record by UUID or hardware fingerprint
  const dev = await prisma.tvDevice.findFirst({
    where: {
      OR: [
        ...(deviceId ? [{ id: deviceId }, { deviceId }] : []),
        ...(hardwareId ? [{ id: hardwareId }, { deviceId: hardwareId }] : []),
      ],
      deletedAt: null,
    },
    include: { room: true },
  });

  const effectiveHotelId = dev?.hotelId || socket.data.hotelId;
  const effectiveDbId = dev?.id || deviceId;
  const effectiveHardwareId = dev?.deviceId || hardwareId;

  // Update socket.data with true identifiers
  socket.data.deviceId = effectiveDbId;
  socket.data.hardwareId = effectiveHardwareId;
  socket.data.hotelId = effectiveHotelId;
  socket.data.roomId = dev?.roomId;

  // Join rooms for hotel, database UUID, and hardware ID
  if (effectiveHotelId) socket.join(getHotelRoom(effectiveHotelId));
  if (effectiveDbId) socket.join(getDeviceRoom(effectiveDbId));
  if (effectiveHardwareId && effectiveHardwareId !== effectiveDbId) socket.join(getDeviceRoom(effectiveHardwareId));

  // Mark device online if record exists
  if (dev) {
    try {
      await prisma.tvDevice.update({
        where: { id: dev.id },
        data: {
          isOnline: true,
          lastSeenAt: new Date(),
          status: 'ONLINE',
        },
      });

      await prisma.deviceHeartbeat.create({
        data: {
          deviceId: dev.id,
          isOnline: true,
          ipAddress: socket.handshake.address,
        },
      });
    } catch (e: any) {
      logger.warn({ err: e.message }, 'Failed to record device connect state in DB');
    }

    // Notify hotel dashboard in real time
    if (effectiveHotelId) {
      io.to(getHotelRoom(effectiveHotelId)).emit(SOCKET_EVENTS.DEVICE_ONLINE, {
        deviceId: dev.id,
        hardwareId: dev.deviceId,
        roomId: dev.roomId,
        roomNumber: dev.room?.roomNumber,
        isOnline: true,
        status: 'ONLINE',
        timestamp: new Date().toISOString(),
      });
      io.to(getHotelRoom(effectiveHotelId)).emit('device.status.updated', {
        deviceId: dev.id,
        hardwareId: dev.deviceId,
        roomId: dev.roomId,
        roomNumber: dev.room?.roomNumber,
        isOnline: true,
        status: 'ONLINE',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Push immediate fresh TV state and room occupancy to the TV on startup/connection ONLY if paired to a room
  if (dev && dev.status === 'PAIRED' && dev.roomId && effectiveHotelId) {
    try {
      const { devicesService } = await import('../../modules/devices/devices.service');
      const payload = await devicesService.getHotelTvPayload(
        effectiveHotelId,
        dev.roomId
      );
      socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
        ...payload,
        device: dev,
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to emit initial TV payload on socket connection');
    }
  }

  // Allow TV to request fresh state on demand (only if paired to a room)
  socket.on('device.request_sync', async (data?: { connectedSsid?: string }) => {
    try {
      const { devicesService } = await import('../../modules/devices/devices.service');
      const activeDev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            ...(socket.data.deviceId ? [{ id: socket.data.deviceId }, { deviceId: socket.data.deviceId }] : []),
            ...(socket.data.hardwareId ? [{ id: socket.data.hardwareId }, { deviceId: socket.data.hardwareId }] : []),
          ],
          deletedAt: null,
        },
        include: { room: true },
      });
      if (activeDev && activeDev.status === 'PAIRED' && activeDev.roomId && activeDev.hotelId) {
        const payload = await devicesService.getHotelTvPayload(
          activeDev.hotelId,
          activeDev.roomId,
          data?.connectedSsid
        );
        socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
          ...payload,
          device: activeDev,
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
      const activeDev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            ...(socket.data.deviceId ? [{ id: socket.data.deviceId }, { deviceId: socket.data.deviceId }] : []),
            ...(socket.data.hardwareId ? [{ id: socket.data.hardwareId }, { deviceId: socket.data.hardwareId }] : []),
          ],
          deletedAt: null,
        },
        include: { room: true },
      });
      if (activeDev?.hotelId && data?.connectedSsid) {
        const payload = await devicesService.getHotelTvPayload(
          activeDev.hotelId,
          activeDev.roomId || undefined,
          data.connectedSsid
        );
        socket.emit('wifi.updated', payload.wifi);
        socket.emit(SOCKET_EVENTS.CONTENT_UPDATED, {
          ...payload,
          device: activeDev,
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'device.wifi.reported failed');
    }
  });

function mapScreenState(raw?: string): any {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (['UNPAIRED', 'PAIRING', 'SYNCING', 'DEFAULT_MODE', 'GUEST_ACTIVE', 'CHECKOUT_DAY', 'SCREENSAVER', 'OFFLINE', 'ERROR'].includes(upper)) {
    return upper;
  }
  if (upper === 'STATE_HOTEL' || upper === 'HOTEL') return 'DEFAULT_MODE';
  if (upper === 'STATE_GUEST' || upper === 'GUEST') return 'GUEST_ACTIVE';
  if (upper === 'STATE_CHECKOUT' || upper === 'CHECKOUT') return 'CHECKOUT_DAY';
  return 'DEFAULT_MODE';
}

  // Handle heartbeat
  socket.on(SOCKET_EVENTS.DEVICE_HEARTBEAT, async (data: {
    appVersion?: string;
    screenState?: string;
    ipAddress?: string;
  }) => {
    try {
      const activeDev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            ...(socket.data.deviceId ? [{ id: socket.data.deviceId }, { deviceId: socket.data.deviceId }] : []),
            ...(socket.data.hardwareId ? [{ id: socket.data.hardwareId }, { deviceId: socket.data.hardwareId }] : []),
          ],
          deletedAt: null,
        },
        include: { room: true },
      });

      if (!activeDev) return;

      const validScreenState = mapScreenState(data?.screenState);
      await prisma.tvDevice.update({
        where: { id: activeDev.id },
        data: {
          isOnline: true,
          lastSeenAt: new Date(),
          status: 'ONLINE',
          ...(validScreenState ? { screenState: validScreenState } : {}),
          appVersion: data?.appVersion,
          ipAddress: data?.ipAddress || socket.handshake.address,
        },
      });

      await prisma.deviceHeartbeat.create({
        data: {
          deviceId: activeDev.id,
          isOnline: true,
          appVersion: data?.appVersion,
          screenState: validScreenState,
          ipAddress: data?.ipAddress || socket.handshake.address,
        },
      });

      // Broadcast live status to hotel dashboard
      if (activeDev.hotelId) {
        io.to(getHotelRoom(activeDev.hotelId)).emit('device.heartbeat', {
          deviceId: activeDev.id,
          hardwareId: activeDev.deviceId,
          roomId: activeDev.roomId,
          roomNumber: activeDev.room?.roomNumber,
          isOnline: true,
          status: 'ONLINE',
          lastSeenAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to record device heartbeat');
    }
  });

  // Handle screen state change
  socket.on(SOCKET_EVENTS.SCREEN_STATE_CHANGED, async (data: { screenState: string }) => {
    try {
      const activeDev = await prisma.tvDevice.findFirst({
        where: {
          OR: [
            ...(socket.data.deviceId ? [{ id: socket.data.deviceId }, { deviceId: socket.data.deviceId }] : []),
            ...(socket.data.hardwareId ? [{ id: socket.data.hardwareId }, { deviceId: socket.data.hardwareId }] : []),
          ],
          deletedAt: null,
        },
      });

      if (!activeDev) return;

      const validScreenState = mapScreenState(data?.screenState) || 'DEFAULT_MODE';
      await prisma.tvDevice.update({
        where: { id: activeDev.id },
        data: { screenState: validScreenState },
      });

      if (activeDev.hotelId) {
        socket.to(getHotelRoom(activeDev.hotelId)).emit(SOCKET_EVENTS.ROOM_STATUS_UPDATED, {
          deviceId: activeDev.id,
          screenState: validScreenState,
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to update screen state');
    }
  });
}

async function handleDeviceDisconnect(io: Server, socket: Socket) {
  const { deviceId, hardwareId, hotelId } = socket.data;
  if (!deviceId && !hardwareId) return;

  try {
    const activeDev = await prisma.tvDevice.findFirst({
      where: {
        OR: [
          ...(deviceId ? [{ id: deviceId }, { deviceId }] : []),
          ...(hardwareId ? [{ id: hardwareId }, { deviceId: hardwareId }] : []),
        ],
        deletedAt: null,
      },
      include: { room: true },
    });

    if (activeDev) {
      await prisma.tvDevice.update({
        where: { id: activeDev.id },
        data: { isOnline: false, status: 'OFFLINE', lastSeenAt: new Date() },
      });

      await prisma.deviceHeartbeat.create({
        data: { deviceId: activeDev.id, isOnline: false },
      });

      const effectiveHotelId = activeDev.hotelId || hotelId;
      if (effectiveHotelId) {
        io.to(getHotelRoom(effectiveHotelId)).emit(SOCKET_EVENTS.DEVICE_OFFLINE, {
          deviceId: activeDev.id,
          hardwareId: activeDev.deviceId,
          roomId: activeDev.roomId,
          roomNumber: activeDev.room?.roomNumber,
          isOnline: false,
          status: 'OFFLINE',
          timestamp: new Date().toISOString(),
        });
        io.to(getHotelRoom(effectiveHotelId)).emit('device.status.updated', {
          deviceId: activeDev.id,
          hardwareId: activeDev.deviceId,
          roomId: activeDev.roomId,
          roomNumber: activeDev.room?.roomNumber,
          isOnline: false,
          status: 'OFFLINE',
          timestamp: new Date().toISOString(),
        });
      }
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
