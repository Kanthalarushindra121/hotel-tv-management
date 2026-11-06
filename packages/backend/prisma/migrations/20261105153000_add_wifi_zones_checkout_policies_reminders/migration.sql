-- CreateEnum
CREATE TYPE "CheckoutPolicyMode" AS ENUM ('FIXED_TIME', 'HOURLY', 'CUSTOM');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'WIFI_ZONE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'WIFI_ZONE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKOUT_POLICY_SET';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKOUT_REMINDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'STAY_EXTENDED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CHECKOUT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'CHECKOUT_OVERDUE';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "actualCheckoutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "wifiZoneId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "wifi_zones" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ssid" TEXT NOT NULL,
    "encryptedPassword" TEXT,
    "passwordIv" TEXT,
    "passwordTag" TEXT,
    "securityType" "SecurityType" NOT NULL DEFAULT 'WPA2',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "floorCoverage" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wifi_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_policies" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Default Policy',
    "mode" "CheckoutPolicyMode" NOT NULL DEFAULT 'FIXED_TIME',
    "fixedTime" TEXT,
    "hourlyDuration" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_reminders" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wifi_zones_hotelId_idx" ON "wifi_zones"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_policies_roomId_key" ON "checkout_policies"("roomId");

-- CreateIndex
CREATE INDEX "checkout_policies_hotelId_idx" ON "checkout_policies"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_reminders_bookingId_key" ON "checkout_reminders"("bookingId");

-- CreateIndex
CREATE INDEX "checkout_reminders_hotelId_idx" ON "checkout_reminders"("hotelId");

-- CreateIndex
CREATE INDEX "checkout_reminders_scheduledAt_idx" ON "checkout_reminders"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_wifiZoneId_fkey" FOREIGN KEY ("wifiZoneId") REFERENCES "wifi_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wifi_zones" ADD CONSTRAINT "wifi_zones_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_policies" ADD CONSTRAINT "checkout_policies_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_policies" ADD CONSTRAINT "checkout_policies_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_reminders" ADD CONSTRAINT "checkout_reminders_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_reminders" ADD CONSTRAINT "checkout_reminders_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
