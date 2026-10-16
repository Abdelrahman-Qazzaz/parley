import { Hono } from "hono";
import * as messagesController from "../controllers/messages.controller";
import type { AuthEnv } from "../middleware/auth.middleware";
import { httpCache } from "@parley/shared/cache.middleware";

export const messagesRouter = new Hono<AuthEnv>();

messagesRouter.get(
  "/",
  httpCache({ revalidate: true }),
  ...messagesController.handleListMessages,
);

messagesRouter.delete("/:messageId", ...messagesController.handleDeleteMessage);

messagesRouter.post("/", ...messagesController.handleCreateMessage);

messagesRouter.patch("/:messageId", ...messagesController.handlePatchMessage);
