export const ErrorCode = {
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export class SlotUnavailableError extends Error {
  readonly code = ErrorCode.SLOT_UNAVAILABLE;
  readonly slotId: string;

  constructor(slotId: string) {
    super("The selected time slot is no longer available.");
    this.name = "SlotUnavailableError";
    this.slotId = slotId;
  }
}

export function isSlotUnavailableError(
  error: unknown,
): error is SlotUnavailableError {
  return (
    error instanceof SlotUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: unknown }).name === "SlotUnavailableError" &&
      "slotId" in error &&
      typeof (error as { slotId: unknown }).slotId === "string")
  );
}
