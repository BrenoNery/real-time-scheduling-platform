-- Slot integrity (BRE-77): a service duration must be able to tile a window, and
-- two slots of the same service must never overlap. Prisma cannot model CHECK or
-- EXCLUDE, so both live in SQL (same pattern as bookings_slot_id_active_key).

-- btree_gist lets the exclusion constraint mix uuid equality with a range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "services"
ADD CONSTRAINT "services_duration_minutes_positive"
CHECK ("duration_minutes" > 0);

ALTER TABLE "time_slots"
ADD CONSTRAINT "time_slots_ends_after_starts"
CHECK ("ends_at" > "starts_at");

-- Half-open ranges match generateSlots: adjacent slots (09:00–09:30, 09:30–10:00)
-- do not overlap; a 09:15–09:45 slot blocks both 09:00–09:30 and 09:30–10:00.
ALTER TABLE "time_slots"
ADD CONSTRAINT "time_slots_no_overlap"
EXCLUDE USING gist (
  "service_id" WITH =,
  tsrange("starts_at", "ends_at", '[)') WITH &&
);
