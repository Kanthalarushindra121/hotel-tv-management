import { prisma } from '../../config/database';
import { AppError, NotFoundError, ConflictError } from '../../core/errors';
import { RoomStatus } from '@prisma/client';
import { dashboardService } from '../dashboard/dashboard.service';

export class RoomsService {
  async getRooms(hotelId: string, filters?: { status?: RoomStatus; floor?: number }) {
    const where: any = { hotelId, deletedAt: null };
    if (filters?.status) where.status = filters.status;
    if (filters?.floor !== undefined) where.floor = filters.floor;

    const rooms = await prisma.room.findMany({
      where,
      include: {
        roomType: true,
        wifiZone: true,
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

    return rooms.map((r: any) => ({
      ...r,
      number: r.roomNumber,
      roomNumber: r.roomNumber,
      type: r.roomType?.name || 'Standard Room',
      capacity: r.maxOccupancy || 2,
    }));
  }

  async getRoom(hotelId: string, roomId: string) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: {
        roomType: true,
        device: true,
        wifiZone: true,
        currentBooking: {
          include: { guest: true },
        },
        bookings: {
          take: 25,
          orderBy: { createdAt: 'desc' },
          include: { guest: true },
        },
      },
    });

    if (!room) throw new NotFoundError('Room', roomId);

    const history = (room.bookings || []).map((b: any) => ({
      id: b.id,
      guestName: b.guest ? `${b.guest.firstName || ''} ${b.guest.lastName || ''}`.trim() : 'Guest',
      guestPhone: b.guest?.phone || '—',
      guestEmail: b.guest?.email || '—',
      checkIn: new Date(b.checkInDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      checkOut: new Date(b.checkOutDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      nights: b.nights || 1,
      status: b.status,
    }));

    return {
      ...room,
      number: room.roomNumber,
      roomNumber: room.roomNumber,
      type: room.roomType?.name || 'Standard Room',
      capacity: room.maxOccupancy || 2,
      history,
    };
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

    const floorNum = data.floor !== undefined ? Number(data.floor) : 1;
    const capacityNum = data.maxOccupancy ?? data.capacity ?? 2;

    // Check if room already exists (including soft-deleted rooms that share the unique constraint)
    const existingRaw = await prisma.$queryRaw<Array<{ id: string; deletedAt: Date | null }>>`
      SELECT id, "deletedAt" FROM "rooms" 
      WHERE "hotelId" = ${hotelId} AND "roomNumber" = ${roomNumber}
      LIMIT 1
    `;

    let room: any;
    if (existingRaw.length > 0) {
      if (existingRaw[0].deletedAt === null) {
        throw new ConflictError(`Room ${roomNumber} already exists`);
      }
      // Room was previously deleted: reactivate and update its configuration
      room = await prisma.room.update({
        where: { id: existingRaw[0].id },
        data: {
          deletedAt: null,
          status: 'AVAILABLE',
          floor: floorNum,
          roomTypeId: data.roomTypeId || null,
          maxOccupancy: capacityNum,
          notes: data.notes || '',
          wifiZoneId: null,
          currentBookingId: null,
        },
        include: { roomType: true },
      });
    } else {
      room = await prisma.room.create({
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
    }

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

    try {
      await prisma.auditLog.create({
        data: {
          hotelId,
          userId: userId || null,
          action: 'ROOM_CREATED',
          resource: 'room',
          resourceId: room.id,
          details: { roomNumber: room.roomNumber, tvPaired: !!pairedDevice },
          success: true,
        },
      });
    } catch (e) {
      console.warn('AuditLog warning during createRoom:', e);
    }

    dashboardService.invalidateDashboardCache(hotelId);

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
      const existingRaw = await prisma.$queryRaw<Array<{ id: string; deletedAt: Date | null }>>`
        SELECT id, "deletedAt" FROM "rooms" 
        WHERE "hotelId" = ${hotelId} AND "roomNumber" = ${trimmed}
        LIMIT 1
      `;
      if (existingRaw.length > 0) {
        if (existingRaw[0].deletedAt !== null) {
          // Reactivate soft-deleted room
          const room = await prisma.room.update({
            where: { id: existingRaw[0].id },
            data: {
              deletedAt: null,
              status: 'AVAILABLE',
              floor,
            },
          });
          created.push(room);
        }
      } else {
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

    try {
      await prisma.auditLog.create({
        data: {
          hotelId,
          userId: userId || null,
          action: 'ROOM_CREATED',
          resource: 'room',
          details: { bulkCount: created.length },
          success: true,
        },
      });
    } catch (e) {
      console.warn('AuditLog warning during createRoomsBulk:', e);
    }

    dashboardService.invalidateDashboardCache(hotelId);
    return created;
  }

  async updateRoom(
    hotelId: string,
    roomId: string,
    data: {
      roomNumber?: string;
      number?: string;
      floor?: number;
      status?: RoomStatus;
      roomTypeId?: string;
      maxOccupancy?: number;
      capacity?: number;
      notes?: string;
      wifiZoneId?: string | null;
      assignedTvId?: string | null;
    },
    userId: string
  ) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: { device: true },
    });
    if (!room) throw new NotFoundError('Room', roomId);

    const { assignedTvId, number, capacity, ...rest } = data;
    const roomUpdateData: any = { ...rest };
    if (number && !roomUpdateData.roomNumber) {
      roomUpdateData.roomNumber = number;
    }
    if (capacity !== undefined && roomUpdateData.maxOccupancy === undefined) {
      roomUpdateData.maxOccupancy = Number(capacity);
    }
    if (roomUpdateData.floor !== undefined) {
      roomUpdateData.floor = Number(roomUpdateData.floor);
    }

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: roomUpdateData,
      include: {
        roomType: true,
        device: true,
        wifiZone: true,
      },
    });

    // Handle TV assignment changes atomically
    if (assignedTvId !== undefined) {
      const { devicesService } = await import('../devices/devices.service');
      if (assignedTvId === null || assignedTvId === '' || assignedTvId === 'UNASSIGN') {
        if (room.device) {
          await devicesService.unassignDevice(hotelId, room.device.id, userId);
        }
      } else if (assignedTvId && (!room.device || room.device.id !== assignedTvId)) {
        await devicesService.assignDeviceToRoom(hotelId, assignedTvId, roomId, userId, true);
      }
    }

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

    dashboardService.invalidateDashboardCache(hotelId);

    return prisma.room.findUnique({
      where: { id: roomId },
      include: {
        roomType: true,
        device: true,
        wifiZone: true,
        currentBooking: { include: { guest: true } },
      },
    });
  }

  async assignTv(hotelId: string, roomId: string, tvDeviceId: string, userId: string) {
    const { devicesService } = await import('../devices/devices.service');
    return devicesService.assignDeviceToRoom(hotelId, tvDeviceId, roomId, userId, true);
  }

  async unassignTv(hotelId: string, roomId: string, userId: string) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
      include: { device: true },
    });
    if (!room) throw new NotFoundError('Room', roomId);
    if (!room.device) {
      return { success: true, message: 'No TV device assigned to this room' };
    }
    const { devicesService } = await import('../devices/devices.service');
    return devicesService.unassignDevice(hotelId, room.device.id, userId);
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

    dashboardService.invalidateDashboardCache(hotelId);

    return { success: true, message: `Room ${room.roomNumber} has been safely deleted.` };
  }
}

export const roomsService = new RoomsService();

