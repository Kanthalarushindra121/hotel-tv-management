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
  
  // Client → Server (TV devices)
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_REGISTER: 'device.register',
  SCREEN_STATE_CHANGED: 'device.screen_state_changed',
  
  // Client → Server (dashboard)
  JOIN_HOTEL: 'hotel.join',
  LEAVE_HOTEL: 'hotel.leave',
} as const;

// ─── Room naming ──────────────────────────────────────────
// Using "socket rooms" (not hotel rooms!) for channel isolation
export const getHotelRoom = (hotelId: string) => `hotel:${hotelId}`;
export const getDeviceRoom = (deviceId: string) => `device:${deviceId}`;

export function setupSocketIO(io: Server) {
  _io = io;
  // ─── Authentication middleware ────────────────────────────
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.slice(7);
    const deviceToken = socket.handshake.auth.deviceToken;
    const deviceId = socket.handshake.auth.deviceId;

    if (deviceToken && deviceId) {
      // TV device authentication
      try {
        const payload = jwt.verify(deviceToken, env.DEVICE_TOKEN_SECRET) as {
          deviceId: string;
          hotelId: string;
        };
        
        if (payload.deviceId !== deviceId) {
          return next(new Error('Device authentication failed'));
        }

        const device = await prisma.tvDevice.findUnique({
          where: { id: payload.deviceId },
          select: { id: true, hotelId: true, roomId: true, status: true },
        });

        if (!device) {
          return next(new Error('Device not found'));
        }

        socket.data.type = 'device';
        socket.data.deviceId = device.id;
        socket.data.hotelId = device.hotelId;
        socket.data.roomId = device.roomId;
        
        return next();
      } catch {
        return next(new Error('Invalid device token'));
      }
    }

    if (token) {
      // User (dashboard/mobile) authentication
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
  const { deviceId, hotelId } = socket.data;

  // Join hotel room and device-specific room
  socket.join(getHotelRoom(hotelId));
  socket.join(getDeviceRoom(deviceId));

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
  socket.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.DEVICE_ONLINE, {
    deviceId,
    timestamp: new Date().toISOString(),
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
        appVersion: data.appVersion,
        ipAddress: data.ipAddress,
      },
    });

    await prisma.deviceHeartbeat.create({
      data: {
        deviceId,
        isOnline: true,
        appVersion: data.appVersion,
        screenState: (data.screenState as any) || undefined,
        ipAddress: data.ipAddress,
      },
    });
  });

  // Handle screen state change
  socket.on(SOCKET_EVENTS.SCREEN_STATE_CHANGED, async (data: { screenState: string }) => {
    await prisma.tvDevice.update({
      where: { id: deviceId },
      data: { screenState: data.screenState as any },
    });

    socket.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.ROOM_STATUS_UPDATED, {
      deviceId,
      screenState: data.screenState,
    });
  });
}

async function handleDeviceDisconnect(io: Server, socket: Socket) {
  const { deviceId, hotelId } = socket.data;

  await prisma.tvDevice.update({
    where: { id: deviceId },
    data: { isOnline: false, status: 'OFFLINE' },
  });

  await prisma.deviceHeartbeat.create({
    data: { deviceId, isOnline: false },
  });

  io.to(getHotelRoom(hotelId)).emit(SOCKET_EVENTS.DEVICE_OFFLINE, {
    deviceId,
    timestamp: new Date().toISOString(),
  });
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
    if (isSuperAdmin || socket.data.hotelId === data.hotelId) {
      socket.join(getHotelRoom(data.hotelId));
    }
  });

  socket.on(SOCKET_EVENTS.LEAVE_HOTEL, (data: { hotelId: string }) => {
    socket.leave(getHotelRoom(data.hotelId));
  });
}

// ─── Emit helpers (for use in services) ──────────────────
let _io: Server | null = null;

export function getIO(): Server {
  if (!_io) throw new Error('Socket.IO not initialized');
  return _io;
}

export function emitToHotel(hotelId: string, event: string, data: unknown) {
  const io = getIO();
  io.to(getHotelRoom(hotelId)).emit(event, data);
}

export function emitToDevice(deviceId: string, event: string, data: unknown) {
  const io = getIO();
  io.to(getDeviceRoom(deviceId)).emit(event, data);
}

