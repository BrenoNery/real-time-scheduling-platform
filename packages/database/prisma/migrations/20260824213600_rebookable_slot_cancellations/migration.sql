-- Rebookable slot cancellations (BRE-76): a cancelled Booking must not occupy
-- slot_id. Existing data is safe: bookings_slot_id_key already guaranteed at
-- most one row per slot, so the partial unique index cannot conflict.

-- DropIndex
DROP INDEX "bookings_slot_id_key";

-- Partial unique: at most one non-cancelled booking per slot.
-- Prisma cannot express WHERE on @@unique; this index is SQL-only.
CREATE UNIQUE INDEX "bookings_slot_id_active_key" ON "bookings"("slot_id") WHERE "status" <> 'CANCELLED';
