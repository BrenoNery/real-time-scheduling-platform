export const ErrorCode = {
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  SLOT_NOT_MUTABLE: "SLOT_NOT_MUTABLE",
  NOT_FOUND: "NOT_FOUND",
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

export function isSlotUnavailableError(error: unknown): error is SlotUnavailableError {
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

/**
 * A slot exists but its current status forbids the requested transition — a BOOKED
 * slot cannot be blocked or unblocked. Distinct from SLOT_UNAVAILABLE, which the
 * booking flow uses when a slot cannot be taken.
 */
export class SlotNotMutableError extends Error {
  readonly code = ErrorCode.SLOT_NOT_MUTABLE;
  readonly slotId: string;
  readonly slotStatus: string;

  constructor(slotId: string, slotStatus: string) {
    super(`Slot is ${slotStatus} and can only be changed through the booking flow.`);
    this.name = "SlotNotMutableError";
    this.slotId = slotId;
    this.slotStatus = slotStatus;
  }
}

export function isSlotNotMutableError(error: unknown): error is SlotNotMutableError {
  return (
    error instanceof SlotNotMutableError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: unknown }).name === "SlotNotMutableError" &&
      "slotId" in error &&
      typeof (error as { slotId: unknown }).slotId === "string")
  );
}

export class NotFoundError extends Error {
  readonly code = ErrorCode.NOT_FOUND;
  readonly resource: string;
  readonly resourceId: string;

  constructor(resource: string, resourceId: string, message?: string) {
    super(message ?? `${resource} not found.`);
    this.name = "NotFoundError";
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return (
    error instanceof NotFoundError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: unknown }).name === "NotFoundError" &&
      "resource" in error &&
      typeof (error as { resource: unknown }).resource === "string" &&
      "resourceId" in error &&
      typeof (error as { resourceId: unknown }).resourceId === "string")
  );
}
