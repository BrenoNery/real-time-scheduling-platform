import { clockTimeToMinutes, parseCalendarDate } from "@repo/shared";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type CandidateSlot = { startsAt: Date; endsAt: Date };

/** Inclusive list of UTC calendar dates (`YYYY-MM-DD`) between two dates. */
export function utcDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = parseCalendarDate(endDate).getTime();

  for (let cursor = parseCalendarDate(startDate).getTime(); cursor <= end; cursor += DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Fill `[windowStart, windowEnd)` with back-to-back intervals of `durationMinutes`.
 * A trailing gap shorter than the duration is dropped rather than shortened.
 */
export function buildCandidates(
  date: string,
  windowStart: string,
  windowEnd: string,
  durationMinutes: number,
): CandidateSlot[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError(
      `durationMinutes must be a positive integer, received ${durationMinutes}.`,
    );
  }

  const dayStart = parseCalendarDate(date).getTime();
  const windowEndMs = dayStart + clockTimeToMinutes(windowEnd) * MINUTE_MS;
  const stepMs = durationMinutes * MINUTE_MS;

  const candidates: CandidateSlot[] = [];
  let cursor = dayStart + clockTimeToMinutes(windowStart) * MINUTE_MS;

  while (cursor + stepMs <= windowEndMs) {
    candidates.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + stepMs) });
    cursor += stepMs;
  }

  return candidates;
}

export function overlaps(a: CandidateSlot, b: { startsAt: Date; endsAt: Date }): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}
