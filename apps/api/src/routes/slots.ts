import type { FastifyInstance } from "fastify";
import {
  ErrorCode,
  apiError,
  generateSlotsBodySchema,
  isNotFoundError,
  isSlotNotMutableError,
  listSlotsQuerySchema,
  slotIdParamsSchema,
  updateSlotBodySchema,
} from "@repo/shared";
import { SlotService } from "../services/slot.service.js";

export function registerSlotRoutes(app: FastifyInstance): void {
  const slotService = new SlotService(app.prisma);

  app.get("/slots", async (request, reply) => {
    const parsed = listSlotsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid slot list query.", {
          issues: parsed.error.issues,
        }),
      );
    }

    const slots = await slotService.listSlots(parsed.data);
    return reply.status(200).send(slots);
  });

  app.post("/slots/generate", async (request, reply) => {
    const parsed = generateSlotsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid slot generation request body.", {
          issues: parsed.error.issues,
        }),
      );
    }

    try {
      const slots = await slotService.generateSlots(parsed.data);
      return reply.status(201).send(slots);
    } catch (err) {
      if (isNotFoundError(err)) {
        return reply.status(404).send(
          apiError(ErrorCode.NOT_FOUND, err.message, {
            resource: err.resource,
            id: err.resourceId,
          }),
        );
      }

      throw err;
    }
  });

  app.patch("/slots/:id", async (request, reply) => {
    const parsedParams = slotIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid slot id.", {
          issues: parsedParams.error.issues,
        }),
      );
    }

    const parsedBody = updateSlotBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(422).send(
        apiError(ErrorCode.VALIDATION_ERROR, "Invalid slot update body.", {
          issues: parsedBody.error.issues,
        }),
      );
    }

    try {
      const slot = await slotService.updateSlotStatus(parsedParams.data.id, parsedBody.data);
      return reply.status(200).send(slot);
    } catch (err) {
      if (isNotFoundError(err)) {
        return reply.status(404).send(
          apiError(ErrorCode.NOT_FOUND, err.message, {
            resource: err.resource,
            id: err.resourceId,
          }),
        );
      }

      if (isSlotNotMutableError(err)) {
        return reply.status(409).send(
          apiError(ErrorCode.SLOT_NOT_MUTABLE, err.message, {
            slotId: err.slotId,
            status: err.slotStatus,
          }),
        );
      }

      throw err;
    }
  });
}
