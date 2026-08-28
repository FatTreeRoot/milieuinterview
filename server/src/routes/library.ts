import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { interviewTypeInputSchema } from "@milieu/shared";
import { parseBody, requireUser } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import {
  createType,
  deleteType,
  duplicateType,
  getType,
  listTypes,
  reorderTypes,
  setArchived,
  updateType,
} from "../lib/library.js";

const idParams = z.object({ id: z.string().min(1) });

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/types", async (request) => {
    requireUser(request);
    const includeArchived =
      (request.query as { archived?: string }).archived === "true";
    return { types: listTypes(includeArchived) };
  });

  app.get("/api/types/:id", async (request) => {
    requireUser(request);
    const { id } = idParams.parse(request.params);
    return { type: getType(id) };
  });

  app.post("/api/types", async (request) => {
    const user = requireUser(request);
    const body = parseBody(interviewTypeInputSchema, request.body);
    const typeId = createType(body);
    audit(user.id, "create", "interview_type", typeId, { name: body.name });
    return { type: getType(typeId) };
  });

  app.put("/api/types/:id", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const body = parseBody(interviewTypeInputSchema, request.body);
    updateType(id, body);
    audit(user.id, "update", "interview_type", id, { name: body.name });
    return { type: getType(id) };
  });

  app.post("/api/types/:id/duplicate", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const copyId = duplicateType(id);
    audit(user.id, "duplicate", "interview_type", copyId, { from: id });
    return { type: getType(copyId) };
  });

  app.post("/api/types/:id/archive", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const { archived } = parseBody(
      z.object({ archived: z.boolean() }),
      request.body,
    );
    setArchived(id, archived);
    audit(user.id, archived ? "archive" : "unarchive", "interview_type", id);
    return { type: getType(id) };
  });

  app.delete("/api/types/:id", async (request) => {
    const user = requireUser(request);
    const { id } = idParams.parse(request.params);
    const type = getType(id);
    deleteType(id);
    audit(user.id, "delete", "interview_type", id, { name: type.name });
    return { ok: true };
  });

  app.post("/api/types/reorder", async (request) => {
    const user = requireUser(request);
    const { ids } = parseBody(
      z.object({ ids: z.array(z.string().min(1)) }),
      request.body,
    );
    reorderTypes(ids);
    audit(user.id, "reorder", "interview_type", null, { count: ids.length });
    return { ok: true };
  });
}
