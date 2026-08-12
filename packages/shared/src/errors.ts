export const ErrorCode = {
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
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
