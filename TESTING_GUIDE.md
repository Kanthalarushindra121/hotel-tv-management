# SmartStay TV — Complete Testing & Verification Guide

This guide details how to test the **SmartStay TV** platform end-to-end across all layers: backend APIs, real-time WebSocket communication, device pairing, hotel dashboard, and TV application.

---

## 1. Quick Automated Test (Zero-Dependency)

We built an automated end-to-end verification script that exercises the full product specification lifecycle in seconds:

```bash
cd packages/backend
npx tsx scripts/simulate-tv-journey.ts
```

### What this test verifies automatically:
1. **Hotel Creation & Onboarding**: Registers "Grand Palace Hyderabad" with Wi-Fi QR, amenities, quiet hours, and house rules.
2. **Room Creation**: Configures rooms 101, 102, 103.
3. **TV First-Boot & Pairing Code**: Simulates an unlinked TV generating a 6-character code (`A8K29P`).
4. **Dashboard Pairing Handshake**: Dashboard claims code `A8K29P` for Room 101; TV transitions to `DEFAULT_MODE`.
5. **Guest Check-in**: Receptionist checks in **Rahul Verma** to Room 101.
6. **Real-Time TV Personalization**: TV-001 receives `guest.checked_in` WebSocket event and displays:
   - *"Welcome, Rahul!"*
   - Room 101, 2 nights stay, Wi-Fi QR code, amenities, and house rules.
7. **Privacy Check**: Ensures guest phone number is **never** sent to the TV.
8. **Device Isolation**: Confirms Room 102 TV remains in `DEFAULT_MODE` without receiving Rahul's stay data.
9. **Multi-Tenant Isolation**: Confirms Tenant B receives `403 Forbidden` if attempting to access Tenant A's rooms or guests.
10. **Checkout Day Transition**: TV automatically renders *"Checkout today by 11:00 AM"* with customized departure steps.
11. **Guest Checkout & Reversion**: Receptionist checks out Room 101; TV immediately clears guest data and returns to the default hotel screen.
12. **Burn-in Protection**: Verifies the 5-minute inactivity screensaver mode.

---

## 2. Running the Full Local Stack

### Prerequisites
- Node.js v20+
- Docker Desktop (for PostgreSQL & Redis)

### Step 1: Start Databases
```bash
# In the root repository directory:
docker-compose up -d postgres redis
```

### Step 2: Set Environment Variables
```bash
cp .env.example packages/backend/.env
```

### Step 3: Run Database Migrations & Seed Demo Data
```bash
cd packages/backend
npx prisma db push
npx tsx prisma/seed.ts
```

This seeds **Grand Palace Hyderabad** with:
- **Owner Account**: `owner@grandpalace.com` / `GrandPalace@2024`
- **Receptionist Account**: `receptionist@grandpalace.com` / `GrandPalace@2024`
- **Rooms**: 101, 102, 103, 104, 105, 201, 202, 203
- **TV Devices**: TV-GP-001 (Room 101), TV-GP-002 (Room 102)
- **Active Stay**: Rahul Verma in Room 101

### Step 4: Start the Backend Server
```bash
cd packages/backend
npm run dev
# Server starts on http://localhost:4000
```

---

## 3. Manual API Testing with cURL

### A. Login as Hotel Staff
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "receptionist@grandpalace.com",
    "password": "GrandPalace@2024"
  }'
```
*Save the `accessToken` returned from this response to use in the `Authorization: Bearer <TOKEN>` header below.*

---

### B. TV First-Time Pairing Handshake

**1. TV boots and requests a pairing code:**
```bash
curl -X POST http://localhost:4000/api/v1/devices/pairing/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "TV-LOBBY-001",
    "deviceInfo": {
      "model": "Sony Bravia 4K",
      "osVersion": "Android TV 12",
      "appVersion": "1.0.0"
    }
  }'
```
*Response returns:*
```json
{
  "success": true,
  "data": {
    "code": "B7M9X2",
    "expiresInMinutes": 15
  }
}
```

**2. Staff enters code on Dashboard to link TV to Room 103:**
```bash
curl -X POST http://localhost:4000/api/v1/devices/pairing/confirm \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "B7M9X2",
    "roomId": "<ROOM_103_ID>"
  }'
```

---

### C. Check In a Guest
```bash
curl -X POST http://localhost:4000/api/v1/checkins \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "<ROOM_103_ID>",
    "guestData": {
      "firstName": "Rahul",
      "lastName": "Sharma",
      "email": "rahul@example.com",
      "phone": "+91 99887 76655"
    },
    "checkInDate": "2026-11-05",
    "checkOutDate": "2026-11-07",
    "guestCount": 2,
    "specialRequests": "Extra towels and high floor"
  }'
```
*The TV in Room 103 instantly receives `guest.checked_in` via WebSocket and updates to "Welcome, Rahul!".*

---

### D. Check Out a Guest
```bash
curl -X POST http://localhost:4000/api/v1/checkouts \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "<BOOKING_ID>"
  }'
```
*The TV in Room 103 instantly clears guest data and returns to the hotel default welcome screen.*

---

## 4. Real-Time WebSocket Testing

Connect any Socket.IO client (or Postman WebSocket / browser console) to `ws://localhost:4000`:

```javascript
import { io } from "socket.io-client";

// Connect as Dashboard User
const socket = io("http://localhost:4000", {
  auth: { token: "<USER_ACCESS_TOKEN>" }
});

socket.on("guest.checked_in", (data) => {
  console.log("Guest Checked In Event:", data);
});

socket.on("guest.checked_out", (data) => {
  console.log("Guest Checked Out Event:", data);
});

socket.on("device.online", (data) => {
  console.log("TV Device Online:", data);
});
```

---

## 5. Android TV Testing (Emulator or Hardware)

1. Open `packages/tv-android` in **Android Studio**.
2. Create an Android Virtual Device (AVD):
   - Category: **TV**
   - Device: **Android TV (1080p)**
   - System Image: **Android 12 (API 31+) with Google TV**
3. Run the application (`Shift + F10`).
4. On launch:
   - TV will display the 6-character code screen.
   - Use the Dashboard or the API to pair the code.
   - Test navigation using the arrow keys (D-pad emulator).

