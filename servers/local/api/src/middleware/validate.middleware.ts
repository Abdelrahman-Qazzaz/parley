import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { ZodSchema, ZodType, ZodTypeDef } from "zod";

export function validateReqParams<T extends Record<string, unknown>>(
  schema: ZodSchema<T>,
) {
  return createMiddleware(async (c, next) => {
    const result = schema.safeParse(c.req.param());
    if (!result.success) {
      return c.json({ message: "Invalid request parameters" }, 400);
    }
    applyValidated(c, result.data);

    await next();
  });
}

export function validateReqBody<T extends Record<string, unknown>>(
  // Input type is free so preprocess/transform schemas (e.g. coercing an empty
  // body to {}) satisfy the constraint; the output stays a CTX-keyed record.
  schema: ZodType<T, ZodTypeDef, unknown>,
) {
  return createMiddleware(async (c, next) => {
    const body = await c.req.json().catch(() => null);
    // safeParseAsync (not safeParse) so schemas with async refinements — e.g.
    // youtubeUploadSchema validating models via validateModel — work here too.
    const result = await schema.safeParseAsync(body);
    if (!result.success) {
      // Surface the schema's own message (e.g. "Not a valid YouTube URL"); a
      // generic string would make every custom message in the schema dead code.
      const issue = result.error.issues[0];
      return c.json({ message: issue?.message ?? "Invalid request body" }, 400);
    }

    applyValidated(c, result.data);

    await next();
  });
}

/**
 * A multipart form, files included. bodyLimit ahead of it keeps an oversized
 * upload from being read into memory at all.
 */
export function validateReqForm<T extends Record<string, unknown>>(
  schema: ZodType<T, ZodTypeDef, unknown>,
) {
  return createMiddleware(async (c, next) => {
    let form: unknown;
    try {
      form = await c.req.parseBody();
    } catch (error) {
      // A body over bodyLimit's cap fails mid-read; its error has to reach
      // bodyLimit, which answers 413, rather than read as a malformed form.
      if (error instanceof Error && error.name === "BodyLimitError")
        throw error;
      form = null;
    }
    const result = await schema.safeParseAsync(form);
    if (!result.success) {
      const issue = result.error.issues[0];
      return c.json({ message: issue?.message ?? "Invalid form" }, 400);
    }

    applyValidated(c, result.data);

    await next();
  });
}

export function validateReqQuery<T extends Record<string, unknown>>(
  schema: ZodSchema<T>,
) {
  return createMiddleware(async (c, next) => {
    const body = c.req.query();
    const result = schema.safeParse(body);
    if (!result.success)
      return c.json({ message: "Invalid request query" }, 400);

    applyValidated(c, result.data);

    await next();
  });
}

function applyValidated(c: Context, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) c.set(key, value);
}
