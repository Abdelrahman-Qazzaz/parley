import type { Server } from "../../api/server";

/**
 * Where a server's section of the app lives, and a conversation in it: /chat
 * for the cloud, /local for this computer. Conversation ids are the server's
 * own, so a path always says which server it belongs to.
 */
export function sectionPath(server: Server, conversationId?: string): string {
  const base = server.id === "cloud" ? "/chat" : "/local";
  return conversationId ? `${base}/${conversationId}` : base;
}
