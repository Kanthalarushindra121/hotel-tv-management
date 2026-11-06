import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { RoomStatus } from '@prisma/client';

export class RoomsService {
  async getRooms(hotelId: string, filters?: { status?: RoomStatus; floor?: number }) {
    const where: any = { hotelId, deletedAt: null };
    if (filters?.status) where.status = filters.status;
    if (filters?.floor !== undefined) where.floor = filters.floor;

    return prisma.room.findMany({
      where,
      include: {
        roomType: true,
        device: {
          select: {
            id: true,
            deviceId: true,
            isOnline: true,
            status: true,
            screenState: true,
            lastSeenAt: true,
            appVersion: true,
          },
        },
        currentBooking: {
          include: {
            guest: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async getRoom(hotelId: string, roomId: string) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: {
        roomType: true,
        device: true,
        currentBooking: {
          include: { guest: true },
        },
        bookings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { guest: true },
        },
      },
    });

    if (!room) throw new NotFoundError('Room', roomId);
    return room;
  }

  async createRoom(
    hotelId: string,
    data: {
      roomNumber?: string;
      number?: string;
      floor?: number;
      roomTypeId?: string;
      maxOccupancy?: number;
      capacity?: number;
      notes?: string;
      pairingCode?: string;
      tvDeviceId?: string;
    },
    userId: string
  ) {
    const rawNumber = data.roomNumber || data.number || '';
    const roomNumber = String(rawNumber).trim();
    if (!roomNumber) {
      throw new AppError('Room number is required', 400);
    }

    const existing = await prisma.room.findFirst({
      where: { hotelId, roomNumber, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError(`Room ${roomNumber} already exists`);
    }

    const floorNum = data.floor !== undefined ? Number(data.floor) : 1;
    const capacityNum = data.maxOccupancy ?? data.capacity ?? 2;

    const room = await prisma.room.create({
      data: {
        hotelId,
        roomNumber,
        floor: floorNum,
        roomTypeId: data.roomTypeId,
        maxOccupancy: capacityNum,
        notes: data.notes,
      },
      include: { roomType: true },
    });

    // If TV pairing code was validated and provided, link TV device immediately
    let pairedDevice: any = null;
    if (data.pairingCode && data.pairingCode.trim()) {
      try {
        const { devicesService } = await import('../devices/devices.service');
        const pairResult = await devicesService.confirmPairing(
          hotelId,
          data.pairingCode.trim(),
          room.id,
          userId
        );
        pairedDevice = pairResult.device;
      } catch (err: any) {
        console.warn(`Could not link TV with pairing code ${data.pairingCode}:`, err.message);
      }
    }

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'ROOM_CREATED',
        resource: 'room',
        resourceId: room.id,
        details: { roomNumber: room.roomNumber, tvPaired: !!pairedDevice },
        success: true,
      },
    });

    return {
      ...room,
      device: pairedDevice || null,
    };
  }

  async createRoomsBulk(hotelId: string, roomNumbers: string[], userId: string, floor?: number) {
    const created: any[] = [];
    for (const num of roomNumbers) {
      const trimmed = num.trim();
      if (!trimmed) continue;
      const existing = await prisma.room.findFirst({
        where: { hotelId, roomNumber: trimmed, deletedAt: null },
      });
      if (!existing) {
        const room = await prisma.room.create({
          data: {
            hotelId,
            roomNumber: trimmed,
            floor,
          },
        });
        created.push(room);
      }
    }

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'ROOM_CREATED',
        resource: 'room',
        details: { bulkCount: created.length },
        success: true,
      },
    });

    return created;
  }

  async updateRoom(
    hotelId: string,
    roomId: string,
    data: { roomNumber?: string; floor?: number; status?: RoomStatus; notes?: string },
    userId: string
  ) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
    });
    if (!room) throw new NotFoundError('Room', roomId);

    const updated = await prisma.room.update({
      where: { id: roomId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        hotelId,
        userId,
        action: 'ROOM_UPDATED',
        resource: 'room',
        resourceId: roomId,
        details: data,
        success: true,
      },
    });

    return updated;
  }

  async deleteRoom(hotelId: string, roomId: string, userId: string) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: {
        currentBooking: true,
        device: true,
      },
    });
    if (!room) throw new NotFoundError('Room', roomId);

    if (room.currentBooking || room.status === 'OCCUPIED') {
      throw new AppError(`Cannot delete Room ${room.roomNumber}: Room currently has an active guest stay. Check out the guest first.`, 400);
    }

    await prisma.$transaction(async (tx) => {
      // Safely unlink TV device if assigned
      if (room.device) {
        await tx.tvDevice.update({
          where: { id: room.device.id },
          data: {
            roomId: null,
            status: 'UNPAIRED',
            screenState: 'UNPAIRED',
          },
        });
      }

      // Soft delete room to preserve historical bookings and audit trails
      await tx.room.update({
        where: { id: roomId },
        data: {
          deletedAt: new Date(),
          status: 'OUT_OF_ORDER',
          wifiZoneId: null,
        },
      });

      await tx.auditLog.create({
        data: {
          hotelId,
          userId,
          action: 'ROOM_DELETED',
          resource: 'room',
          resourceId: roomId,
          details: { roomNumber: room.roomNumber },
          success: true,
        },
      });
    });

    return { success: true, message: `Room ${room.roomNumber} has been safely deleted.` };
  }
}

export const roomsService = new RoomsService();

