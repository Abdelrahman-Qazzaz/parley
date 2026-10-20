import { Hono } from "hono";
import * as conversationsController from "../controllers/conversations.controller";
import { conversationRateLimiter } from "../middleware/rateLimit.middleware";
import { requireAuth, type AuthEnv } from "../middleware/auth.middleware";
import { messagesRouter } from "./messages.router";

export const conversationsRouter = new Hono<AuthEnv>();

conversationsRouter.use("*", requireAuth, conversationRateLimiter);

conversationsRouter.get(
  "/",
  ...conversationsController.handleListConversations,
);

conversationsRouter.post(
  "/",
  ...conversationsController.handleCreateConversation,
);

conversationsRouter.get(
  "/:conversationId",
  ...conversationsController.handleGetConversation,
);

conversationsRouter.patch(
  "/:conversationId",
  ...conversationsController.handlePatchConversation,
);

conversationsRouter.delete(
  "/:conversationId",
  ...conversationsController.handleDeleteConversation,
);

conversationsRouter.route("/:conversationId/messages", messagesRouter);
