import { z } from "zod";
import type {
  CreateConversationBody,
  RenameConversationBody,
} from "@parley/shared/contract";
import { takesBody } from "@parley/shared/takesBody";
import { CTX_KEYS } from "../../../shared/keys";

const MAX_TITLE_LENGTH = 200;

export const conversationReqParamSchema = z.object({
  [CTX_KEYS.conversationId]: z.string().uuid(),
});

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title must not be empty")
  .max(MAX_TITLE_LENGTH, "Title is too long");

/**
 * Body for POST /conversations. Title is optional (the DB default applies), and
 * an empty/absent body parses as `null` in validateReqBody, so coerce it to {}.
 */
export const conversationCreateBodySchema = takesBody<CreateConversationBody>()(
  z.preprocess(
    (body) => body ?? {},
    z.object({
      [CTX_KEYS.conversationTitle]: titleSchema.optional(),
    }),
  ),
);

/** Body for PATCH /conversations/:id — renaming requires a title. */
export const conversationPatchBodySchema = takesBody<RenameConversationBody>()(
  z.object({
    [CTX_KEYS.conversationTitle]: titleSchema,
  }),
);
