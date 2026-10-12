import type { Server } from "../../api/server";

/**
 * Where a server's section of the app lives, and a conversation in it.
 * Conversation ids are the server's own, so a path always says which server
 * it belongs to.
 */
export function sectionPath(server: Server, conversationId?: string): string {
  return conversationId
    ? `${server.appPath}/${conversationId}`
    : server.appPath;
}
