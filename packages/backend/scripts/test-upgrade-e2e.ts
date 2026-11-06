import { prisma } from '../src/config/database';

const BASE_URL = 'http://127.0.0.1:4000/api/v1';

async function runE2ETests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   SMARTSTAY TV — FULL E2E UPGRADE VALIDATION SUITE');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  async function apiFetch(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    const json: any = await res.json().catch(() => ({}));
    return {
      status: res.status,
      ok: res.ok,
      data: json.data !== undefined ? json.data : json,
      raw: json,
    };
  }

  try {
    // ─── 1. AUTH & HOTEL REGISTRATION ──────────────────────────
    console.log('--- 1. Testing Hotel-Specific Registration & Authentication ---');
    const hotelEmail = `admin-${Date.now()}@grandpalace.com`;
    const regPayload = {
      hotelName: 'Grand Palace Banjara Hills',
      email: hotelEmail,
      password: 'HotelAdminPassword123!',
      firstName: 'Rohan',
      lastName: 'Mehta',
    };

    const reg = await apiFetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regPayload),
    });
    assert(reg.status === 201 || reg.status === 200, 'Hotel Administrator Registration', reg.data);
    assert(Boolean(reg.data.tokens?.accessToken), 'JWT Access Token generated on Registration');
    assert(reg.data.user?.role === 'OWNER', 'New Hotel Creator receives OWNER role');

    const hotelId = reg.data.hotel?.id;
    const adminToken = reg.data.tokens?.accessToken;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // Test Login with same credentials
    const login = await apiFetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: hotelEmail, password: 'HotelAdminPassword123!' }),
    });
    assert(login.status === 200, 'Hotel Login with email/password');
    assert(login.data.user?.email === hotelEmail.toLowerCase(), 'Login returns matching sanitized user');

    // ─── 2. DASHBOARD STATS (MULTI-TENANT & SCOPED) ───────────
    console.log('\n--- 2. Testing Hotel-Scoped Dashboard Statistics ---');
    const stats = await apiFetch(`${BASE_URL}/dashboard/stats`, {
      headers: authHeaders,
    });
    assert(stats.status === 200, 'Dashboard Statistics fetch HTTP 200');
    assert(typeof stats.data.totalRooms === 'number', 'Stats contains numerical totalRooms');
    assert(typeof stats.data.occupiedRooms === 'number', 'Stats contains numerical occupiedRooms');
    assert(typeof stats.data.connectedTvs === 'number', 'Stats contains numerical connectedTvs');

    // ─── 3. ROOM MANAGEMENT ───────────────────────────────────
    console.log('\n--- 3. Testing Room Management ---');
    const room = await apiFetch(`${BASE_URL}/rooms`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        roomNumber: '301',
        floor: 3,
        maxOccupancy: 2,
        notes: 'Executive Suite',
      }),
    });
    assert(room.status === 201 || room.status === 200, 'Create new room in Hotel (Room 301)');
    const roomId = room.data.id;

    // ─── 4. WI-FI ZONE MANAGEMENT & ENCRYPTED PASSWORDS ────────
    console.log('\n--- 4. Testing Wi-Fi Zones & Dynamic QR Credentials ---');
    const wifiZone = await apiFetch(`${BASE_URL}/wifi`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Floor 3 Executive Zone',
        ssid: 'GrandPalace_Floor3_HighSpeed',
        password: 'PalaceSecretWifi2026!#',
        securityType: 'WPA2',
        floorCoverage: '3',
        description: 'Dedicated high-speed network for 3rd floor suites',
      }),
    });
    assert(wifiZone.status === 201 || wifiZone.status === 200, 'Create Wi-Fi Zone with encrypted credentials');
    const zoneId = wifiZone.data.id;

    // Verify DB stored encrypted password, NOT plaintext
    const dbZone = await prisma.wifiZone.findUnique({ where: { id: zoneId } });
    assert(Boolean(dbZone?.encryptedPassword && dbZone.encryptedPassword !== 'PalaceSecretWifi2026!#'), 'Wi-Fi Password is encrypted at rest using AES-256-GCM');
    assert(Boolean(dbZone?.passwordIv && dbZone?.passwordTag), 'Wi-Fi Record stores cryptographic IV and Auth Tag');

    // Assign Room 301 to Wi-Fi Zone
    const assign = await apiFetch(`${BASE_URL}/wifi/${zoneId}/assign-rooms`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ roomIds: [roomId] }),
    });
    assert(assign.status === 200, 'Assign Room 301 to Floor 3 Wi-Fi Zone');

    // Verify dynamic room Wi-Fi QR payload
    const qr = await apiFetch(`${BASE_URL}/wifi/room/${roomId}/qr`, {
      headers: authHeaders,
    });
    assert(qr.status === 200, 'Fetch dynamic Wi-Fi QR payload for Room 301');
    assert(qr.data.ssid === 'GrandPalace_Floor3_HighSpeed', 'Room QR matches assigned Wi-Fi Zone SSID');
    assert(qr.data.qrString.includes('WIFI:S:GrandPalace_Floor3_HighSpeed;'), 'QR string formatted according to standard WIFI URI scheme');

    // ─── 5. CHECKOUT POLICIES ─────────────────────────────────
    console.log('\n--- 5. Testing Checkout Policies ---');
    const policy = await apiFetch(`${BASE_URL}/policies/room/${roomId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        mode: 'FIXED_TIME',
        fixedTime: '11:00',
        name: 'Suite 11 AM Policy',
      }),
    });
    assert(policy.status === 200, 'Configure specific Checkout Policy for Room 301');
    assert(policy.data.mode === 'FIXED_TIME' && policy.data.fixedTime === '11:00', 'Policy correctly saved');

    // ─── 6. CHECK-IN WORKFLOW & AUTOMATIC REMINDER ────────────
    console.log('\n--- 6. Testing Check-In Workflow & Reminder Scheduling ---');
    const checkinDate = new Date();
    const checkoutDate = new Date(Date.now() + 48 * 3600 * 1000); // 2 days later

    const checkin = await apiFetch(`${BASE_URL}/checkins/check-in`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        roomId,
        guestData: {
          firstName: 'Ananya',
          lastName: 'Sharma',
          phone: '+91 9988776655',
          email: 'ananya.sharma@example.com',
        },
        checkInDate: checkinDate.toISOString(),
        checkOutDate: checkoutDate.toISOString(),
        guestCount: 2,
        specialRequests: 'High floor, feather pillows',
      }),
    });
    assert(checkin.status === 201 || checkin.status === 200, 'Guest Check-In (Ananya Sharma into Room 301)');
    const bookingId = checkin.data.id;

    // Verify Room status changed to OCCUPIED
    const updatedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    assert(updatedRoom?.status === 'OCCUPIED', 'Room status transitioned to OCCUPIED');

    // Verify Checkout Reminder record was generated
    const reminder = await prisma.checkoutReminder.findUnique({ where: { bookingId } });
    assert(Boolean(reminder), 'Checkout Reminder scheduled for guest stay');

    // ─── 7. CHECK-OUT WORKFLOW & REMINDER CANCELLATION ────────
    console.log('\n--- 7. Testing Check-Out Workflow & Instant TV Reset ---');
    const checkout = await apiFetch(`${BASE_URL}/checkins/check-out/${bookingId}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        notes: 'Room in good condition. Guest departed happily.',
      }),
    });
    assert(checkout.status === 200, 'Guest Checkout executed cleanly');

    const cleanedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    assert(cleanedRoom?.status === 'CLEANING', 'Room status updated to CLEANING for housekeeping');
    assert(cleanedRoom?.currentBookingId === null, 'Active booking unlinked from Room');

    const cancelledReminder = await prisma.checkoutReminder.findUnique({ where: { bookingId } });
    assert(cancelledReminder?.isCancelled === true, 'Checkout Reminder cancelled upon guest departure');

    // ─── 8. STAFF MANAGEMENT & ROLE-BASED ACCESS CONTROL ──────
    console.log('\n--- 8. Testing Staff Management & Role-Based Access Control ---');
    const staffEmail = `receptionist-${Date.now()}@grandpalace.com`;
    const staff = await apiFetch(`${BASE_URL}/staff`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        firstName: 'Vikram',
        lastName: 'Rao',
        email: staffEmail,
        password: 'ReceptionPassword123!',
        role: 'RECEPTIONIST',
      }),
    });
    assert(staff.status === 201 || staff.status === 200, 'Hotel Admin creates RECEPTIONIST staff member');

    // Test RECEPTIONIST login
    const staffLogin = await apiFetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffEmail, password: 'ReceptionPassword123!' }),
    });
    assert(staffLogin.status === 200, 'RECEPTIONIST can log into their hotel account');
    const staffToken = staffLogin.data.tokens?.accessToken;
    const staffHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    };

    // Receptionist should NOT be able to create new staff (RBAC check)
    const unauthorizedStaff = await apiFetch(`${BASE_URL}/staff`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        firstName: 'Hacker',
        lastName: 'User',
        email: 'hacker@test.com',
        password: 'AnyPassword123!',
        role: 'ADMIN',
      }),
    });
    assert(unauthorizedStaff.status === 403, 'RBAC enforces RECEPTIONIST cannot create staff (HTTP 403 Forbidden)');

    // ─── 9. STRICT MULTI-TENANT ISOLATION ─────────────────────
    console.log('\n--- 9. Testing Strict Multi-Tenant Isolation ---');
    // Register Hotel B
    const hotelB = await apiFetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotelName: 'Royal Residency Mumbai',
        email: `admin-${Date.now()}@royalresidency.com`,
        password: 'RoyalPassword123!',
        firstName: 'Sameer',
        lastName: 'Khan',
      }),
    });
    const hotelBToken = hotelB.data.tokens?.accessToken;
    const hotelBHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hotelBToken}`,
    };

    // Hotel B attempts to view Hotel A's rooms
    const hotelBRooms = await apiFetch(`${BASE_URL}/rooms`, {
      headers: hotelBHeaders,
    });
    const containsHotelARoom = Array.isArray(hotelBRooms.data) && hotelBRooms.data.some((r: any) => r.id === roomId);
    assert(!containsHotelARoom, "Hotel B cannot access Hotel A's rooms (Tenant Isolation confirmed)");

    // Hotel B attempts to view Hotel A's Wi-Fi zones
    const hotelBWifi = await apiFetch(`${BASE_URL}/wifi`, {
      headers: hotelBHeaders,
    });
    const containsHotelAZone = Array.isArray(hotelBWifi.data) && hotelBWifi.data.some((z: any) => z.id === zoneId);
    assert(!containsHotelAZone, "Hotel B cannot access Hotel A's Wi-Fi zones (Tenant Isolation confirmed)");

    console.log('\n════════════════════════════════════════════════════════════════════════');
    console.log(`   VALIDATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during validation suite execution:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2ETests();
