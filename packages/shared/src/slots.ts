import { z } from "zod";

/** Maximum number of UTC calendar days a single generate request may cover. */
export const MAX_GENERATE_RANGE_DAYS = 31;

const slotStatusSchema = z.enum(["AVAILABLE", "BOOKED", "BLOCKED"]);

export type SlotStatusValue = z.infer<typeof slotStatusSchema>;

/** `YYYY-MM-DD` UTC calendar date, rejecting impossible days such as 2026-02-30. */
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Expected an existing calendar date.");

/** `HH:mm` UTC clock time. */
const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected an HH:mm UTC time.");

export function parseCalendarDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function clockTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Optional filters for GET /slots. */
export const listSlotsQuerySchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    status: slotStatusSchema.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from !== undefined && value.to !== undefined) {
      if (new Date(value.from).getTime() >= new Date(value.to).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: "`from` must be earlier than `to`.",
        });
      }
    }
  });

export type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>;

/**
 * Bulk generation request. `startDate`/`endDate` are inclusive UTC calendar dates,
 * `windowStart`/`windowEnd` are UTC clock times with an exclusive end.
 */
export const generateSlotsBodySchema = z
  .object({
    serviceId: z.string().uuid(),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    windowStart: clockTimeSchema.default("09:00"),
    windowEnd: clockTimeSchema.default("17:00"),
  })
  .superRefine((value, ctx) => {
    const start = parseCalendarDate(value.startDate).getTime();
    const end = parseCalendarDate(value.endDate).getTime();

    if (start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "`startDate` must not be after `endDate`.",
      });
    } else {
      const days = Math.floor((end - start) / 86_400_000) + 1;
      if (days > MAX_GENERATE_RANGE_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: `The range must not exceed ${MAX_GENERATE_RANGE_DAYS} days.`,
        });
      }
    }

    if (clockTimeToMinutes(value.windowStart) >= clockTimeToMinutes(value.windowEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowStart"],
        message: "`windowStart` must be earlier than `windowEnd`.",
      });
    }
  });

export type GenerateSlotsBody = z.infer<typeof generateSlotsBodySchema>;

/**
 * POST /slots/generate response. `created` is only the rows this request inserted
 * (always AVAILABLE). `slots` is every slot overlapping the generated windows,
 * including BOOKED/BLOCKED rows that already existed.
 */
export type GenerateSlotsResponse<TSlot> = {
  created: TSlot[];
  slots: TSlot[];
};

export const slotIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type SlotIdParams = z.infer<typeof slotIdParamsSchema>;

/** Providers may only block or unblock a slot; BOOKED is owned by the booking flow. */
export const updateSlotBodySchema = z.object({
  status: z.enum(["BLOCKED", "AVAILABLE"]),
});

export type UpdateSlotBody = z.infer<typeof updateSlotBodySchema>;
