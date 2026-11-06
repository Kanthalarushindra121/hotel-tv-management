import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SmartStay TV Database for Grand Palace Hyderabad...');

  // Clean existing demo data if any
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.checkout.deleteMany({});
  await prisma.checkin.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.guest.deleteMany({});
  await prisma.tvDevice.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.hotelAmenity.deleteMany({});
  await prisma.amenity.deleteMany({});
  await prisma.houseRule.deleteMany({});
  await prisma.checkoutStep.deleteMany({});
  await prisma.wifiSettings.deleteMany({});
  await prisma.hotelSettings.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.hotel.deleteMany({});

  // 1. Create Hotel
  const hotel = await prisma.hotel.create({
    data: {
      name: 'Grand Palace Hyderabad',
      slug: 'grand-palace-hyderabad',
      description: 'Luxury heritage hospitality with modern smart-room comfort.',
      address: 'Banjara Hills, Road No. 1',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      postalCode: '500034',
      phone: '+91 40 2335 0101',
      email: 'concierge@grandpalace.com',
      website: 'https://grandpalacehyderabad.demo',
      primaryColor: '#0F172A',
      accentColor: '#6366F1',
      isOnboarded: true,
      onboardingStep: 10,
    },
  });

  // 2. Hotel Settings & Wi-Fi
  await prisma.hotelSettings.create({
    data: {
      hotelId: hotel.id,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      timezone: 'Asia/Kolkata',
      screensaverDelay: 300,
      guestDataExpiry: 24,
      welcomeMessage: 'Welcome',
      defaultWelcomeMsg: 'Welcome to Grand Palace Hyderabad',
      checkoutMessage: 'Thank you for staying with us',
    },
  });

  await prisma.wifiSettings.create({
    data: {
      hotelId: hotel.id,
      networkName: 'GrandPalace_Guest',
      password: 'palacestayguest',
      securityType: 'WPA2',
    },
  });

  // 3. Subscription
  await prisma.subscription.create({
    data: {
      hotelId: hotel.id,
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      maxRooms: 50,
      maxDevices: 50,
      maxUsers: 10,
    },
  });

  // 4. Users (Owner & Receptionist)
  const passwordHash = await bcrypt.hash('GrandPalace@2024', 10);

  const owner = await prisma.user.create({
    data: {
      email: 'owner@grandpalace.com',
      passwordHash,
      firstName: 'Amit',
      lastName: 'Sharma',
      role: 'OWNER',
      hotelId: hotel.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'receptionist@grandpalace.com',
      passwordHash,
      firstName: 'Priya',
      lastName: 'Patel',
      role: 'RECEPTIONIST',
      hotelId: hotel.id,
    },
  });

  // 5. Rooms (101 - 105, 201 - 203)
  const roomNumbers = ['101', '102', '103', '104', '105', '201', '202', '203'];
  const roomsMap = new Map<string, string>();

  for (const num of roomNumbers) {
    const floor = parseInt(num[0], 10);
    const room = await prisma.room.create({
      data: {
        hotelId: hotel.id,
        roomNumber: num,
        floor,
        maxOccupancy: 2,
        status: 'AVAILABLE',
      },
    });
    roomsMap.set(num, room.id);
  }

  // 6. Amenities
  const amenitiesList = [
    { name: 'High-speed Wi-Fi', icon: 'wifi' },
    { name: 'Royal Dining Restaurant', icon: 'utensils' },
    { name: 'Infinity Swimming Pool', icon: 'waves' },
    { name: 'Fitness Center', icon: 'dumbbell' },
    { name: 'Valet Parking', icon: 'car' },
    { name: 'Ayurvedic Spa', icon: 'sparkles' },
    { name: 'Complimentary Breakfast', icon: 'coffee' },
    { name: '24/7 Room Service', icon: 'bell' },
  ];

  for (let i = 0; i < amenitiesList.length; i++) {
    const a = await prisma.amenity.create({ data: amenitiesList[i] });
    await prisma.hotelAmenity.create({
      data: {
        hotelId: hotel.id,
        amenityId: a.id,
        sortOrder: i + 1,
        isActive: true,
      },
    });
  }

  // 7. House Rules
  const rules = [
    'Quiet hours are observed from 10:00 PM to 7:00 AM.',
    'Smoking is strictly prohibited inside the room.',
    'Visitors are permitted in the lobby until 9:00 PM.',
    'Please present room key at breakfast restaurant.',
  ];
  for (let i = 0; i < rules.length; i++) {
    await prisma.houseRule.create({
      data: { hotelId: hotel.id, rule: rules[i], sortOrder: i + 1 },
    });
  }

  // 8. Checkout steps
  const steps = [
    'Check room and safe for personal belongings.',
    'Switch off air conditioning and lights.',
    'Leave room key card with front desk receptionist.',
    'Clear incidental charges at reception.',
  ];
  for (let i = 0; i < steps.length; i++) {
    await prisma.checkoutStep.create({
      data: { hotelId: hotel.id, instruction: steps[i], sortOrder: i + 1 },
    });
  }

  // 9. TV Devices (Paired to Room 101 and 102)
  const room101Id = roomsMap.get('101')!;
  const tv101 = await prisma.tvDevice.create({
    data: {
      hotelId: hotel.id,
      roomId: room101Id,
      deviceId: 'TV-GP-001',
      name: 'Room 101 TV',
      status: 'ONLINE',
      screenState: 'GUEST_ACTIVE',
      isOnline: true,
      lastSeenAt: new Date(),
      appVersion: '1.0.0',
      osVersion: 'Android TV 12',
      deviceModel: 'Sony Bravia 4K',
    },
  });

  const room102Id = roomsMap.get('102')!;
  await prisma.tvDevice.create({
    data: {
      hotelId: hotel.id,
      roomId: room102Id,
      deviceId: 'TV-GP-002',
      name: 'Room 102 TV',
      status: 'ONLINE',
      screenState: 'DEFAULT_MODE',
      isOnline: true,
      lastSeenAt: new Date(),
      appVersion: '1.0.0',
      osVersion: 'Android TV 12',
      deviceModel: 'Samsung QLED TV',
    },
  });

  // 10. Sample Guest: Rahul Verma checked in to Room 101
  const guestRahul = await prisma.guest.create({
    data: {
      hotelId: hotel.id,
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul.verma@example.com',
      phone: '+91 98765 43210',
    },
  });

  const checkInDate = new Date();
  const checkOutDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 nights

  const booking101 = await prisma.booking.create({
    data: {
      hotelId: hotel.id,
      roomId: room101Id,
      guestId: guestRahul.id,
      checkInDate,
      checkOutDate,
      nights: 2,
      guestCount: 1,
      status: 'CHECKED_IN',
      createdById: owner.id,
    },
  });

  await prisma.checkin.create({
    data: {
      bookingId: booking101.id,
      hotelId: hotel.id,
      checkedInBy: owner.id,
    },
  });

  await prisma.room.update({
    where: { id: room101Id },
    data: { status: 'OCCUPIED', currentBookingId: booking101.id },
  });

  console.log('✅ Grand Palace Hyderabad demo data successfully seeded!');
  console.log('Credentials:');
  console.log('  Owner: owner@grandpalace.com / GrandPalace@2024');
  console.log('  Receptionist: receptionist@grandpalace.com / GrandPalace@2024');
  console.log('  TV-001 (Room 101): Connected & shows Welcome Rahul');
  console.log('  TV-002 (Room 102): Connected & in Default Welcome Screen');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

