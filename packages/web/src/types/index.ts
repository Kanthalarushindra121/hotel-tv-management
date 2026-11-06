// src/types/index.ts

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'hotel_admin' | 'staff' | 'viewer';
  hotelId?: string;
  avatar?: string;
  createdAt: string;
}

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  logo?: string;
  coverImage?: string;
  primaryColor?: string;
  accentColor?: string;
  tagline?: string;
  welcomeMessage?: string;
  defaultMessage?: string;
  checkInTime?: string;
  checkOutTime?: string;
  timezone?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  wifiName?: string;
  wifiPassword?: string;
  wifiSecurity?: 'WPA2' | 'WPA3' | 'WEP' | 'None';
  amenities?: Amenity[];
  houseRules?: HouseRule[];
  checkoutSteps?: CheckoutStep[];
  subscriptionPlan?: 'starter' | 'growth' | 'enterprise';
  subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled';
  maxRooms?: number;
  maxDevices?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Amenity {
  id: string;
  name: string;
  icon?: string;
  order: number;
}

export interface HouseRule {
  id: string;
  text: string;
  order: number;
}

export interface CheckoutStep {
  id: string;
  text: string;
  order: number;
}

export interface Room {
  id: string;
  hotelId: string;
  number: string;
  floor: number;
  type: 'single' | 'double' | 'suite' | 'deluxe' | 'family' | 'presidential';
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked';
  capacity: number;
  notes?: string;
  currentBookingId?: string;
  currentGuest?: Guest;
  device?: Device;
  createdAt: string;
  updatedAt: string;
}

export interface Guest {
  id: string;
  hotelId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationality?: string;
  idType?: 'passport' | 'aadhaar' | 'driving_license' | 'other';
  idNumber?: string;
  avatar?: string;
  currentBookingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  hotelId: string;
  guestId: string;
  guest?: Guest;
  roomId: string;
  room?: Room;
  checkIn: string;
  checkOut: string;
  actualCheckIn?: string;
  actualCheckOut?: string;
  nights: number;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  adults: number;
  children: number;
  specialRequests?: string;
  pmsReference?: string;
  source?: 'direct' | 'ota' | 'pms' | 'walk_in';
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  hotelId: string;
  roomId?: string;
  room?: Room;
  name: string;
  serialNumber?: string;
  pairingCode?: string;
  status: 'online' | 'offline' | 'paired' | 'unpaired';
  appVersion?: string;
  firmwareVersion?: string;
  platform?: string;
  lastSeen?: string;
  ipAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  hotelId: string;
  title: string;
  body: string;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  type: 'check_in' | 'check_out' | 'room_status_change' | 'device_online' | 'device_offline' | 'booking_created';
  guestName?: string;
  roomNumber?: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  checkInsToday: number;
  checkOutsToday: number;
  onlineTvs: number;
  offlineTvs: number;
  upcomingArrivals: number;
  occupancyRate: number;
  revenueToday?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}

export type SortOrder = 'asc' | 'desc';

export interface TableSort {
  field: string;
  order: SortOrder;
}

export interface FilterParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: SortOrder;
  [key: string]: string | number | boolean | undefined;
}
