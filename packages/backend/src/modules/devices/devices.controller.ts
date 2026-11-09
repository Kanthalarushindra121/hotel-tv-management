import { FastifyRequest, FastifyReply } from 'fastify';
import { devicesService } from './devices.service';
import { getTenantHotelId } from '../../core/middleware/auth.middleware';

export class DevicesController {
  // Initiated by TV device (no user auth needed, device sends its hardware id)
  async initiatePairing(req: FastifyRequest, reply: FastifyReply) {
    const { deviceId, deviceInfo } = req.body as {
      deviceId: string;
      deviceInfo?: {
        model?: string;
        brand?: string;
        osVersion?: string;
        appVersion?: string;
      };
    };

    const res = await devicesService.initiatePairing(deviceId, deviceInfo);
    return reply.status(200).send({ success: true, data: res });
  }

  // Pre-validate pairing code from dashboard (Add Room or Devices page)
  async validatePairingCode(req: FastifyRequest, reply: FastifyReply) {
    const { code } = req.body as { code: string };
    const device = await devicesService.validatePairingCode(code);
    return reply.status(200).send({
      success: true,
      message: 'TV device verified and ready to connect.',
      data: device,
    });
  }

  // Confirmed by Hotel Dashboard (authenticated user)
  async confirmPairing(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { code, roomId } = req.body as { code: string; roomId: string };

    const result = await devicesService.confirmPairing(hotelId, code, roomId, req.user.userId);
    return reply.status(200).send({
      success: true,
      message: 'TV successfully connected.',
      data: result,
    });
  }

  async getHotelDevices(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const devices = await devicesService.getHotelDevices(hotelId);
    return reply.send({ success: true, data: devices });
  }

  async getDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const device = await devicesService.getDevice(hotelId, id);
    return reply.send({ success: true, data: device });
  }

  async refreshDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const res = await devicesService.refreshDevice(hotelId, id);
    return reply.send(res);
  }

  async unpairDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    await devicesService.unpairDevice(hotelId, id, req.user.userId);
    return reply.send({ success: true, message: 'TV unlinked successfully.' });
  }

  async moveDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const { roomId } = req.body as { roomId: string };
    const updated = await devicesService.moveDevice(hotelId, id, roomId, req.user.userId);
    return reply.send({ success: true, data: updated });
  }

  async heartbeat(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    await devicesService.recordHeartbeat(id, {
      appVersion: body.appVersion,
      screenState: body.screenState,
      ipAddress: req.ip,
    });
    return reply.send({ success: true, timestamp: new Date().toISOString() });
  }

  async getTvPayload(req: FastifyRequest, reply: FastifyReply) {
    const { hotelId } = req.params as { hotelId: string };
    const query = req.query as any;
    const roomId = query?.roomId;
    const connectedSsid = query?.connectedSsid || query?.ssid;
    const payload = await devicesService.getHotelTvPayload(hotelId, roomId, connectedSsid);
    return reply.send({ success: true, data: payload });
  }

  async sendCommand(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const { command, payload } = req.body as { command: string; payload?: any };
    const res = await devicesService.sendCommand(hotelId, id, command, payload);
    return reply.send(res);
  }

  async getDiagnostics(req: FastifyRequest, reply: FastifyReply) {
    const diag = await devicesService.getDiagnostics();
    return reply.send({ success: true, data: diag });
  }

  async assignDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const { roomId, replaceExisting } = req.body as { roomId: string; replaceExisting?: boolean };
    const res = await devicesService.assignDeviceToRoom(
      hotelId,
      id,
      roomId,
      req.user?.userId,
      replaceExisting ?? true
    );
    return reply.send({ success: true, data: res });
  }

  async unassignDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const res = await devicesService.unassignDevice(hotelId, id, req.user?.userId);
    return reply.send(res);
  }

  async deleteDevice(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const { id } = req.params as { id: string };
    const res = await devicesService.deleteDevice(hotelId, id, req.user?.userId);
    return reply.send(res);
  }

  async getAvailableDevices(req: FastifyRequest, reply: FastifyReply) {
    const hotelId = getTenantHotelId(req);
    const devices = await devicesService.getAvailableDevices(hotelId);
    return reply.send({ success: true, data: devices });
  }
}

